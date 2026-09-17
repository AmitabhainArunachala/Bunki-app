import CloudKit
import Foundation

public enum JournalRPCInvalidationReason: String, Sendable {
    case accountChanged = "account-changed", profileChanged = "profile-changed"
    case nativeSessionLost = "native-session-lost"
    case logout, connectionLost = "connection-lost", replaced, shutdown
}

struct RPCCapture: Sendable {
    let session: JournalSession
    let connectionID: UUID
    let leaseID: UUID
    var lease: String { leaseID.uuidString.lowercased() }
    var descriptor: JournalRPCSessionDescriptor {
        JournalRPCSessionDescriptor(leaseId: lease, scope: session.scope, channelId: session.channelID)
    }
}
struct RPCRevocation: Sendable {
    let capture: RPCCapture
    let reason: JournalRPCInvalidationReason
}

/// Only trusted Swift lifecycle code attaches a session returned by the native
/// transport. Wire messages can neither call attach nor select its scope.
/// The lock never covers I/O, actor awaits, task settlement or caller callbacks.
public final class JournalRPCSessionGate: @unchecked Sendable {
    private let lock = NSLock()
    private var active: RPCCapture?
    private var observer: (any NSObjectProtocol)?
    private var handler: (@Sendable (RPCRevocation) -> Void)?
    private var handlerID: UUID?

    public convenience init() { self.init(observeAccountChanges: true) }
    init(observeAccountChanges: Bool) {
        if observeAccountChanges {
            observer = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: nil) { [weak self] _ in
                self?.revoke(.accountChanged)
            }
        }
    }
    deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }

    public func attach(_ session: JournalSession, connectionID: UUID) throws -> JournalRPCSessionDescriptor {
        guard validID(session.scope.accountID), validID(session.scope.learnerID),
              validID(session.channelID) else { throw JournalRPCError.sessionRequired }
        let next = RPCCapture(session: session, connectionID: connectionID, leaseID: UUID())
        let prior = lock.withLock { () -> (RPCCapture?, (@Sendable (RPCRevocation) -> Void)?) in
            let old = active; active = next; return (old, handler)
        }
        if let old = prior.0 { prior.1?(RPCRevocation(capture: old, reason: .replaced)) }
        return next.descriptor
    }
    public func revoke(_ reason: JournalRPCInvalidationReason) { revoke(reason, connectionID: nil) }
    func revoke(_ reason: JournalRPCInvalidationReason, connectionID: UUID?) {
        let prior = lock.withLock { () -> (RPCCapture?, (@Sendable (RPCRevocation) -> Void)?) in
            guard let current = active, connectionID == nil || current.connectionID == connectionID else { return (nil, nil) }
            active = nil; return (current, handler)
        }
        if let old = prior.0 { prior.1?(RPCRevocation(capture: old, reason: reason)) }
    }
    // An asynchronous native failure may belong to an older attachment.
    // Only revoke the exact capture that produced that failure.
    func revokeCaptured(_ capture: RPCCapture, reason: JournalRPCInvalidationReason) {
        let prior = lock.withLock { () -> (RPCCapture?, (@Sendable (RPCRevocation) -> Void)?) in
            guard let current = active, current.leaseID == capture.leaseID,
                  current.connectionID == capture.connectionID else { return (nil, nil) }
            active = nil; return (current, handler)
        }
        if let old = prior.0 { prior.1?(RPCRevocation(capture: old, reason: reason)) }
    }
    func capture(connectionID: UUID, lease: String? = nil) throws -> RPCCapture {
        try lock.withLock {
            guard let current = active else { throw JournalRPCError.sessionRequired }
            guard current.connectionID == connectionID else { throw JournalRPCError.wrongConnection }
            guard lease == nil || current.lease == lease else { throw JournalRPCError.staleSession }
            return current
        }
    }
    func isCurrent(_ capture: RPCCapture) -> Bool {
        lock.withLock { active?.leaseID == capture.leaseID && active?.connectionID == capture.connectionID }
    }
    // Only a bounded queue insertion may run here; no caller-provided callback.
    func enqueueIfCurrent(_ capture: RPCCapture, packet: RPCPacket, outbox: RPCOutbox) -> Bool? {
        lock.withLock {
            guard active?.leaseID == capture.leaseID, active?.connectionID == capture.connectionID else { return nil }
            return outbox.enqueue(packet)
        }
    }
    func install(_ callback: @escaping @Sendable (RPCRevocation) -> Void) throws -> UUID {
        try lock.withLock {
            guard handler == nil else { throw JournalRPCError.busy }
            let id = UUID(); handlerID = id; handler = callback; return id
        }
    }
    func remove(_ id: UUID) { lock.withLock { if handlerID == id { handlerID = nil; handler = nil } } }
}

struct RPCPacket: Sendable {
    let bytes: Data
    let capture: RPCCapture?
    let staleBytes: Data?
}

/// A single consumer and a fixed queue. Closing resumes a held reader. Enqueue
/// never blocks on stdout; revocation never waits for a pipe to become writable.
final class RPCOutbox: @unchecked Sendable {
    private let lock = NSLock()
    private let limit: Int
    private var values: [RPCPacket] = []
    private var waiter: CheckedContinuation<RPCPacket?, Never>?
    private var closed = false
    private var stdioRevoked = false
    init(limit: Int) { self.limit = limit }
    var isClosed: Bool { lock.withLock { closed } }
    var mayContinueStdio: Bool { lock.withLock { !closed && !stdioRevoked } }
    func revokeStdio() { lock.withLock { stdioRevoked = true } }
    func enqueue(_ value: RPCPacket) -> Bool {
        var wake: CheckedContinuation<RPCPacket?, Never>?
        let accepted = lock.withLock { () -> Bool in
            guard !closed else { return false }
            if let waiting = waiter { waiter = nil; wake = waiting; return true }
            guard values.count < limit else { return false }
            values.append(value); return true
        }
        wake?.resume(returning: value)
        return accepted
    }
    func close() {
        let wake = lock.withLock { () -> CheckedContinuation<RPCPacket?, Never>? in
            closed = true; values = []; let old = waiter; waiter = nil; return old
        }
        wake?.resume(returning: nil)
    }
    func next() async -> RPCPacket? {
        await withCheckedContinuation { continuation in
            var immediate: RPCPacket?
            var finish = false
            lock.withLock {
                if closed { finish = true }
                else if !values.isEmpty { immediate = values.removeFirst(); finish = true }
                else if waiter == nil { waiter = continuation }
                else { finish = true } // A second consumer is not an additional output channel.
            }
            if finish { continuation.resume(returning: immediate) }
        }
    }
}

final class RPCWorkCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var task: Task<Void, Never>?
    private var id: String?
    private var leaseID: UUID?
    func set(_ next: Task<Void, Never>, id: String, leaseID: UUID) { lock.withLock { task = next; self.id = id; self.leaseID = leaseID } }
    func clear(_ id: String) { lock.withLock { if self.id == id { task = nil; self.id = nil; leaseID = nil } } }
    func cancel(leaseID: UUID? = nil) {
        let current = lock.withLock { leaseID == nil || self.leaseID == leaseID ? task : nil }
        current?.cancel()
    }
}
