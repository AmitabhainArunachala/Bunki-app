import CloudKit
import Darwin
import Foundation
import Testing
@testable import KairoAppleSync

private let rpcAccount = try! CloudAccountIdentity(containerIdentifier: "iCloud.example.rpc-fixture", userRecordName: "synthetic-user")
private let rpcScope = try! JournalScope(accountID: "account-a", learnerID: "learner-a")
private struct RPCFixtureRow: Decodable, Sendable {
    let name: String; let opId: String; let sha256: String; let envelopeBase64: String
    var bytes: Data { Data(base64Encoded: envelopeBase64)! }
    var wire: [String: Any] { ["reference": ["opId": opId, "sha256": sha256], "canonicalBase64": envelopeBase64] }
    func envelope(scope: JournalScope = rpcScope) throws -> JournalEnvelope {
        try JournalEnvelope(reference: OperationReference(opId: opId, sha256: sha256), bytes: bytes, scope: scope)
    }
}
private struct RPCFixtures: Decodable { let positives: [RPCFixtureRow]; let negatives: [RPCFixtureRow] }
private func rpcFixtures() throws -> RPCFixtures {
    let url = Bundle.module.url(forResource: "rpc", withExtension: "json", subdirectory: "Fixtures")!
    return try JSONDecoder().decode(RPCFixtures.self, from: Data(contentsOf: url))
}
private func rpcRow(_ name: String = "first") throws -> RPCFixtureRow { try rpcFixtures().positives.first { $0.name == name }! }
private enum RPCFixtureFailure: Error { case timeout, noReply }
private actor RPCLatch {
    var started = false
    var continuation: CheckedContinuation<Void, Never>?
    func hold() async { started = true; await withCheckedContinuation { continuation = $0 } }
    func release() { continuation?.resume(); continuation = nil }
}
private actor RPCPumpCompletion {
    var code: String?
    func finish(_ code: String) { self.code = code }
}
private actor RPCBackend: JournalBackend {
    var accountCalls = 0; var saveCalls = 0; var pullCalls = 0
    var currentAccount = rpcAccount
    var accountError: JournalError?
    var authorized = true
    var stored: [String: JournalEnvelope] = [:]
    var latch: RPCLatch?
    var override: [String: RecordSaveResult]?
    var error: JournalError?
    var opaqueError: (any Error)?
    var page = BackendPage(records: [:], deletionIDs: [], token: Data("rpc-token-1".utf8), hasMore: false)
    func setLatch(_ value: RPCLatch?) { latch = value }
    func setAccount(_ value: CloudAccountIdentity) { currentAccount = value }
    func setAccountError(_ value: JournalError) { accountError = value }
    func setAuthorized(_ value: Bool) { authorized = value }
    func setOverride(_ value: [String: RecordSaveResult]?) { override = value }
    func setError(_ value: JournalError?) { error = value }
    func setOpaqueError(_ value: any Error) { opaqueError = value }
    func setPage(_ value: BackendPage) { page = value }
    func accountIdentity() async throws -> CloudAccountIdentity { accountCalls += 1; if let accountError { throw accountError }; return currentAccount }
    func save(_ envelopes: [JournalEnvelope], scope: JournalScope, zoneName: String, limits: JournalLimits) async throws -> [String: RecordSaveResult] {
        saveCalls += 1
        if let opaqueError { throw opaqueError }
        if let error { throw error }
        var results: [String: RecordSaveResult] = [:]
        for envelope in envelopes {
            if let old = stored[envelope.reference.opId] { results[envelope.reference.opId] = .existing(old) }
            else { stored[envelope.reference.opId] = envelope; results[envelope.reference.opId] = .saved(envelope) }
        }
        await latch?.hold(); return override ?? results
    }
    func changes(since token: Data?, scope: JournalScope, zoneName: String, limit: Int, limits: JournalLimits) async throws -> BackendPage {
        pullCalls += 1
        if let error { throw error }
        let value = page; await latch?.hold(); return value
    }
}
private struct RPCContext: Sendable {
    let backend: RPCBackend; let transport: ForegroundJournalTransport
    let gate: JournalRPCSessionGate; let adapter: JournalRPCAdapter; let connection: UUID
    let descriptor: JournalRPCSessionDescriptor?
    var lease: String { descriptor?.leaseId ?? "00000000-0000-4000-8000-000000000001" }
}
private func rpcContext(scope: JournalScope = rpcScope, open: Bool = true,
                        backend: RPCBackend = RPCBackend(), limits: JournalRPCLimits = try! JournalRPCLimits()) async throws -> RPCContext {
    let transport = ForegroundJournalTransport(backend: backend, limits: limits.journal) { identity, requested in
        guard identity == rpcAccount && requested == scope else { return false }
        return await backend.authorized
    }
    let gate = JournalRPCSessionGate(observeAccountChanges: false); let connection = UUID()
    let adapter = try JournalRPCAdapter(transport: transport, sessions: gate, connectionID: connection, limits: limits)
    let descriptor = open ? try gate.attach(try await transport.openSession(for: scope), connectionID: connection) : nil
    return RPCContext(backend: backend, transport: transport, gate: gate, adapter: adapter, connection: connection, descriptor: descriptor)
}
private func rpcRequest(_ id: String, _ method: String, _ params: [String: Any] = [:]) throws -> Data {
    try JSONSerialization.data(withJSONObject: ["format": "kairo-journal-rpc", "v": 1, "id": id, "method": method, "params": params], options: [.sortedKeys])
}
private func rpcPush(_ context: RPCContext, _ id: String = "1", rows: [RPCFixtureRow]? = nil) async throws {
    let values = try rows ?? [rpcRow()]
    try await context.adapter.submit(rpcRequest(id, "push", ["leaseId": context.lease, "envelopes": values.map(\.wire)]), from: context.connection)
}
private func rpcPull(_ context: RPCContext, _ id: String = "1", checkpoint: String? = nil, limit: Int = 10) async throws {
    try await context.adapter.submit(rpcRequest(id, "pull", ["leaseId": context.lease, "checkpoint": checkpoint as Any? ?? NSNull(), "limit": limit]), from: context.connection)
}
private func rpcWait(_ predicate: () async -> Bool) async throws {
    for _ in 0..<400 { if await predicate() { return }; try await Task.sleep(for: .milliseconds(5)) }
    throw RPCFixtureFailure.timeout
}
private func rpcNext(_ context: RPCContext) async throws -> Data {
    try await withThrowingTaskGroup(of: Data.self) { group in
        group.addTask { guard let data = await context.adapter.nextOutput() else { throw RPCFixtureFailure.noReply }; return data }
        group.addTask { try await Task.sleep(for: .seconds(3)); context.adapter.connectionLost(context.connection); throw RPCFixtureFailure.timeout }
        defer { group.cancelAll() }
        return try await group.next()!
    }
}
private func rpcReplyRow(_ context: RPCContext) async throws -> [String: Any] {
    for _ in 0..<4 {
        let value = try await JSONSerialization.jsonObject(with: rpcNext(context)) as! [String: Any]
        if value["type"] as? String == "reply" { return value }
    }
    throw RPCFixtureFailure.noReply
}
private func rpcCode(_ reply: [String: Any]) -> String? { (reply["error"] as? [String: Any])?["code"] as? String }
private func rpcAssert(_ expected: JournalRPCError, _ action: () throws -> Void) {
    do { try action(); Issue.record("Expected fixed RPC failure") } catch { #expect(error as? JournalRPCError == expected) }
}

extension JournalTests {
    @Test func rpcCanonicalTypeScriptBytesRoundTrip() async throws {
        for row in try rpcFixtures().positives {
            let raw = try JSONSerialization.jsonObject(with: row.bytes) as! [String: Any]
            let scope = raw["scope"] as! [String: String]
            let currentScope = try JournalScope(accountID: scope["accountId"]!, learnerID: scope["learnerId"]!)
            let context = try await rpcContext(scope: currentScope)
            try await rpcPush(context, rows: [row])
            let pushed = try await rpcReplyRow(context)
            #expect(pushed["id"] as? String == "1"); #expect(pushed["ok"] as? Bool == true)
            #expect(await context.backend.stored[row.opId]?.bytes == row.bytes)
            let envelope = try row.envelope(scope: currentScope)
            await context.backend.setPage(BackendPage(records: [row.opId: .success(envelope)], deletionIDs: [], token: Data("rpc-token".utf8), hasMore: false))
            try await rpcPull(context, "2")
            let pulled = try await rpcReplyRow(context)
            let result = pulled["result"] as! [String: Any]
            let rows = result["envelopes"] as! [[String: Any]]
            #expect(rows[0]["canonicalBase64"] as? String == row.envelopeBase64)
            #expect(result["previous"] is NSNull)
            context.adapter.connectionLost(context.connection)
        }
        for row in try rpcFixtures().negatives {
            #expect(throws: JournalError.invalidEnvelope) { try row.envelope() }
        }
    }

    @Test func rpcCannotCreateNativeAuthority() async throws {
        let context = try await rpcContext(open: false)
        try await context.adapter.submit(rpcRequest("1", "describe"), from: context.connection)
        #expect(try await rpcCode(rpcReplyRow(context)) == "session-required")
        try await rpcPush(context, "2")
        #expect(try await rpcCode(rpcReplyRow(context)) == "session-required")
        #expect(await context.backend.accountCalls == 0); #expect(await context.backend.saveCalls == 0)
        for field in ["scope", "accountId", "learnerId", "binding", "containerIdentifier", "credentials", "url"] {
            let other = try await rpcContext(open: false)
            do { try await other.adapter.submit(rpcRequest("1", "describe", [field: "untrusted"]), from: other.connection); Issue.record("Unexpected authority field admitted") }
            catch { #expect(error as? JournalRPCError == .invalidFrame) }
            #expect(await other.backend.accountCalls == 0)
        }
    }

    @Test func rpcConnectionAndLeaseIsolation() async throws {
        let context = try await rpcContext()
        do { try await context.adapter.submit(rpcRequest("1", "describe"), from: UUID()); Issue.record("Wrong connection admitted") }
        catch { #expect(error as? JournalRPCError == .wrongConnection) }
        try await context.adapter.submit(rpcRequest("1", "push", ["leaseId": UUID().uuidString.lowercased(), "envelopes": [try rpcRow().wire]]), from: context.connection)
        #expect(try await rpcCode(rpcReplyRow(context)) == "stale-session")
        let session = try await context.transport.openSession(for: rpcScope)
        let newLease = try context.gate.attach(session, connectionID: context.connection)
        #expect(newLease.leaseId != context.lease)
        _ = try await rpcNext(context) // exact old-lease invalidation event
        try await rpcPush(context, "2")
        #expect(try await rpcCode(rpcReplyRow(context)) == "stale-session")
        #expect(await context.backend.saveCalls == 0)
        let foreign = try rpcRow("foreign")
        try await context.adapter.submit(rpcRequest("3", "push", ["leaseId": newLease.leaseId, "envelopes": [foreign.wire]]), from: context.connection)
        #expect(try await rpcCode(rpcReplyRow(context)) == "wrongScope")
        #expect(await context.backend.saveCalls == 0)
        await context.backend.setAccount(try CloudAccountIdentity(containerIdentifier: "iCloud.example.rpc-fixture", userRecordName: "other-synthetic-user"))
        try await context.adapter.submit(rpcRequest("4", "push", ["leaseId": newLease.leaseId, "envelopes": [try rpcRow().wire]]), from: context.connection)
        #expect(try await rpcCode(rpcReplyRow(context)) == "staleSession")
        var retainedOldGate = false
        do { _ = try context.gate.capture(connectionID: context.connection); retainedOldGate = true } catch {}
        #expect(!retainedOldGate)
        for code in [JournalError.accountUnavailable, .unauthorizedScope] {
            let lost = try await rpcContext()
            if code == .accountUnavailable { await lost.backend.setAccountError(code) }
            else { await lost.backend.setAuthorized(false) }
            try await rpcPush(lost)
            #expect(try await rpcCode(rpcReplyRow(lost)) == code.rawValue)
            var retained = false
            do { _ = try lost.gate.capture(connectionID: lost.connection); retained = true } catch {}
            #expect(!retained)
        }
        // A failure captured before a native host replacement cannot revoke it.
        let fresh = try await rpcContext(); let oldCapture = try fresh.gate.capture(connectionID: fresh.connection)
        let freshSession = try await fresh.transport.openSession(for: rpcScope)
        let replacement = try fresh.gate.attach(freshSession, connectionID: fresh.connection)
        fresh.gate.revokeCaptured(oldCapture, reason: .nativeSessionLost)
        #expect(try fresh.gate.capture(connectionID: fresh.connection).lease == replacement.leaseId)
    }

    @Test func rpcStrictFrameAdmission() async throws {
        let body = try rpcRequest("1", "describe")
        let framed = try JournalRPCFrameDecoder.frame(body)
        for split in 0...framed.count {
            var parser = JournalRPCFrameDecoder()
            let frames = try parser.append(Data(framed.prefix(split))) + parser.append(Data(framed.dropFirst(split)))
            #expect(frames == [body]); try parser.endOfInput()
        }
        var coalesced = JournalRPCFrameDecoder()
        #expect(try coalesced.append(framed + framed).count == 2)
        for bad in [Data([0, 0, 0, 0]), Data([255, 255, 255, 255])] {
            var parser = JournalRPCFrameDecoder(); rpcAssert(.limitsExceeded) { _ = try parser.append(bad) }
        }
        var partial = JournalRPCFrameDecoder(); _ = try partial.append(Data(framed.dropLast()))
        rpcAssert(.invalidFrame) { try partial.endOfInput() }
        let text = String(data: body, encoding: .utf8)!
        let invalid = [Data([0xff]), Data(text.replacingOccurrences(of: "\"id\":\"1\"", with: "\"id\":\"1\",\"\\u0069d\":\"2\"").utf8),
            Data(text.replacingOccurrences(of: "\"id\":\"1\"", with: "\"id\":1").utf8),
            Data(text.replacingOccurrences(of: "\"1\"", with: "\"01\"").utf8),
            Data(text.replacingOccurrences(of: "\"describe\"", with: "\"openSession\"").utf8),
            Data((String(repeating: "[", count: 10) + "0" + String(repeating: "]", count: 10)).utf8),
            Data("{\"x\":\"\\ud800\"}".utf8)]
        for value in invalid {
            let context = try await rpcContext(open: false)
            do { try await context.adapter.submit(value, from: context.connection); Issue.record("Invalid frame accepted") }
            catch { #expect(error is JournalRPCError) }
            #expect(await context.backend.accountCalls == 0)
        }
        let context = try await rpcContext()
        try await context.adapter.submit(body, from: context.connection); _ = try await rpcNext(context)
        do { try await context.adapter.submit(body, from: context.connection); Issue.record("Repeated ID admitted") }
        catch { #expect(error as? JournalRPCError == .invalidFrame) }
        #expect(await context.adapter.nextOutput() == nil)
    }

    @Test func rpcExactPartialAcknowledgements() async throws {
        let one = try rpcRow(); let two = try rpcRow("second"); let conflict = try rpcRow("conflict")
        for response in [
            [one.opId: RecordSaveResult.saved(try one.envelope()), two.opId: .failed(.transportUnavailable)],
            [one.opId: .existing(try one.envelope())],
            [one.opId: .existing(try conflict.envelope()), two.opId: .saved(try two.envelope())],
        ] {
            let context = try await rpcContext(); await context.backend.setOverride(response)
            try await rpcPush(context, rows: [one, two]); let reply = try await rpcReplyRow(context)
            let result = reply["result"] as! [String: Any]; let accepted = result["accepted"] as! [[String: String]]
            #expect(accepted.count == 1)
            let expected = response[one.opId].map { if case .existing(let value) = $0 { return value == (try! one.envelope()) }; return true } ?? false
            #expect(accepted[0]["opId"] == (expected ? one.opId : two.opId))
            #expect(accepted[0]["sha256"] == (expected ? one.sha256 : two.sha256))
        }
        let context = try await rpcContext()
        await context.backend.setOverride([String(repeating: "0", count: 64): .saved(try one.envelope())])
        try await rpcPush(context)
        #expect(try await rpcCode(rpcReplyRow(context)) == "invalidResponse")
    }

    @Test func rpcLostReplyRetriesImmutableBytes() async throws {
        let backend = RPCBackend(); let context = try await rpcContext(backend: backend); let latch = RPCLatch()
        await backend.setLatch(latch); try await rpcPush(context); try await rpcWait { await latch.started }
        context.adapter.connectionLost(context.connection); await latch.release()
        #expect(await context.adapter.nextOutput() == nil)
        #expect(await backend.stored.count == 1)
        await backend.setLatch(nil)
        let fresh = try await rpcContext(backend: backend)
        try await rpcPush(fresh); let reply = try await rpcReplyRow(fresh)
        let accepted = (reply["result"] as! [String: Any])["accepted"] as! [[String: String]]
        #expect(accepted == [try rpcRow().wire["reference"] as! [String: String]])
        #expect(await backend.saveCalls == 2)
        let original = try rpcRow()
        #expect(await backend.stored[original.opId]?.bytes == original.bytes)
    }

    @Test func rpcRevocationRejectsHeldLateSuccess() async throws {
        for push in [true, false] {
            let context = try await rpcContext(); let latch = RPCLatch(); await context.backend.setLatch(latch)
            if push { try await rpcPush(context) } else { try await rpcPull(context) }
            try await rpcWait { await latch.started }
            context.gate.revoke(.profileChanged)
            let event = try await JSONSerialization.jsonObject(with: rpcNext(context)) as! [String: Any]
            #expect(event["event"] as? String == "session-invalidated"); #expect(event["leaseId"] as? String == context.lease)
            await latch.release()
            let reply = try await rpcReplyRow(context); #expect(reply["ok"] as? Bool == false); #expect(reply["result"] == nil)
        }
        let context = try await rpcContext()
        try await context.adapter.submit(rpcRequest("1", "describe"), from: context.connection)
        context.gate.revoke(.logout) // queued successful describe cannot be published as current
        #expect(try await rpcCode(rpcReplyRow(context)) == "stale-session")
        let gate = JournalRPCSessionGate()
        let session = try await context.transport.openSession(for: rpcScope)
        _ = try gate.attach(session, connectionID: context.connection)
        NotificationCenter.default.post(name: .CKAccountChanged, object: nil)
        #expect(throws: JournalRPCError.sessionRequired) { try gate.capture(connectionID: context.connection) }
    }

    @Test func rpcCancellationCannotPublishLateResults() async throws {
        let context = try await rpcContext(); let latch = RPCLatch(); await context.backend.setLatch(latch)
        try await rpcPush(context); try await rpcWait { await latch.started }
        try await context.adapter.submit(rpcRequest("2", "cancel", ["targetId": "1"]), from: context.connection)
        let cancelled = try await rpcReplyRow(context)
        #expect(cancelled["id"] as? String == "2")
        #expect((cancelled["result"] as? [String: Any])?["cancelled"] as? Bool == true)
        try await rpcPush(context, "3")
        #expect(try await rpcCode(rpcReplyRow(context)) == "busy")
        await latch.release()
        let target = try await rpcReplyRow(context); #expect(target["id"] as? String == "1")
        #expect(rpcCode(target) == "cancelled"); #expect(await context.backend.saveCalls == 1)
    }

    @Test func rpcPullCursorFailuresRetainPrevious() async throws {
        for error in [JournalError.checkpointExpired, .journalReset, .physicalDeletion, .transportUnavailable] {
            let context = try await rpcContext(); await context.backend.setError(error)
            try await rpcPull(context)
            let reply = try await rpcReplyRow(context); #expect(rpcCode(reply) == error.rawValue); #expect(reply["result"] == nil)
        }
        let context = try await rpcContext()
        await context.backend.setPage(BackendPage(records: [try rpcRow().opId: .failure(.invalidEnvelope)], deletionIDs: [], token: Data("advanced".utf8), hasMore: false))
        try await rpcPull(context); #expect(try await rpcCode(rpcReplyRow(context)) == "invalidEnvelope")
        try await rpcPull(context, "2", checkpoint: "untrusted")
        #expect(try await rpcCode(rpcReplyRow(context)) == "invalidCursor")
        #expect(await context.backend.pullCalls == 1)
    }

    @Test func rpcOutputAndInputBounds() async throws {
        let small = try JournalRPCLimits(maxFrameBytes: 1024)
        let context = try await rpcContext(limits: small)
        let row = try rpcRow("large")
        await context.backend.setPage(BackendPage(records: [row.opId: .success(try row.envelope())], deletionIDs: [], token: Data("too-large-page".utf8), hasMore: false))
        try await rpcPull(context)
        #expect(try await rpcCode(rpcReplyRow(context)) == "limits-exceeded")
        let full = try await rpcContext()
        for id in 1...4 { try await full.adapter.submit(rpcRequest(String(id), "describe"), from: full.connection) }
        do { try await full.adapter.submit(rpcRequest("5", "describe"), from: full.connection); Issue.record("Unbounded output queue") }
        catch { #expect(error as? JournalRPCError == .connectionLost) }
        #expect(await full.adapter.nextOutput() == nil)
        let bounded = try await rpcContext(limits: JournalRPCLimits(journal: JournalLimits(maxEnvelopeBytes: 64)))
        try await rpcPush(bounded)
        #expect(try await rpcCode(rpcReplyRow(bounded)) == "invalid-frame")
        #expect(await bounded.backend.saveCalls == 0)
        let invalid = try await rpcContext()
        var wire = try rpcRow().wire; wire["canonicalBase64"] = (wire["canonicalBase64"] as! String) + "\n"
        try await invalid.adapter.submit(rpcRequest("1", "push", ["leaseId": invalid.lease, "envelopes": [wire]]), from: invalid.connection)
        #expect(try await rpcCode(rpcReplyRow(invalid)) == "invalid-frame")
        #expect(await invalid.backend.saveCalls == 0)
    }

    @Test func rpcFixedFailureCodesOnly() async throws {
        let error = NSError(domain: "secret-synthetic-domain", code: 17, userInfo: [NSLocalizedDescriptionKey: "private-payload-secret"])
        #expect(rpcErrorCode(error) == "transport-unavailable")
        let context = try await rpcContext(); await context.backend.setOpaqueError(error)
        try await rpcPush(context); let bytes = try await rpcNext(context)
        let text = String(data: bytes, encoding: .utf8)!
        #expect(!text.contains("private-payload-secret")); #expect(!text.contains("猫")); #expect(!text.contains("account-a"))
        let reply = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        #expect(rpcCode(reply) == "transportUnavailable")
        #expect(Set((reply["error"] as! [String: String]).keys) == ["code"])
    }

    @Test func rpcRealFileHandleFraming() async throws {
        let context = try await rpcContext(); let input = Pipe(); let output = Pipe()
        let task = Task { try await JournalRPCStdioServer.run(input: input.fileHandleForReading, output: output.fileHandleForWriting, adapter: context.adapter, connectionID: context.connection) }
        let body = try rpcRequest("1", "describe"); let frame = try JournalRPCFrameDecoder.frame(body)
        try input.fileHandleForWriting.write(contentsOf: frame.prefix(3))
        try input.fileHandleForWriting.write(contentsOf: frame.dropFirst(3))
        let fd = output.fileHandleForReading.fileDescriptor; _ = fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK)
        var decoder = JournalRPCFrameDecoder(); var reply: Data?
        try await rpcWait {
            var bytes = [UInt8](repeating: 0, count: 4096)
            let count = Darwin.read(fd, &bytes, bytes.count)
            if count > 0 { reply = try? decoder.append(Data(bytes.prefix(count))).first }
            return reply != nil
        }
        #expect((try JSONSerialization.jsonObject(with: reply!) as! [String: Any])["id"] as? String == "1")
        let latch = RPCLatch(); await context.backend.setLatch(latch)
        try input.fileHandleForWriting.write(contentsOf: JournalRPCFrameDecoder.frame(rpcRequest("2", "push",
            ["leaseId": context.lease, "envelopes": [try rpcRow().wire]])))
        try await rpcWait { await latch.started }
        try input.fileHandleForWriting.write(contentsOf: JournalRPCFrameDecoder.frame(rpcRequest("3", "cancel", ["targetId": "2"])))
        reply = nil
        try await rpcWait {
            var bytes = [UInt8](repeating: 0, count: 4096); let count = Darwin.read(fd, &bytes, bytes.count)
            if count > 0 { reply = try? decoder.append(Data(bytes.prefix(count))).first }
            return reply != nil
        }
        #expect((try JSONSerialization.jsonObject(with: reply!) as! [String: Any])["id"] as? String == "3")
        await latch.release(); reply = nil
        try await rpcWait {
            var bytes = [UInt8](repeating: 0, count: 4096); let count = Darwin.read(fd, &bytes, bytes.count)
            if count > 0 { reply = try? decoder.append(Data(bytes.prefix(count))).first }
            return reply != nil
        }
        let target = try JSONSerialization.jsonObject(with: reply!) as! [String: Any]
        #expect(target["id"] as? String == "2"); #expect(rpcCode(target) == "cancelled")
        try input.fileHandleForWriting.close()
        try await task.value
        #expect(throws: JournalRPCError.sessionRequired) { try context.gate.capture(connectionID: context.connection) }
        // A real full output pipe must not hold the revocation lock or the pump.
        let held = try await rpcContext(); let in2 = Pipe(); let out2 = Pipe()
        let fillFD = out2.fileHandleForWriting.fileDescriptor
        let fillFlags = fcntl(fillFD, F_GETFL); _ = fcntl(fillFD, F_SETFL, fillFlags | O_NONBLOCK)
        let filler = [UInt8](repeating: 0, count: 4096); var filled = 0
        while filled < 16 * 1024 * 1024 {
            let count = filler.withUnsafeBytes { Darwin.write(fillFD, $0.baseAddress, $0.count) }
            if count < 0 { #expect(errno == EAGAIN || errno == EWOULDBLOCK); break }
            #expect(count > 0); filled += count
        }
        #expect(filled > 0 && filled < 16 * 1024 * 1024)
        _ = fcntl(fillFD, F_SETFL, fillFlags)
        let heldBackend = RPCLatch(); await held.backend.setLatch(heldBackend)
        let completion = RPCPumpCompletion()
        let blocked = Task {
            do { try await JournalRPCStdioServer.run(input: in2.fileHandleForReading, output: out2.fileHandleForWriting, adapter: held.adapter, connectionID: held.connection); await completion.finish("unexpected-success") }
            catch { await completion.finish(rpcErrorCode(error)) }
        }
        try in2.fileHandleForWriting.write(contentsOf: JournalRPCFrameDecoder.frame(rpcRequest("1", "pull", ["leaseId": held.lease, "checkpoint": NSNull(), "limit": 1])))
        try await rpcWait { await heldBackend.started }
        let start = ContinuousClock.now; held.gate.revoke(.logout)
        #expect(start.duration(to: .now) < .milliseconds(100))
        // The backend is still held, so only an event/error can be queued.
        // A full pipe must not keep a revoked foreground pump alive indefinitely.
        for _ in 0..<200 { if await completion.code != nil { break }; try await Task.sleep(for: .milliseconds(5)) }
        #expect(await completion.code == "stale-session")
        blocked.cancel(); await heldBackend.release(); await blocked.value
        try in2.fileHandleForWriting.close()
        let broken = try await rpcContext(); let in3 = Pipe(); let out3 = Pipe()
        try out3.fileHandleForReading.close()
        let failedWrite = Task { try await JournalRPCStdioServer.run(input: in3.fileHandleForReading, output: out3.fileHandleForWriting, adapter: broken.adapter, connectionID: broken.connection) }
        try in3.fileHandleForWriting.write(contentsOf: frame)
        do { try await failedWrite.value; Issue.record("Closed pipe reported success") }
        catch { #expect(error as? JournalRPCError == .ioFailure) }
        try in3.fileHandleForWriting.close()
        let truncated = try await rpcContext(); let in4 = Pipe(); let out4 = Pipe()
        let failedRead = Task { try await JournalRPCStdioServer.run(input: in4.fileHandleForReading, output: out4.fileHandleForWriting, adapter: truncated.adapter, connectionID: truncated.connection) }
        try in4.fileHandleForWriting.write(contentsOf: frame.prefix(3)); try in4.fileHandleForWriting.close()
        do { try await failedRead.value; Issue.record("Truncated frame reported success") }
        catch { #expect(error as? JournalRPCError == .invalidFrame) }
    }
}
