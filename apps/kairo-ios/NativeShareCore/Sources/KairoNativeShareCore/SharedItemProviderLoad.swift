import Foundation

/// One loader handles exactly one attachment and one explicitly offered file
/// representation. It never keeps a file, fetches a URL or decodes a bitmap.
/// Its lock protects all mutable state; callbacks run outside that lock.
public final class SharedItemProviderLoad: @unchecked Sendable {
    public typealias Completion = @Sendable (Result<SharedFileCandidate, SharedFileError>) -> Void
    private enum Phase { case idle, waiting, reading, finished }
    private let lock = NSLock()
    private var phase = Phase.idle
    private var completion: Completion?
    private var progress: Progress?
    private var deadline: DispatchWorkItem?
    private var stopped: SharedFileError?

    public init(completion: @escaping Completion) { self.completion = completion }

    /// Remains busy if cancellation fences an already-running file read. A
    /// replacement job must not use callback cancellation as proof that old I/O
    /// has stopped. Ordinary chunks check cancellation; this is not an OS-level
    /// hard deadline for a stalled filesystem or provider process.
    public var isBusy: Bool {
        lock.lock(); defer { lock.unlock() }
        return phase == .waiting || phase == .reading
    }

    public func start(attachments: [NSItemProvider], timeout: TimeInterval = SharedFileLimits.providerSeconds) {
        lock.lock()
        guard phase == .idle else { lock.unlock(); return }
        phase = .waiting
        lock.unlock()
        guard attachments.count == 1, let provider = attachments.first else { finishEarly(.attachmentCount); return }
        guard let type = provider.registeredTypeIdentifiers.first(where: SharedFileLimits.representations.contains) else {
            finishEarly(.unsupportedRepresentation); return
        }
        let name = provider.suggestedName
        if let name {
            do { try SharedFileCandidate.validate(name: name, offeredType: type) }
            catch { finishEarly(.invalidInput); return }
        }
        let timer = DispatchWorkItem { [weak self] in self?.finishEarly(.timeout) }
        lock.lock()
        guard phase == .waiting else { lock.unlock(); return }
        deadline = timer
        lock.unlock()
        let seconds = timeout.isFinite && timeout > 0 && timeout <= SharedFileLimits.providerSeconds ? timeout : SharedFileLimits.providerSeconds
        DispatchQueue.global().asyncAfter(deadline: .now() + seconds, execute: timer)
        let loading = provider.loadFileRepresentation(forTypeIdentifier: type) { [self] url, error in
            lock.lock()
            guard phase == .waiting else { lock.unlock(); return }
            phase = .reading
            lock.unlock()
            let result: Result<SharedFileCandidate, SharedFileError>
            do {
                guard error == nil, let url else { throw SharedFileError.providerUnavailable }
                result = .success(try SharedFileCandidate.readSelectedFile(url, name: name, offeredType: type, cancelled: {
                    self.lock.lock(); defer { self.lock.unlock() }; return self.stopped != nil
                }))
            } catch { result = .failure((error as? SharedFileError) ?? .providerUnavailable) }
            lock.lock()
            let callback = completion
            let final = stopped.map { Result<SharedFileCandidate, SharedFileError>.failure($0) } ?? result
            phase = .finished; completion = nil; progress = nil
            let timer = deadline; deadline = nil
            lock.unlock()
            timer?.cancel()
            callback?(final)
        }
        lock.lock()
        let stop = phase == .finished || stopped != nil
        if !stop { progress = loading }
        lock.unlock()
        if stop { loading.cancel() }
    }

    public func cancel() { finishEarly(.cancelled) }

    private func finishEarly(_ error: SharedFileError) {
        lock.lock()
        guard phase != .finished else { lock.unlock(); return }
        if stopped == nil { stopped = error }
        let loading = progress; progress = nil
        let timer = deadline; deadline = nil
        let callback = phase == .reading ? nil : completion
        if phase != .reading { phase = .finished; completion = nil }
        lock.unlock()
        timer?.cancel(); loading?.cancel()
        callback?(.failure(error))
    }
}
