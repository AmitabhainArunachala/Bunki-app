import Foundation
@testable import KairoNativeShareCore

private final class CompletionCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    func increment() -> Int { lock.lock(); defer { lock.unlock() }; count += 1; return count }
    var value: Int { lock.lock(); defer { lock.unlock() }; return count }
}

final class SharedItemProviderLoadTests: @unchecked Sendable {
    private func fixture() throws -> URL {
        let directory = try shareTestDirectory("provider")
        let file = directory.appendingPathComponent("選んだ版.png")
        // Delivered representation bytes are staged candidates. This core does
        // not claim these synthetic bytes are a decoded/validated image.
        try Data([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]).write(to: file)
        return file
    }

    private func provider(_ file: URL, type: String = "public.png", name: String = "選んだ版.png",
                          delay: TimeInterval = 0, failure: Bool = false, nilValue: Bool = false) -> NSItemProvider {
        let result = NSItemProvider(); result.suggestedName = name
        result.registerFileRepresentation(forTypeIdentifier: type, fileOptions: [], visibility: .ownProcess) { reply in
            let respond: @Sendable () -> Void = {
                if failure { reply(nil, false, NSError(domain: "private-provider-location-must-not-escape", code: 321)) }
                else { reply(nilValue ? nil : file, false, nil) }
            }
            if delay > 0 { DispatchQueue.global().asyncAfter(deadline: .now() + delay, execute: respond) }
            else { respond() }
            return Progress(totalUnitCount: 1)
        }
        return result
    }

    private func load(_ providers: [NSItemProvider], timeout: TimeInterval = 2, cancel: Bool = false,
                      counter: CompletionCounter = CompletionCounter()) async -> Result<SharedFileCandidate, SharedFileError> {
        await withCheckedContinuation { continuation in
            let loader = SharedItemProviderLoad { result in
                if counter.increment() == 1 { continuation.resume(returning: result) }
            }
            loader.start(attachments: providers, timeout: timeout)
            if cancel { loader.cancel(); loader.cancel() }
        }
    }

    func testProviderCopySurvivesCallbackAndOriginalDeletionWithoutKeeping() async throws {
        let file = try fixture(), original = try Data(contentsOf: file)
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent())
        let candidate = try await load([provider(file)]).get()
        try FileManager.default.removeItem(at: file)
        checkEqual(candidate.bytes, original)
        checkEqual(candidate.metadata.sha256, SharedFileCandidate.hash(original))
        checkEqual(candidate.metadata.name, "選んだ版.png")
        checkEqual(candidate.metadata.offeredType, "public.png")
        checkEqual(try inbox.list(), [], "Loading is not a Keep or a learner capture")
        let id = UUID(), receipt = try inbox.keep(candidate, id: id)
        checkEqual(try inbox.read(id: id).candidate.bytes, original)
        checkEqual(try inbox.list(), [receipt])
    }

    func testSupportedRepresentationsAndOneLogicalAttachment() async throws {
        let file = try fixture()
        for type in SharedFileLimits.representations {
            let selected = try await load([provider(file, type: type)]).get()
            checkEqual(selected.metadata.offeredType, type)
        }
        let both = provider(file)
        both.registerFileRepresentation(forTypeIdentifier: "public.jpeg", fileOptions: [], visibility: .ownProcess) { reply in
            reply(file, false, nil); return Progress(totalUnitCount: 1)
        }
        let selected = try await load([both]).get()
        checkEqual(selected.metadata.offeredType, "public.png")
        for candidates in [[], [provider(file), provider(file)]] {
            if case .failure(.attachmentCount) = await load(candidates) {} else { fail("Expected one attachment") }
        }
        if case .failure(.unsupportedRepresentation) = await load([provider(file, type: "public.url")]) {} else { fail("URL must not be fetched") }
    }

    func testUntrustedNamesSizesTypesAndNonregularURLsAreRefused() async throws {
        let file = try fixture()
        for name in ["", "..", "../a.png", "bad\\a.png", "x\n.png", String(repeating: "a", count: 256)] {
            if case .failure(.invalidInput) = await load([provider(file, name: name)]) {} else { fail("Unsafe display name accepted") }
        }
        let huge = file.deletingLastPathComponent().appendingPathComponent("huge.pdf")
        let handle = FileHandle(forWritingAtPath: huge.path) ?? {
            FileManager.default.createFile(atPath: huge.path, contents: nil)
            return FileHandle(forWritingAtPath: huge.path)!
        }()
        try handle.truncate(atOffset: UInt64(SharedFileLimits.fileBytes + 1)); try handle.close()
        if case .failure = await load([provider(huge, type: "com.adobe.pdf")]) {} else { fail("Oversize accepted") }
        for invalid in [URL(string: "https://example.invalid/source.png")!, file.deletingLastPathComponent()] {
            checkThrows(try SharedFileCandidate.readSelectedFile(invalid, name: "image.png", offeredType: "public.png", cancelled: { false }))
        }
        let link = file.deletingLastPathComponent().appendingPathComponent("link.png")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: file)
        checkThrows(try SharedFileCandidate.readSelectedFile(link, name: "image.png", offeredType: "public.png", cancelled: { false }))
        checkThrows(try SharedFileCandidate(selectedBytes: Data(), name: "a.png", offeredType: "public.png"))
    }

    func testProviderErrorsAreRedacted() async throws {
        let file = try fixture()
        for input in [provider(file, failure: true), provider(file, nilValue: true)] {
            if case .failure(.providerUnavailable) = await load([input]) {} else { fail("Provider detail escaped or failure accepted") }
        }
    }

    func testCancellationTimeoutAndLateResultsCompleteExactlyOnce() async throws {
        let file = try fixture()
        for cancellation in [true, false] {
            let count = CompletionCounter()
            let result = await load([provider(file, delay: 0.2)], timeout: cancellation ? 2 : 0.02, cancel: cancellation, counter: count)
            if case .failure(let error) = result { checkEqual(error, cancellation ? .cancelled : .timeout) }
            else { fail("A revoked selection returned bytes") }
            try await Task.sleep(for: .milliseconds(300))
            checkEqual(count.value, 1)
        }
        let count = CompletionCounter()
        let loader = SharedItemProviderLoad { result in
            if count.increment() == 1 {
                if case .failure(.cancelled) = result {} else { fail("Unexpected pre-start outcome") }
            }
        }
        loader.cancel(); loader.start(attachments: [provider(file)]); loader.start(attachments: [provider(file)])
        checkEqual(count.value, 1); checkFalse(loader.isBusy)
    }

    func testByteCopyDoesNotShareMutableBackingAndReadCancellationRefusesPublication() throws {
        let original = NSMutableData(data: Data([1, 2, 3, 4]))
        let candidate = try SharedFileCandidate(selectedBytes: original as Data, name: "a.png", offeredType: "public.png")
        original.replaceBytes(in: NSRange(location: 0, length: 1), withBytes: [UInt8(99)])
        var exposed = candidate.bytes; exposed[1] = 88
        checkEqual(candidate.bytes, Data([1, 2, 3, 4]))
        let file = try fixture()
        checkThrows(try SharedFileCandidate.readSelectedFile(file, name: "a.png", offeredType: "public.png", cancelled: { true })) {
            checkEqual($0 as? SharedFileError, .cancelled)
        }
    }
}
