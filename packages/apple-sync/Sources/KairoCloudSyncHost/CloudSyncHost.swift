import Foundation
import KairoAppleSync
#if os(macOS)
import AppKit
import Darwin

private actor NativeControlReader {
    let fd: Int32
    var decoder = JournalRPCFrameDecoder(limits: NativeBootstrapControlRequest.limits)
    init(fd: Int32) throws {
        let flags = fcntl(fd, F_GETFL)
        guard flags >= 0, fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0 else { throw JournalRPCError.ioFailure }
        self.fd = fd
    }
    func next() async throws -> Data {
        var bytes = [UInt8](repeating: 0, count: 4096)
        while true {
            try Task.checkCancellation()
            let count = Darwin.read(fd, &bytes, bytes.count)
            if count == 0 { try decoder.endOfInput(); throw JournalRPCError.connectionLost }
            if count < 0 {
                if errno == EINTR { continue }
                if errno == EAGAIN || errno == EWOULDBLOCK { try await Task.sleep(for: .milliseconds(5)); continue }
                throw JournalRPCError.ioFailure
            }
            let frames = try decoder.append(Data(bytes.prefix(count)))
            if let frame = frames.first { return frame }
        }
    }
}

private actor NativeControlWriter {
    let fd: Int32
    var terminal = false
    init(fd: Int32) throws {
        let flags = fcntl(fd, F_GETFL)
        guard flags >= 0, fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0,
              fcntl(fd, F_SETNOSIGPIPE, 1) == 0 else { throw JournalRPCError.ioFailure }
        self.fd = fd
    }
    func send(_ bytes: Data, current: (@Sendable () -> Bool)? = nil, terminal: Bool = false) async throws {
        guard !self.terminal else { throw JournalRPCError.connectionLost }
        // Actor reentrancy during a pipe wait cannot interleave control frames.
        self.terminal = true
        let frame = try JournalRPCFrameDecoder.frame(bytes, limits: NativeBootstrapControlRequest.limits)
        var at = 0
        let deadline = ContinuousClock.now.advanced(by: .seconds(2))
        while at < frame.count {
            try Task.checkCancellation()
            guard current?() != false else { throw NativeBootstrapError.staleChallenge }
            let count = frame.withUnsafeBytes { Darwin.write(fd, $0.baseAddress!.advanced(by: at), frame.count - at) }
            if count < 0 {
                if errno == EINTR { continue }
                if errno == EAGAIN || errno == EWOULDBLOCK {
                    guard ContinuousClock.now < deadline else { throw JournalRPCError.ioFailure }
                    try await Task.sleep(for: .milliseconds(5)); continue
                }
                throw JournalRPCError.ioFailure
            }
            guard count > 0 else { throw JournalRPCError.ioFailure }
            at += count
        }
        self.terminal = terminal
    }
}

@main
private struct KairoCloudSyncHost {
    @MainActor
    static func main() async {
        var request: NativeBootstrapControlRequest?
        var writer: NativeControlWriter?
        do {
            guard CommandLine.arguments.count == 1 else { throw NativeBootstrapError.invalidControl }
            let reader = try NativeControlReader(fd: 3)
            let output = try NativeControlWriter(fd: 4); writer = output
            let input = try NativeBootstrapControlRequest.decode(await reader.next()); request = input
            // Entitlement admission precedes CKContainer construction, account
            // calls, Keychain I/O and native UI. There is no QA grant bypass.
            let bootstrap = try NativeCloudSyncBootstrap(containerIdentifier: input.containerIdentifier,
                keychainService: input.keychainService)
            defer { bootstrap.revoke(.shutdown) }
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask {
                    do {
                        let bytes = try await reader.next()
                        try input.validateRevocation(bytes)
                        bootstrap.revoke(.logout)
                        throw NativeBootstrapError.cancelled
                    } catch {
                        bootstrap.revoke(.connectionLost)
                        throw error
                    }
                }
                group.addTask {
                    try await withTaskCancellationHandler {
                        let deadline = Task {
                            do { try await Task.sleep(for: .seconds(300)) }
                            catch { return }
                            bootstrap.revoke(.nativeSessionLost)
                            await abortConfirmation()
                        }
                        defer { deadline.cancel() }
                        let challenge = try await bootstrap.begin(profile: input.profile, connectionID: input.connectionID)
                        try Task.checkCancellation()
                        guard await confirm(challenge) else { throw NativeBootstrapError.cancelled }
                        try Task.checkCancellation()
                        let connection = try await bootstrap.complete(challenge,
                            decision: challenge.requiresPairing ? .pairNew : .connectExisting)
                        defer { connection.invalidate(.shutdown) }
                        try connection.setInvalidationHandler { reason in
                            Task { try? await output.send(input.revoked(reason), terminal: true) }
                        }
                        try await output.send(input.ready(connection), current: { connection.isCurrent })
                        deadline.cancel()
                        try await JournalRPCStdioServer.run(input: .standardInput, output: .standardOutput,
                            adapter: connection.adapter, connectionID: connection.connectionID)
                    } onCancel: {
                        bootstrap.revoke(.connectionLost)
                        Task { await abortConfirmation() }
                    }
                }
                defer { group.cancelAll(); bootstrap.revoke(.shutdown) }
                _ = try await group.next()
            }
        } catch {
            if let writer {
                let bytes = try? request?.failure(error) ?? NativeBootstrapControlRequest.invalidRequest(error)
                if let bytes { try? await writer.send(bytes, terminal: true) }
            }
            exit(EXIT_FAILURE)
        }
    }

    @MainActor private static func abortConfirmation() {
        if NSApplication.shared.modalWindow != nil { NSApplication.shared.abortModal() }
    }

    @MainActor private static func confirm(_ challenge: NativePairingChallenge) -> Bool {
        let application = NSApplication.shared
        application.setActivationPolicy(.accessory)
        let alert = NSAlert()
        alert.messageText = challenge.requiresPairing ? "Pair this learner profile with iCloud?" : "Connect this learner profile to iCloud?"
        let action = challenge.requiresPairing
            ? "Pairing permits this iCloud account to synchronize the displayed profile. Its private journal zone will be created if absent."
            : "This device has a saved pairing for the displayed profile and current iCloud account."
        alert.informativeText = "\(challenge.profile.label)\n\nAccount ID: \(challenge.profile.scope.accountID)\nLearner ID: \(challenge.profile.scope.learnerID)\n\niCloud account fingerprint: \(challenge.account.fingerprint)\nContainer: \(challenge.account.containerIdentifier)\n\n\(action)"
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: challenge.requiresPairing ? "Pair and Connect" : "Connect")
        alert.buttons[0].keyEquivalent = "\r"
        alert.buttons[1].keyEquivalent = ""
        application.activate(ignoringOtherApps: true)
        return alert.runModal() == .alertSecondButtonReturn
    }
}
#else
@main
private struct KairoCloudSyncHost {
    static func main() { fatalError("The stdio helper is macOS-only; embed KairoAppleSync in the native iOS host.") }
}
#endif
