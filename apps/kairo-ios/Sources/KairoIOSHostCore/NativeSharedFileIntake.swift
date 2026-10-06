import Foundation
import KairoNativeShareCore

/// A native display choice, not a document lease or permission to capture.
/// Its exact publication receipt and adapter identity cannot be reconstructed
/// from display metadata or passed through the renderer's closed file bridge.
public struct NativeSharedFileChoice: Sendable {
    fileprivate let receipt: SharedFileReceipt
    fileprivate let adapterID: UUID

    public var name: String { receipt.metadata.name }
    public var bytes: Int { receipt.metadata.bytes }
    /// This is the provider's offered type, rechecked against actual content
    /// only when the user selects this choice.
    public var offeredType: String { receipt.metadata.offeredType }
    public var storedAtMilliseconds: Int64 { receipt.storedAtMilliseconds }

    fileprivate init(receipt: SharedFileReceipt, adapterID: UUID) {
        self.receipt = receipt; self.adapterID = adapterID
    }
}

/// Reads a native-supplied holding container through its cooperative process
/// protocol. There is no App Group discovery, fallback, learner assignment,
/// producer retry, consumption, removal or record Save operation here.
///
/// Call listing/inspection off the UI thread under the existing intake job.
/// Before issuing a native selection token, the caller must recheck its current
/// document/foreground lease and the expected original-file fingerprint.
public final class NativeSharedFileIntake: Sendable {
    private let inbox: SharedFileInbox
    private let adapterID = UUID()

    public init(container: URL) throws {
        // The core may create its private namespace and permanent lock file.
        // It never creates a fallback for an absent or invalid native container.
        do { inbox = try SharedFileInbox(container: container) }
        catch { throw Self.failure(error) }
    }

    /// Lists only committed, validated storage envelopes. A choice still needs
    /// fresh byte/content inspection and the caller's explicit native action.
    public func choices() throws -> [NativeSharedFileChoice] {
        try checked {
            try inbox.list().map { NativeSharedFileChoice(receipt: $0, adapterID: adapterID) }
        }
    }

    /// Reopens exactly the displayed publication without cached-byte fallback.
    /// A removed ID is expired; another incarnation under that ID is changed,
    /// even if its payload, metadata and wall-clock millisecond match.
    public func readSelected(_ choice: NativeSharedFileChoice) throws -> NativeIntakeFile {
        try checked {
            guard choice.adapterID == adapterID else { throw NativeTextExtractionError("file-selection") }
            let stored = try inbox.read(id: choice.receipt.id)
            guard stored.receipt == choice.receipt else { throw NativeTextExtractionError("file-changed") }
            let metadata = stored.candidate.metadata
            let value = try NativeIntakeFile.inspect(data: stored.candidate.bytes, name: metadata.name)
            let types = ["public.png": "image/png", "public.jpeg": "image/jpeg", "public.heic": "image/heic",
                         "public.heif": "image/heif", "public.tiff": "image/tiff", "com.adobe.pdf": "application/pdf"]
            guard metadata == stored.receipt.metadata,
                  value.file.sha256 == metadata.sha256, value.file.bytes == metadata.bytes,
                  let mime = types[metadata.offeredType], value.file.mimeType == mime,
                  value.file.kind == (mime == "application/pdf" ? "pdf" : "image") else {
                throw NativeTextExtractionError("file-mismatch")
            }
            return value
        }
    }

    private func checked<T>(_ work: () throws -> T) throws -> T {
        do {
            try Task.checkCancellation()
            let value = try work()
            try Task.checkCancellation()
            return value
        } catch { throw Self.failure(error) }
    }

    private static func failure(_ error: Error) -> NativeTextExtractionError {
        if let error = error as? NativeTextExtractionError { return error }
        if error is CancellationError { return NativeTextExtractionError("source-owner-changed") }
        let code: String
        switch error as? SharedFileError {
        case .cancelled: code = "source-owner-changed"
        case .notFound: code = "file-selection-expired"
        case .conflict, .fileChanged, .corruptItem: code = "file-changed"
        case .storageBusy: code = "file-intake-busy"
        case .fileSize: code = "file-size"
        default: code = "file-intake-unavailable"
        }
        return NativeTextExtractionError(code)
    }
}
