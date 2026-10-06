import Darwin
import Foundation
@testable import KairoNativeShareCore

private enum CheckFailure: Error { case missingValue }
private final class CheckIssues: @unchecked Sendable {
    private let lock = NSLock()
    private var issues: [String] = []
    func add(_ value: String) { lock.lock(); defer { lock.unlock() }; issues.append(value) }
    var values: [String] { lock.lock(); defer { lock.unlock() }; return issues }
}
private let checkIssues = CheckIssues()

internal func fail(_ message: String, file: StaticString = #fileID, line: UInt = #line) {
    checkIssues.add("\(file):\(line): \(message)")
}
internal func checkEqual<T: Equatable>(_ left: @autoclosure () throws -> T, _ right: @autoclosure () throws -> T,
                                     _ message: String = "Values differ", file: StaticString = #fileID, line: UInt = #line) {
    do { if try left() != right() { fail(message, file: file, line: line) } }
    catch { fail("\(message): \(error)", file: file, line: line) }
}
internal func checkTrue(_ condition: @autoclosure () throws -> Bool, _ message: String = "Expected true",
                        file: StaticString = #fileID, line: UInt = #line) {
    checkEqual(try condition(), true, message, file: file, line: line)
}
internal func checkFalse(_ condition: @autoclosure () throws -> Bool, _ message: String = "Expected false",
                         file: StaticString = #fileID, line: UInt = #line) {
    checkEqual(try condition(), false, message, file: file, line: line)
}
internal func checkGreaterThan<T: Comparable>(_ left: T, _ right: T, file: StaticString = #fileID, line: UInt = #line) {
    checkTrue(left > right, "Expected a larger value", file: file, line: line)
}
internal func checkThrows<T>(_ operation: @autoclosure () throws -> T, file: StaticString = #fileID, line: UInt = #line,
                            inspect: (Error) -> Void = { _ in }) {
    do { _ = try operation(); fail("Unexpected acceptance", file: file, line: line) }
    catch { inspect(error) }
}
internal func requireValue<T>(_ value: T?, file: StaticString = #fileID, line: UInt = #line) throws -> T {
    guard let value else { fail("Required value missing", file: file, line: line); throw CheckFailure.missingValue }
    return value
}

private func checkedTestRoot() throws -> URL {
    guard let configured = ProcessInfo.processInfo.environment["KAIRO_SHARE_TEST_ROOT"], configured.hasPrefix("/") else {
        throw SharedFileError.invalidContainer
    }
    let base = URL(fileURLWithPath: configured).resolvingSymlinksInPath().standardizedFileURL
    let home = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".dharma").path + "/"
    let runner = ProcessInfo.processInfo.environment["RUNNER_TEMP"].map { URL(fileURLWithPath: $0).resolvingSymlinksInPath().path + "/" }
    guard base.path.hasPrefix(home) || (ProcessInfo.processInfo.environment["CI"] != nil && runner.map(base.path.hasPrefix) == true) else {
        throw SharedFileError.invalidContainer
    }
    return base
}

