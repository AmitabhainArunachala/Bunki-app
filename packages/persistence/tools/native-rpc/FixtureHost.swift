import Darwin
import Foundation

// EXTERNAL NO-NETWORK FIXTURE ONLY. Compiled in the same module as the unchanged
// frozen Swift library to access its internal synthetic-backend seam. fd3/fd4
// are test-owned out-of-band grant/control channels, never production RPC.
private let fixtureScope = try! JournalScope(accountID: "account-a", learnerID: "learner-a")
private let fixtureAccount = try! CloudAccountIdentity(
    containerIdentifier: "iCloud.example.kairo-js-client-fixture", userRecordName: "synthetic-user")
private final class Reporter: @unchecked Sendable {
    private let lock = NSLock()
    private let output = FileHandle(fileDescriptor: 3, closeOnDealloc: false)
    func emit(_ event: String, _ details: [String: Any] = [:]) {
        lock.withLock {
            var row = details; row["event"] = event
            // The bounded fixture emits only fixed codes, counts, references and
            // its explicit synthetic grant. No provider errors or note text.
            guard let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]),
                  data.count < 2048 else { Darwin.exit(91) }
            do { try output.write(contentsOf: data + Data([10])) } catch { Darwin.exit(92) }
        }
    }
}
private struct SeedRow: Decodable {
    let reference: OperationReference
    let canonicalBase64: String
}
private actor FixtureBackend: JournalBackend {
    let mode: String
    let reporter: Reporter
    var stored: [String: JournalEnvelope] = [:]
    var saveCalls = 0
    var version = 1
    var held: CheckedContinuation<Void, Never>?
    var failAccount = false
    init(mode: String, seed: [JournalEnvelope], reporter: Reporter) {
        self.mode = mode; self.reporter = reporter
        for envelope in seed { stored[envelope.reference.opId] = envelope }
    }
    func accountIdentity() async throws -> CloudAccountIdentity {
        if failAccount { throw JournalError.accountUnavailable }
        return fixtureAccount
    }
    func release() { held?.resume(); held = nil }
    func loseAccount() { failAccount = true; reporter.emit("account-unavailable") }
    func save(_ envelopes: [JournalEnvelope], scope: JournalScope, zoneName: String,
              limits: JournalLimits) async throws -> [String: RecordSaveResult] {
        guard scope == fixtureScope else { throw JournalError.wrongScope }
        saveCalls += 1
        var results: [String: RecordSaveResult] = [:]
        var accepted = 0
        for (index, envelope) in envelopes.enumerated() {
            if mode == "partial" && saveCalls == 1 && index > 0 {
                results[envelope.reference.opId] = .failed(.transportUnavailable); continue
            }
            if let prior = stored[envelope.reference.opId] {
                results[envelope.reference.opId] = prior == envelope ? .existing(prior) : .failed(.conflictingOperation)
                if prior == envelope { accepted += 1 }
            } else {
                stored[envelope.reference.opId] = envelope; version += 1
                results[envelope.reference.opId] = .saved(envelope); accepted += 1
            }
        }
        reporter.emit("save-stored", ["calls": saveCalls, "accepted": accepted, "offered": envelopes.count])
        if mode == "held" && saveCalls == 1 {
            await withCheckedContinuation { continuation in
                held = continuation; reporter.emit("held")
            }
        }
        return results
    }
    func changes(since token: Data?, scope: JournalScope, zoneName: String,
                 limit: Int, limits: JournalLimits) async throws -> BackendPage {
        guard scope == fixtureScope else { throw JournalError.wrongScope }
        let next = Data("fixture-cursor-\(version)".utf8)
        reporter.emit("pull", ["hasPrevious": token != nil, "records": token == next ? 0 : stored.count])
        return BackendPage(records: token == next ? [:] : stored.mapValues { .success($0) },
            deletionIDs: [], token: next, hasMore: false)
    }
}

@main private enum FixtureHost {
    static func main() async {
        let reporter = Reporter()
        do {
            guard CommandLine.arguments.count == 3, ["partial", "held", "plain"].contains(CommandLine.arguments[1]) else {
                throw JournalError.invalidInput
            }
            let rows = try JSONDecoder().decode([SeedRow].self,
                from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))
            guard rows.count <= 100 else { throw JournalError.limitsExceeded }
            let seed = try rows.map { row in
                guard let bytes = Data(base64Encoded: row.canonicalBase64), bytes.base64EncodedString() == row.canonicalBase64 else {
                    throw JournalError.invalidEnvelope
                }
                return try JournalEnvelope(reference: row.reference, bytes: bytes, scope: fixtureScope)
            }
            let backend = FixtureBackend(mode: CommandLine.arguments[1], seed: seed, reporter: reporter)
            let transport = ForegroundJournalTransport(backend: backend, authorize: { account, scope in
                account == fixtureAccount && scope == fixtureScope
            })
            let session = try await transport.openSession(for: fixtureScope)
            let connection = UUID()
            let gate = JournalRPCSessionGate(observeAccountChanges: false)
            let descriptor = try gate.attach(session, connectionID: connection)
            let adapter = try JournalRPCAdapter(transport: transport, sessions: gate, connectionID: connection)
            reporter.emit("grant", ["connectionId": connection.uuidString.lowercased(), "leaseId": descriptor.leaseId,
                "channelId": descriptor.channelId, "accountId": fixtureScope.accountID, "learnerId": fixtureScope.learnerID])
            let control = Task.detached {
                let input = FileHandle(fileDescriptor: 4, closeOnDealloc: false)
                var command = Data()
                do {
                    while let byte = try input.read(upToCount: 1), !byte.isEmpty {
                        if byte.first == 10 {
                            guard let text = String(data: command, encoding: .utf8) else { throw JournalError.invalidInput }
                            command = Data()
                            switch text {
                            case "release": await backend.release(); reporter.emit("released")
                            case "revoke": gate.revoke(.logout); reporter.emit("revoked")
                            case "account-loss": await backend.loseAccount()
                            default: throw JournalError.invalidInput
                            }
                        } else {
                            command.append(byte)
                            guard command.count <= 32 else { throw JournalError.limitsExceeded }
                        }
                    }
                } catch { reporter.emit("control-failed") }
            }
            do {
                try await JournalRPCStdioServer.run(input: .standardInput, output: .standardOutput,
                    adapter: adapter, connectionID: connection)
                reporter.emit("stopped")
            } catch { reporter.emit("stopped", ["code": rpcErrorCode(error)]) }
            await backend.release()
            control.cancel()
        } catch {
            reporter.emit("fixture-failed", ["code": rpcErrorCode(error)])
            Darwin.exit(93)
        }
    }
}
