import Foundation

private enum RPCCall: Sendable {
    case push([JournalEnvelope])
    case pull(String?, Int)
}

/// One adapter, gate and connection per native host channel. The host supplies a
/// transport constructed with its real profile authorizer. No RPC opens a session.
public actor JournalRPCAdapter {
    private let transport: ForegroundJournalTransport
    private let sessions: JournalRPCSessionGate
    private let limits: JournalRPCLimits
    private let connectionID: UUID
    private let outbox: RPCOutbox
    private let cancellation: RPCWorkCancellation
    private let listenerID: UUID
    private var lastSequence: UInt64 = 0
    private var active: (id: String, capture: RPCCapture)?

    public init(transport: ForegroundJournalTransport, sessions: JournalRPCSessionGate,
                connectionID: UUID, limits: JournalRPCLimits = try! JournalRPCLimits()) throws {
        let outbox = RPCOutbox(limit: limits.maxQueuedFrames)
        let cancellation = RPCWorkCancellation()
        self.transport = transport; self.sessions = sessions; self.connectionID = connectionID
        self.limits = limits; self.outbox = outbox; self.cancellation = cancellation
        listenerID = try sessions.install { [weak outbox, weak cancellation] event in
            guard event.capture.connectionID == connectionID else { return }
            cancellation?.cancel(leaseID: event.capture.leaseID)
            guard let outbox, !outbox.isClosed else { return }
            outbox.revokeStdio()
            let row: [String: Any] = ["format": "kairo-journal-rpc", "v": 1, "type": "event",
                "event": "session-invalidated", "leaseId": event.capture.lease, "code": event.reason.rawValue]
            guard let bytes = try? rpcEncode(row, limit: limits.maxFrameBytes),
                  outbox.enqueue(RPCPacket(bytes: bytes, capture: nil, staleBytes: nil)) else { outbox.close(); return }
        }
    }
    deinit { sessions.remove(listenerID); cancellation.cancel(); outbox.close() }

    /// Admission is serialized before a task is started. This returns while a
    /// backend is suspended; the next cancel/control request remains serviceable.
    public func submit(_ jsonBytes: Data, from sender: UUID) throws {
        guard sender == connectionID else { throw JournalRPCError.wrongConnection }
        guard !outbox.isClosed else { throw JournalRPCError.connectionLost }
        let request: RPCRequest
        do {
            request = try rpcParse(jsonBytes, limits: limits)
            guard request.sequence > lastSequence else { throw JournalRPCError.invalidFrame }
            lastSequence = request.sequence
        } catch {
            connectionLost(sender)
            throw (error as? JournalRPCError) ?? .invalidFrame
        }
        if request.method == "cancel" {
            let target = try rpcID(request.params["targetId"]).0
            let cancelled = active?.id == target
            if cancelled { cancellation.cancel() }
            try enqueueImmediate(request, lease: cancelled ? active?.capture.lease : nil,
                result: ["targetId": target, "cancelled": cancelled])
            return
        }
        var captured: RPCCapture?
        do {
            let lease = request.params["leaseId"] as? String
            let capture = try sessions.capture(connectionID: connectionID, lease: lease)
            captured = capture
            if request.method == "describe" {
                try enqueueImmediate(request, lease: capture.lease, result: ["leaseId": capture.lease,
                    "scope": ["accountId": capture.session.scope.accountID, "learnerId": capture.session.scope.learnerID],
                    "channelId": capture.session.channelID], capture: capture)
                return
            }
            guard active == nil else { throw JournalRPCError.busy }
            let call: RPCCall
            if request.method == "push" {
                call = .push(try rpcEnvelopes(request.params["envelopes"], scope: capture.session.scope, limits: limits.journal))
            } else {
                call = .pull(request.params["checkpoint"] as? String,
                    try rpcInteger(request.params["limit"], range: 1...limits.journal.maxOperations))
            }
            active = (request.id, capture)
            let id = request.id; let method = request.method
            let task = Task { await self.perform(id: id, method: method, call: call, capture: capture) }
            cancellation.set(task, id: id, leaseID: capture.leaseID)
        } catch {
            try enqueueImmediate(request, lease: captured?.lease ?? request.params["leaseId"] as? String,
                error: rpcErrorCode(error))
        }
    }

    public nonisolated func connectionLost(_ sender: UUID) {
        guard sender == connectionID else { return }
        // Close before the event callback; no output is promised on a lost pipe.
        outbox.close(); sessions.revoke(.connectionLost, connectionID: sender); cancellation.cancel()
    }

    /// One consumer only. A future WK host must still fence navigation/ownership
    /// immediately before resolving its reply handler; returned bytes are not a
    /// durable local acknowledgement or an instantaneous cross-process lease.
    public nonisolated func nextOutput() async -> Data? {
        await nextPacket()?.bytes
    }
    nonisolated func nextPacket() async -> RPCPacket? {
        guard let packet = await outbox.next(), !outbox.isClosed else { return nil }
        if let capture = packet.capture, !sessions.isCurrent(capture) {
            guard let stale = packet.staleBytes else { return nil }
            return RPCPacket(bytes: stale, capture: nil, staleBytes: nil)
        }
        return packet
    }
    nonisolated var framingLimits: JournalRPCLimits { limits }
    nonisolated var mayContinueStdio: Bool { outbox.mayContinueStdio }
    nonisolated func mayWrite(_ packet: RPCPacket) -> Bool {
        outbox.mayContinueStdio && (packet.capture.map { sessions.isCurrent($0) } ?? true)
    }

    private func enqueueImmediate(_ request: RPCRequest, lease: String?, result: [String: Any]? = nil,
                                  error: String? = nil, capture: RPCCapture? = nil) throws {
        let bytes = try rpcReply(id: request.id, method: request.method, lease: lease,
            result: result, error: error, limit: limits.maxFrameBytes)
        let stale = try rpcReply(id: request.id, method: request.method, lease: lease,
            error: JournalRPCError.staleSession.rawValue, limit: limits.maxFrameBytes)
        let packet = RPCPacket(bytes: bytes, capture: capture, staleBytes: stale)
        let accepted: Bool
        if let capture {
            accepted = sessions.enqueueIfCurrent(capture, packet: packet, outbox: outbox)
                ?? outbox.enqueue(RPCPacket(bytes: stale, capture: nil, staleBytes: nil))
        } else { accepted = outbox.enqueue(packet) }
        guard accepted else { connectionLost(connectionID); throw JournalRPCError.connectionLost }
    }
    private func perform(id: String, method: String, call: RPCCall, capture: RPCCapture) async {
        var result: [String: Any]?
        var failure: String?
        do {
            try Task.checkCancellation()
            guard sessions.isCurrent(capture) else { throw JournalRPCError.staleSession }
            switch call {
            case .push(let envelopes):
                let response = try await transport.push(envelopes, session: capture.session)
                result = ["accepted": response.accepted.map(rpcReference),
                    "failures": response.failures.keys.sorted().map { ["opId": $0, "code": response.failures[$0]!.rawValue] }]
            case .pull(let checkpoint, let limit):
                let response = try await transport.pull(checkpoint: checkpoint, limit: limit, session: capture.session)
                // Account for the complete outer reply before allocating base64
                // strings. Base64 has no JSON-escaped characters with our encoder.
                let skeleton: [String: Any] = ["previous": checkpoint as Any? ?? NSNull(),
                    "nextCheckpoint": response.nextCheckpoint, "hasMore": response.hasMore, "envelopes": []]
                var predicted = try rpcReply(id: id, method: method, lease: capture.lease,
                    result: skeleton, limit: limits.maxFrameBytes).count
                for (index, envelope) in response.envelopes.enumerated() {
                    predicted += try rpcEncode(["reference": rpcReference(envelope.reference), "canonicalBase64": ""],
                        limit: limits.maxFrameBytes).count + 4 * ((envelope.bytes.count + 2) / 3) + (index == 0 ? 0 : 1)
                    guard predicted <= limits.maxFrameBytes else { throw JournalRPCError.limitsExceeded }
                }
                result = ["previous": checkpoint as Any? ?? NSNull(), "nextCheckpoint": response.nextCheckpoint,
                    "hasMore": response.hasMore,
                    "envelopes": response.envelopes.map { ["reference": rpcReference($0.reference), "canonicalBase64": $0.bytes.base64EncodedString()] as [String: Any] }]
            }
            try Task.checkCancellation()
            guard sessions.isCurrent(capture) else { throw JournalRPCError.staleSession }
        } catch {
            failure = rpcErrorCode(error); result = nil
            if let native = error as? JournalError,
               [.staleSession, .accountUnavailable, .unauthorizedScope].contains(native) {
                sessions.revokeCaptured(capture, reason: .nativeSessionLost)
            }
        }
        if active?.id == id { active = nil }
        cancellation.clear(id)
        guard !outbox.isClosed else { return }
        let request = RPCRequest(id: id, sequence: 0, method: method, params: [:])
        do {
            try enqueueImmediate(request, lease: capture.lease, result: result, error: failure,
                capture: failure == nil ? capture : nil)
        } catch {
            if error as? JournalRPCError == .limitsExceeded {
                do { try enqueueImmediate(request, lease: capture.lease, error: JournalRPCError.limitsExceeded.rawValue) }
                catch { connectionLost(connectionID) }
            } else { connectionLost(connectionID) }
        }
    }
}