internal func shareTestDirectory(_ label: String) throws -> URL {
    let result = try checkedTestRoot().appendingPathComponent(label + "-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: result, withIntermediateDirectories: true)
    return result
}

final class SharedFileInboxTests: @unchecked Sendable {
    private func candidate(_ byte: UInt8 = 1, count: Int = 16, name: String = "原本.pdf") throws -> SharedFileCandidate {
        try SharedFileCandidate(selectedBytes: Data(repeating: byte, count: count), name: name, offeredType: "com.adobe.pdf")
    }

    func testExplicitKeepStableRetryConflictReopenAndRemoval() throws {
        let directory = try shareTestDirectory("round-trip")
        let inbox = try SharedFileInbox(container: directory), bytes = try candidate(), id = UUID()
        checkEqual(try inbox.list(), [])
        let receipt = try inbox.keep(bytes, id: id)
        let replay = try inbox.keep(candidate(name: "another-name.pdf"), id: id)
        checkEqual(replay, receipt, "Same bytes preserve original provenance metadata")
        checkThrows(try inbox.keep(candidate(2), id: id)) { checkEqual($0 as? SharedFileError, .conflict) }
        let reopened = try SharedFileInbox(container: directory)
        for _ in 0..<3 {
            checkEqual(try reopened.list(), [receipt])
            checkEqual(try reopened.read(id: id).candidate.bytes, bytes.bytes)
        }
        checkEqual(try reopened.unfinishedWrites(), [])
        checkTrue(try reopened.remove(receipt)); checkFalse(try reopened.remove(receipt))
        checkEqual(try inbox.list(), [])
        checkThrows(try inbox.read(id: id)) { checkEqual($0 as? SharedFileError, .notFound) }
    }

    func testTwentyItemCapacityDoesNotEvictOrConsumeOriginals() throws {
        let inbox = try SharedFileInbox(container: shareTestDirectory("item-capacity"))
        var receipts: [SharedFileReceipt] = []
        for _ in 0..<20 { receipts.append(try inbox.keep(candidate(), id: UUID())) }
        checkThrows(try inbox.keep(candidate(), id: UUID())) { checkEqual($0 as? SharedFileError, .capacity) }
        for receipt in receipts { checkEqual(try inbox.read(id: receipt.id).receipt, receipt) }
        checkEqual(try inbox.list().count, 20)
        checkEqual(try inbox.keep(candidate(), id: receipts[0].id), receipts[0], "Retry at capacity remains idempotent")
    }

    func testContainerSymlinkUnexpectedEntryAndLockSymlinkFailClosed() throws {
        let root = try shareTestDirectory("path-guards"), actual = root.appendingPathComponent("actual")
        try FileManager.default.createDirectory(at: actual, withIntermediateDirectories: true)
        let link = root.appendingPathComponent("alias")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: actual)
        checkThrows(try SharedFileInbox(container: link))
        checkThrows(try SharedFileInbox(container: URL(string: "https://example.invalid")!))
        checkThrows(try SharedFileInbox(container: root.appendingPathComponent("missing")))
        let namespaceLink = root.appendingPathComponent(SharedFileInbox.directoryName)
        try FileManager.default.createSymbolicLink(at: namespaceLink, withDestinationURL: actual)
        checkThrows(try SharedFileInbox(container: root))

        let badLockRoot = try shareTestDirectory("lock-guard"), badLock = try SharedFileInbox(container: badLockRoot)
        try FileManager.default.createSymbolicLink(at: badLockRoot.appendingPathComponent(SharedFileInbox.directoryName).appendingPathComponent(".lock"), withDestinationURL: actual)
        checkThrows(try badLock.list())
        let unknownRoot = try shareTestDirectory("unknown-entry"), unknown = try SharedFileInbox(container: unknownRoot)
        try Data("do not delete".utf8).write(to: unknownRoot.appendingPathComponent(SharedFileInbox.directoryName).appendingPathComponent("foreign"))
        checkThrows(try unknown.list()) { checkEqual($0 as? SharedFileError, .corruptItem) }
    }

    func testStoredBytesMetadataTruncationAndSymlinksAreRejected() throws {
        for change in ["bytes", "truncated", "header", "extra-key", "symlink", "directory"] {
            let root = try shareTestDirectory("corruption-" + change), inbox = try SharedFileInbox(container: root)
            let id = UUID(); _ = try inbox.keep(candidate(), id: id)
            let file = root.appendingPathComponent(SharedFileInbox.directoryName).appendingPathComponent(id.uuidString.lowercased() + ".share")
            var data = try Data(contentsOf: file)
            if change == "symlink" || change == "directory" {
                try FileManager.default.removeItem(at: file)
                if change == "symlink" { try FileManager.default.createSymbolicLink(at: file, withDestinationURL: root) }
                else { try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false) }
            } else {
                if change == "bytes" { data[data.count - 1] ^= 1 }
                else if change == "truncated" { data = data.prefix(10) }
                else if change == "extra-key" {
                    let offset = Data("KAIRO-SHARE-1\n".utf8).count + 4
                    let length = data[(offset - 4)..<offset].reduce(0) { ($0 << 8) | Int($1) }
                    var json = try JSONSerialization.jsonObject(with: data[offset..<offset + length]) as! [String: Any]
                    json["learnerId"] = "must-not-be-admitted"
                    let header = try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys, .withoutEscapingSlashes])
                    var changed = data.prefix(offset - 4)
                    let n = UInt32(header.count)
                    changed.append(contentsOf: [UInt8(n >> 24), UInt8((n >> 16) & 255), UInt8((n >> 8) & 255), UInt8(n & 255)])
                    changed.append(header); changed.append(data[(offset + length)...]); data = changed
                } else { data[0] ^= 1 }
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
                try data.write(to: file)
                try FileManager.default.setAttributes([.posixPermissions: 0o400], ofItemAtPath: file.path)
            }
            checkThrows(try inbox.read(id: id)) { checkEqual($0 as? SharedFileError, .corruptItem) }
            checkThrows(try inbox.list())
        }
    }

    func testStaleReceiptCannotRemoveAChangedItem() throws {
        let inbox = try SharedFileInbox(container: shareTestDirectory("stale-remove")), id = UUID()
        let old = try inbox.keep(candidate(1), id: id)
        checkTrue(try inbox.remove(old))
        let replacement = try inbox.keep(candidate(2), id: id)
        checkThrows(try inbox.remove(old)) { checkEqual($0 as? SharedFileError, .conflict) }
        checkEqual(try inbox.read(id: id).receipt, replacement)
    }

    func testSameClockSameBytesReceiptCannotRemoveReplacement() throws {
        let root = try shareTestDirectory("same-clock-publication"), id = UUID(), data = try candidate()
        // The clock collision is deterministic; neither sleeps nor real clock
        // changes can turn a missed collision into a passing regression.
        let inbox = try SharedFileInbox(container: root, lockTimeout: 2, checkpoint: nil,
                                        testClock: { 1_700_000_000.125 })
        let old = try inbox.keep(data, id: id)
        checkEqual(try inbox.keep(data, id: id), old)
        checkTrue(try inbox.remove(old))
        let replacement = try inbox.keep(data, id: id)
        checkEqual(old.id, replacement.id)
        checkEqual(old.storedAtMilliseconds, replacement.storedAtMilliseconds)
        checkEqual(old.metadata, replacement.metadata)
        checkFalse(old.incarnation == replacement.incarnation, "New publications must have a fresh persisted identity")
        checkFalse(old == replacement, "Distinct publications need distinct receipts even at the same time")
        let reopened = try SharedFileInbox(container: root)
        checkEqual(try reopened.read(id: id).receipt, replacement)
        var staleOutcome: String
        do {
            staleOutcome = try reopened.remove(old) ? "removed" : "not-found"
            fail("Stale receipt removal was accepted")
        } catch {
            staleOutcome = (error as? SharedFileError)?.rawValue ?? "unexpected-error"
            checkEqual(error as? SharedFileError, .conflict)
        }
        let remaining = try? reopened.read(id: id)
        let witness: [String: Any] = ["id": id.uuidString.lowercased(),
            "fixedTimeMilliseconds": old.storedAtMilliseconds, "sameId": old.id == replacement.id,
            "sameTime": old.storedAtMilliseconds == replacement.storedAtMilliseconds,
            "sameMetadata": old.metadata == replacement.metadata, "sha256": data.metadata.sha256,
            "oldIncarnation": old.incarnation.uuidString.lowercased(),
            "replacementIncarnation": replacement.incarnation.uuidString.lowercased(),
            "receiptsEqual": old == replacement, "staleRemovalOutcome": staleOutcome,
            "replacementStillPresent": remaining?.receipt == replacement]
        try JSONSerialization.data(withJSONObject: witness, options: [.prettyPrinted, .sortedKeys])
            .write(to: root.appendingPathComponent("publication-witness.json"))
        checkTrue(remaining?.receipt == replacement, "Stale receipt must preserve the replacement")
        if let remaining {
            checkEqual(remaining.candidate.bytes, data.bytes)
            checkTrue(try reopened.remove(replacement))
        }
    }

    func testPublicationIdentityHeaderIsRequiredAndLegacyIsPreserved() throws {
        for change in ["missing", "malformed", "uppercase", "wrong-type", "legacy-v1", "v1-with-identity", "duplicate"] {
            let root = try shareTestDirectory("identity-header-" + change), inbox = try SharedFileInbox(container: root)
            let id = UUID(), data = try candidate(), receipt = try inbox.keep(data, id: id)
            let file = root.appendingPathComponent(SharedFileInbox.directoryName).appendingPathComponent(id.uuidString.lowercased() + ".share")
            let original = try Data(contentsOf: file), offset = Data("KAIRO-SHARE-1\n".utf8).count + 4
            let length = original[(offset - 4)..<offset].reduce(0) { ($0 << 8) | Int($1) }
            var json = try JSONSerialization.jsonObject(with: original[offset..<offset + length]) as! [String: Any]
            checkEqual(json["version"] as? Int, 2)
            checkEqual(json["incarnation"] as? String, receipt.incarnation.uuidString.lowercased())
            switch change {
            case "missing": json.removeValue(forKey: "incarnation")
            case "malformed": json["incarnation"] = "not-a-publication-id"
            case "uppercase": json["incarnation"] = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"
            case "wrong-type": json["incarnation"] = 1
            case "legacy-v1": json["version"] = 1; json.removeValue(forKey: "incarnation")
            case "v1-with-identity": json["version"] = 1
            default: break
            }
            var header = try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys, .withoutEscapingSlashes])
            if change == "duplicate" {
                // A duplicate with the same value still is not the closed
                // canonical header, regardless of JSONDecoder's key policy.
                header.removeLast()
                header.append(Data(",\"incarnation\":\"\(receipt.incarnation.uuidString.lowercased())\"}".utf8))
            }
            let count = UInt32(header.count)
            var changed = original.prefix(offset - 4)
            changed.append(contentsOf: [UInt8(count >> 24), UInt8((count >> 16) & 255), UInt8((count >> 8) & 255), UInt8(count & 255)])
            changed.append(header); changed.append(original[(offset + length)...])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            try changed.write(to: file)
            try FileManager.default.setAttributes([.posixPermissions: 0o400], ofItemAtPath: file.path)
            checkThrows(try inbox.read(id: id)) { checkEqual($0 as? SharedFileError, .corruptItem) }
            checkThrows(try inbox.list()) { checkEqual($0 as? SharedFileError, .corruptItem) }
            checkThrows(try inbox.keep(data, id: id)) { checkEqual($0 as? SharedFileError, .corruptItem) }
            checkThrows(try inbox.remove(receipt)) { checkEqual($0 as? SharedFileError, .corruptItem) }
            checkEqual(try Data(contentsOf: file), changed, "Rejected legacy/invalid data must be preserved")
            checkEqual(try inbox.unfinishedWrites(), [])
        }
    }

    func testTaskCancellationBeforeAndAfterPublication() async throws {
        for after in [false, true] {
            let root = try shareTestDirectory("cancel-publication"), id = UUID(), data = try candidate()
            let entered = DispatchSemaphore(value: 0), resume = DispatchSemaphore(value: 0)
            let inbox = try SharedFileInbox(container: root, lockTimeout: 2, checkpoint: { phase in
                if (after && phase == .published) || (!after && phase == .temporaryFlushed) {
                    entered.signal()
                    if resume.wait(timeout: .now() + 5) != .success { fail("Cancellation checkpoint was not released") }
                }
            })
            let job = Task.detached { try inbox.keep(data, id: id) }
            defer { resume.signal() }
            let reached: Bool = await withCheckedContinuation { continuation in
                DispatchQueue.global().async {
                    continuation.resume(returning: entered.wait(timeout: .now() + 5) == .success)
                }
            }
            guard reached else { job.cancel(); throw SharedFileError.timeout }
            job.cancel(); resume.signal()
            do { _ = try await job.value; fail("Cancelled Keep reported normal success") }
            catch { checkEqual(error as? SharedFileError, after ? .commitOutcomeUnknown : .cancelled) }
            if after { checkEqual(try inbox.read(id: id).candidate.bytes, data.bytes) }
            else { checkEqual(try inbox.list(), []); checkEqual(try inbox.unfinishedWrites(), []) }
        }
    }

    // Each child below is the real compiled checks executable, with its own PID
    // and separately opened store. No fork, GUI, app lifecycle or daemon is used.
    private struct Child {
        let process: Process
        let output: URL
        let ready: URL
        let gate: URL
        let result: URL
    }

    private func child(_ mode: String, root: URL, gate: URL, id: UUID = UUID(), byte: Int = 1,
                       count: Int = 16) throws -> Child {
        let out = try shareTestDirectory("process-" + mode)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
        process.arguments = ["--child"]
        var environment = ProcessInfo.processInfo.environment
        environment["KAIRO_SHARE_CHILD_MODE"] = mode
        environment["KAIRO_SHARE_CHILD_CONTAINER"] = root.path
        environment["KAIRO_SHARE_CHILD_OUTPUT"] = out.path
        environment["KAIRO_SHARE_CHILD_GATE"] = gate.path
        environment["KAIRO_SHARE_CHILD_ID"] = id.uuidString
        environment["KAIRO_SHARE_CHILD_BYTE"] = String(byte)
        environment["KAIRO_SHARE_CHILD_COUNT"] = String(count)
        process.environment = environment
        let log = out.appendingPathComponent("process.log")
        FileManager.default.createFile(atPath: log.path, contents: nil)
        let handle = try FileHandle(forWritingTo: log)
        process.standardOutput = handle; process.standardError = handle
        try process.run(); try handle.close()
        return Child(process: process, output: out, ready: out.appendingPathComponent("ready"), gate: gate,
                     result: out.appendingPathComponent("result.json"))
    }

    private func awaitFile(_ url: URL, seconds: TimeInterval = 10) throws {
        let deadline = ProcessInfo.processInfo.systemUptime + seconds
        while !FileManager.default.fileExists(atPath: url.path) {
            guard ProcessInfo.processInfo.systemUptime < deadline else { throw SharedFileError.timeout }
            usleep(10_000)
        }
    }

    private func finish(_ child: Child) throws -> [String: Any] {
        let deadline = ProcessInfo.processInfo.systemUptime + 15
        while child.process.isRunning && ProcessInfo.processInfo.systemUptime < deadline { usleep(10_000) }
        if child.process.isRunning {
            kill(child.process.processIdentifier, SIGKILL)
            child.process.waitUntilExit()
            throw SharedFileError.timeout
        }
        child.process.waitUntilExit()
        checkEqual(child.process.terminationStatus, 0, "See " + child.output.path)
        return try JSONSerialization.jsonObject(with: Data(contentsOf: child.result)) as! [String: Any]
    }

    private func release(_ children: [Child]) throws {
        for child in children { try awaitFile(child.ready) }
        try Data("go".utf8).write(to: children[0].gate)
    }

    private func stop(_ children: [Child]) {
        for child in children where child.process.isRunning {
            kill(child.process.processIdentifier, SIGKILL); child.process.waitUntilExit()
        }
    }

    func testSeparateProcessesSerializeItemAndByteCapacity() throws {
        for bytesLimit in [false, true] {
            let root = try shareTestDirectory(bytesLimit ? "process-byte-capacity" : "process-item-capacity")
            let inbox = try SharedFileInbox(container: root)
            let size = bytesLimit ? SharedFileLimits.fileBytes - 4096 : 16
            let initial = bytesLimit ? 4 : 18
            for _ in 0..<initial { _ = try inbox.keep(candidate(count: size), id: UUID()) }
            let gate = root.appendingPathComponent("go")
            var children: [Child] = []
            defer { stop(children) }
            for _ in 0..<4 { children.append(try child("keep", root: root, gate: gate, count: size)) }
            try release(children)
            let outcomes = try children.map { try finish($0)["outcome"] as! String }
            checkEqual(outcomes.filter { $0 == "stored" }.count, bytesLimit ? 1 : 2)
            checkEqual(outcomes.filter { $0 == "capacity" }.count, bytesLimit ? 3 : 2)
            checkEqual(try inbox.list().count, bytesLimit ? 5 : 20)
            checkEqual(Set(children.map { $0.process.processIdentifier }).count, 4)
            checkFalse(children.contains { $0.process.processIdentifier == getpid() })
        }
    }

    func testSeparateProcessesSameIDRetryAndConflict() throws {
        for identical in [true, false] {
            let root = try shareTestDirectory("process-retry"), id = UUID(), gate = root.appendingPathComponent("go")
            var children: [Child] = []
            defer { stop(children) }
            children.append(try child("keep", root: root, gate: gate, id: id, byte: 1))
            children.append(try child("keep", root: root, gate: gate, id: id, byte: identical ? 1 : 2))
            try release(children)
            let results = try children.map(finish)
            checkEqual(results.filter { $0["outcome"] as? String == "stored" }.count, identical ? 2 : 1)
            checkEqual(results.filter { $0["outcome"] as? String == "conflict" }.count, identical ? 0 : 1)
            if identical {
                checkEqual(results[0]["storedAt"] as? Int64, results[1]["storedAt"] as? Int64)
                let first = try requireValue(results[0]["incarnation"] as? String)
                let second = try requireValue(results[1]["incarnation"] as? String)
                checkEqual(first, second, "Idempotent children must share the same publication identity")
                checkEqual(try SharedFileInbox(container: root).read(id: id).receipt.incarnation.uuidString.lowercased(), first)
            }
            checkEqual(try SharedFileInbox(container: root).list().count, 1)
        }
    }

    func testSeparateProcessReaderDuringKeepAndExplicitRemove() throws {
        let root = try shareTestDirectory("process-read-remove"), gate = root.appendingPathComponent("go")
        var children: [Child] = []
        defer { stop(children) }
        children.append(try child("cycle", root: root, gate: gate))
        children.append(try child("reader", root: root, gate: gate))
        try release(children)
        let writer = try finish(children[0]), reader = try finish(children[1])
        checkEqual(writer["outcome"] as? String, "cycled")
        checkEqual(reader["outcome"] as? String, "read")
        checkGreaterThan(reader["reads"] as? Int ?? 0, 0)
        checkEqual(try SharedFileInbox(container: root).list(), [])
    }

    func testKilledWriterBeforeAndAfterPublishHasResolvableOutcome() throws {
        for after in [false, true] {
            let root = try shareTestDirectory("process-killed"), gate = root.appendingPathComponent("go"), id = UUID()
            let child = try child(after ? "pause-published" : "pause-temporary", root: root, gate: gate, id: id)
            defer { stop([child]) }
            try release([child]); try awaitFile(child.output.appendingPathComponent("checkpoint"))
            let busy = try SharedFileInbox(container: root, lockTimeout: 0.03)
            checkThrows(try busy.list()) { checkEqual($0 as? SharedFileError, .storageBusy) }
            kill(child.process.processIdentifier, SIGKILL); child.process.waitUntilExit()
            checkEqual(child.process.terminationReason, .uncaughtSignal)
            let reopened = try SharedFileInbox(container: root)
            if after {
                let stored = try reopened.read(id: id)
                checkEqual(stored.candidate.bytes, try candidate().bytes)
                checkEqual(try reopened.keep(candidate(), id: id), stored.receipt)
                checkEqual(try reopened.unfinishedWrites(), [])
            } else {
                checkEqual(try reopened.list(), [])
                checkEqual(try reopened.unfinishedWrites(), [id])
                checkThrows(try reopened.keep(candidate(), id: id)) { checkEqual($0 as? SharedFileError, .unfinishedWrite) }
                checkTrue(try reopened.discardUnfinishedWrite(id: id))
                checkFalse(try reopened.discardUnfinishedWrite(id: id))
                checkEqual(try reopened.unfinishedWrites(), [])
            }
        }
    }

    func testChildProcessEntry() throws {
        let env = ProcessInfo.processInfo.environment
        guard let mode = env["KAIRO_SHARE_CHILD_MODE"] else { return }
        let root = URL(fileURLWithPath: try requireValue(env["KAIRO_SHARE_CHILD_CONTAINER"]))
        let output = URL(fileURLWithPath: try requireValue(env["KAIRO_SHARE_CHILD_OUTPUT"]))
        let gate = URL(fileURLWithPath: try requireValue(env["KAIRO_SHARE_CHILD_GATE"]))
        let id = try requireValue(UUID(uuidString: try requireValue(env["KAIRO_SHARE_CHILD_ID"])))
        let byte = try requireValue(UInt8(try requireValue(env["KAIRO_SHARE_CHILD_BYTE"])))
        let count = try requireValue(Int(try requireValue(env["KAIRO_SHARE_CHILD_COUNT"])))
        // Refuse to turn the child harness into a generic filesystem runner.
        let allowed = try checkedTestRoot().path + "/"
        for path in [root, output, gate] {
            guard path.resolvingSymlinksInPath().path.hasPrefix(allowed) else { throw SharedFileError.invalidContainer }
        }
        let inbox = try SharedFileInbox(container: root, lockTimeout: 2, checkpoint: { phase in
            if case .namespaceOpened(let fd, let inode) = phase {
                FileHandle.standardOutput.write(Data("NAMESPACE fd=\(fd) inode=\(inode) root=\(root.path)\n".utf8))
            }
            if case .storageFailure(let operation, let code) = phase {
                FileHandle.standardOutput.write(Data("STORAGE-FAILURE \(operation) errno=\(code)\n".utf8))
            }
            if (mode == "pause-published" && phase == .published) || (mode == "pause-temporary" && phase == .temporaryFlushed) {
                do { try Data(String(getpid()).utf8).write(to: output.appendingPathComponent("checkpoint")) }
                catch { fail("Could not record child checkpoint"); return }
                while true { usleep(100_000) }
            }
        })
        try Data(String(getpid()).utf8).write(to: output.appendingPathComponent("ready"))
        try awaitFile(gate)
        var result: [String: Any] = ["pid": getpid(), "mode": mode, "id": id.uuidString]
        do {
            if mode == "cycle" {
                for _ in 0..<12 {
                    let receipt = try inbox.keep(candidate(), id: UUID())
                    usleep(30_000)
                    checkTrue(try inbox.remove(receipt))
                }
                result["outcome"] = "cycled"
            } else if mode == "reader" {
                var reads = 0
                for _ in 0..<100 {
                    for receipt in try inbox.list() {
                        do {
                            let stored = try inbox.read(id: receipt.id)
                            checkEqual(stored.receipt, receipt); reads += 1
                        } catch SharedFileError.notFound { /* Removal can occur between these two transactions. */ }
                    }
                    usleep(10_000)
                }
                result["outcome"] = "read"; result["reads"] = reads
            } else {
                let stored = try inbox.keep(candidate(byte, count: count), id: id)
                result["outcome"] = "stored"; result["storedAt"] = stored.storedAtMilliseconds
                result["incarnation"] = stored.incarnation.uuidString.lowercased()
                result["sha256"] = stored.metadata.sha256
            }
        } catch let error as SharedFileError { result["outcome"] = error.rawValue }
        try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]).write(to: output.appendingPathComponent("result.json"))
    }
}

