import Foundation
import Network

/// One serial queue owns listener and connections. Only the immutable bundled
/// catalog is exposed; this server has no learner files or write endpoints.
public final class LoopbackServer: @unchecked Sendable {
    private let queue = DispatchQueue(label: "app.bunki.ios.loopback")
    private let catalog: AssetCatalog
    private let port: UInt16
    private var listener: NWListener?
    private var clients: [UUID: NWConnection] = [:]
    private var completion: (@Sendable (Result<Void, Error>) -> Void)?

    public init(catalog: AssetCatalog, port: UInt16 = HostPolicy.port) {
        self.catalog = catalog; self.port = port
    }

    public func start(completion: @escaping @Sendable (Result<Void, Error>) -> Void) {
        queue.async {
            guard self.listener == nil else { completion(.failure(HostError.occupiedPort)); return }
            do {
                let parameters = NWParameters.tcp
                // Do not use .any, an ephemeral port, or local-link-only as a
                // substitute for an exact IPv4 loopback bind.
                parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: self.port)!)
                parameters.allowLocalEndpointReuse = false
                let listener = try NWListener(using: parameters)
                self.listener = listener
                self.completion = completion
                listener.stateUpdateHandler = { [weak self, weak listener] state in
                    guard let self, let listener, self.listener === listener else { return }
                    switch state {
                    case .ready: self.finish(.success(()))
                    case .failed(let error), .waiting(let error):
                        self.finish(.failure(error)); self.stopOnQueue()
                    case .cancelled: self.finish(.failure(HostError.unavailable))
                    default: break
                    }
                }
                listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
                listener.start(queue: self.queue)
                self.queue.asyncAfter(deadline: .now() + 5) { [weak self, weak listener] in
                    guard let self, let listener, self.listener === listener, self.completion != nil else { return }
                    self.finish(.failure(HostError.unavailable)); self.stopOnQueue()
                }
            } catch { self.finish(.failure(error)); completion(.failure(error)) }
        }
    }

    public func stop() { queue.async { self.stopOnQueue() } }

    private func finish(_ result: Result<Void, Error>) {
        let callback = completion; completion = nil; callback?(result)
    }

    private func stopOnQueue() {
        listener?.cancel(); listener = nil
        for client in clients.values { client.cancel() }
        clients.removeAll()
        finish(.failure(HostError.unavailable))
    }

    private func accept(_ connection: NWConnection) {
        guard clients.count < 32 else { connection.cancel(); return }
        let id = UUID()
        clients[id] = connection
        connection.stateUpdateHandler = { [weak self] state in
            if case .failed = state { self?.close(id) }
            if case .cancelled = state { self?.clients.removeValue(forKey: id) }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 15) { [weak self] in self?.close(id) }
        receive(id, accumulated: Data())
    }

    private func receive(_ id: UUID, accumulated: Data) {
        guard let connection = clients[id] else { return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, complete, error in
            guard let self, self.clients[id] === connection else { return }
            var bytes = accumulated
            if let data { bytes.append(data) }
            if bytes.count > 16_384 { self.send(HTTPResponse(status: 400).encoded(), id: id); return }
            if let marker = bytes.range(of: Data("\r\n\r\n".utf8)) {
                guard marker.upperBound == bytes.endIndex, let request = try? HTTPRequest(bytes) else {
                    self.send(HTTPResponse(status: 400).encoded(), id: id); return
                }
                let response = AssetHTTP.response(request, catalog: self.catalog, port: self.port)
                self.send(response.encoded(headOnly: request.method == "HEAD"), id: id)
            } else if complete || error != nil { self.close(id) }
            else { self.receive(id, accumulated: bytes) }
        }
    }

    private func send(_ data: Data, id: UUID) {
        clients[id]?.send(content: data, completion: .contentProcessed { [weak self] _ in self?.close(id) })
    }

    private func close(_ id: UUID) { clients.removeValue(forKey: id)?.cancel() }
}
