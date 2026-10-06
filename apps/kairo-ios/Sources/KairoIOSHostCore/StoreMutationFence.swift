import Foundation

/// One actual WebKit document owns this fence. Registration replacement and
/// reconnect retain it; only reopening the record in a new document creates a
/// new fence. A late reply cannot clear uncertainty recorded by invalidation.
@MainActor
public final class IOSStoreMutationFence {
    public private(set) var pending = false
    public private(set) var requiresReopen = false
    public init() {}
    public func submit() throws {
        guard !requiresReopen else { throw IOSSyncError("reopen-required", targetCommitDurable: true) }
        guard !pending else { throw IOSSyncError("busy") }
        pending = true
    }
    public func confirm() { pending = false }
    public func invalidate() { if pending { requiresReopen = true } }
    public func markUncertain() { requiresReopen = true }
}