@main
private struct ShareCoreChecks {
    static func main() async {
        if Array(CommandLine.arguments.dropFirst()) == ["--child"] {
            do { try SharedFileInboxTests().testChildProcessEntry() }
            catch { fail("Child failed: \(error)") }
            for issue in checkIssues.values { print(issue) }
            Darwin.exit(checkIssues.values.isEmpty ? 0 : 1)
        }
        guard CommandLine.arguments.count == 3, ["--all", "--retry", "--identity"].contains(CommandLine.arguments[1]) else {
            print("Use --all, --retry or --identity <receipt-path> with an explicit KAIRO_SHARE_TEST_ROOT beneath .dharma or RUNNER_TEMP.")
            Darwin.exit(2)
        }
        let storage = SharedFileInboxTests(), providers = SharedItemProviderLoadTests()
        let drafts = SharedFileDraftTests()
        let groups: [(String, () async throws -> Void)] = [
            ("explicit-keep-retry-conflict-reopen-remove", { try storage.testExplicitKeepStableRetryConflictReopenAndRemoval() }),
            ("twenty-file-capacity-preserves-originals", { try storage.testTwentyItemCapacityDoesNotEvictOrConsumeOriginals() }),
            ("container-path-namespace-lock-guards", { try storage.testContainerSymlinkUnexpectedEntryAndLockSymlinkFailClosed() }),
            ("stored-content-header-truncation-symlink-guards", { try storage.testStoredBytesMetadataTruncationAndSymlinksAreRejected() }),
            ("stale-receipt-cannot-remove-changed-file", { try storage.testStaleReceiptCannotRemoveAChangedItem() }),
            ("same-clock-same-bytes-stale-receipt-refused", { try storage.testSameClockSameBytesReceiptCannotRemoveReplacement() }),
            ("publication-identity-header-and-legacy-preservation", { try storage.testPublicationIdentityHeaderIsRequiredAndLegacyIsPreserved() }),
            ("cancel-before-and-after-publication", { try await storage.testTaskCancellationBeforeAndAfterPublication() }),
            ("separate-process-item-and-byte-capacity", { try storage.testSeparateProcessesSerializeItemAndByteCapacity() }),
            ("separate-process-same-id-retry-and-conflict", { try storage.testSeparateProcessesSameIDRetryAndConflict() }),
            ("separate-process-reader-during-keep-remove", { try storage.testSeparateProcessReaderDuringKeepAndExplicitRemove() }),
            ("killed-writer-before-and-after-publish", { try storage.testKilledWriterBeforeAndAfterPublishHasResolvableOutcome() }),
            ("provider-copy-lifetime-and-explicit-keep", { try await providers.testProviderCopySurvivesCallbackAndOriginalDeletionWithoutKeeping() }),
            ("provider-supported-representations-one-attachment", { try await providers.testSupportedRepresentationsAndOneLogicalAttachment() }),
            ("provider-name-size-type-file-guards", { try await providers.testUntrustedNamesSizesTypesAndNonregularURLsAreRefused() }),
            ("provider-failure-redaction", { try await providers.testProviderErrorsAreRedacted() }),
            ("provider-cancel-timeout-late-single-completion", { try await providers.testCancellationTimeoutAndLateResultsCompleteExactlyOnce() }),
            ("candidate-byte-copy-and-read-cancellation", { try providers.testByteCopyDoesNotShareMutableBackingAndReadCancellationRefusesPublication() }),
            ("draft-provider-completion-is-not-keep", { try await drafts.testProviderCompletionIsNotKeepAndBytesOutliveOriginal() }),
            ("draft-loading-refusals-and-redacted-errors", { try await drafts.testLoadingRefusalsAndActualRedactedErrors() }),
            ("draft-load-revocation-and-late-reply", { try await drafts.testLoadingRevocationBeforeURLAndLateReply() }),
            ("draft-timeout-and-observer-cancellation", { try await drafts.testTimeoutAndObservationalCancellation() }),
            ("draft-concurrent-single-keep-admission", { try await drafts.testConcurrentKeepAdmissionIsSingleAndTerminal() }),
            ("draft-prepublication-revocation-retains-busy", { try await drafts.testPrepublicationRevocationKeepsBusyUntilSettlement() }),
            ("draft-postpublication-revocation-retains-unknown", { try await drafts.testPostpublicationRevocationRemainsUnknownWithoutDeletion() }),
            ("draft-raw-receipt-before-harvest-survives-revocation", { try await drafts.testKnownRawReceiptSurvivesRevocationBeforeOwnerHarvest() }),
            ("draft-knowledge-and-settlement-outlive-dismissal", { try await drafts.testReceiptKnowledgeAndStrongSettlementOutliveDismissal() }),
            ("draft-failure-preservation-and-no-removed-id-replay", { try await drafts.testFailuresPreserveStorageAndRemovedIDsCannotReplay() }),
        ]
        var results: [[String: Any]] = []
        let chosen: [(String, () async throws -> Void)]
        switch CommandLine.arguments[1] {
        case "--retry": chosen = groups.filter { $0.0 == "separate-process-same-id-retry-and-conflict" }
        case "--identity": chosen = groups.filter { ["same-clock-same-bytes-stale-receipt-refused", "publication-identity-header-and-legacy-preservation"].contains($0.0) }
        default: chosen = groups
        }
        for (name, work) in chosen {
            let before = checkIssues.values.count, started = ProcessInfo.processInfo.systemUptime
            do { try await work() } catch { fail("\(name): \(error)") }
            let passed = before == checkIssues.values.count
            results.append(["name": name, "status": passed ? "passed" : "failed", "seconds": ProcessInfo.processInfo.systemUptime - started])
            FileHandle.standardOutput.write(Data("\(passed ? "PASS" : "FAIL") \(name)\n".utf8))
        }
        let status = checkIssues.values.isEmpty ? "passed" : "failed"
        let receipt: [String: Any] = ["status": status, "runner": "compiled Foundation CLI checks; not XCTest or swift test",
            "pid": getpid(), "groups": results, "failures": checkIssues.values,
            "scope": "Real macOS Foundation/CryptoKit/Darwin, public NSItemProvider/inbox draft operations, existing DEBUG storage checkpoints and task-owned child processes with synthetic selected bytes/providers. No deterministic mid-copy draft checkpoint, durable draft restart recovery, share UI, image/PDF content validation, learner record, App Group, iOS build, device, signing or power-loss test."]
        do {
            let output = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
            guard output.resolvingSymlinksInPath().path.hasPrefix(try checkedTestRoot().path + "/") else { throw SharedFileError.invalidContainer }
            try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output)
        } catch { print("Receipt write failed: \(error)"); Darwin.exit(1) }
        for issue in checkIssues.values { print(issue) }
        Darwin.exit(status == "passed" ? 0 : 1)
    }
}
