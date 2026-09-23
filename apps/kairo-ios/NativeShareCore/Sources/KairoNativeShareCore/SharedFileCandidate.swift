import CryptoKit
import Darwin
import Foundation

/// Errors deliberately contain no provider errors, source paths or file bodies.
public enum SharedFileError: String, Error, Sendable {
    case invalidInput, unsupportedRepresentation, attachmentCount, providerUnavailable
    case cancelled, timeout, fileSize, fileChanged, invalidContainer, storageUnavailable
    case storageBusy, capacity, corruptItem, conflict, notFound, unfinishedWrite
    case commitOutcomeUnknown
}

public enum SharedFileLimits {
    public static let fileBytes = 20 * 1024 * 1024
    public static let storedBytes = 100 * 1024 * 1024
    public static let items = 20
    public static let providerSeconds: TimeInterval = 60
    public static let representations = ["public.png", "public.jpeg", "public.heic", "public.heif", "public.tiff", "com.adobe.pdf"]
}

/// Metadata is an observation about a delivered representation, not an image/PDF
/// validation, publisher identity, learner binding, rights grant or file access.
public struct SharedFileMetadata: Equatable, Sendable {
    public let name: String
    public let offeredType: String
    public let bytes: Int
    public let sha256: String
}

/// Public callers obtain bytes only from a completed native provider load or a
/// verified stored copy. There is intentionally no public metadata/data decoder
/// that mints a candidate. The containing app must still perform its normal
/// content inspection and document/foreground/learner checks before intake.
public struct SharedFileCandidate: Sendable {
    public let metadata: SharedFileMetadata
    private let payload: Data
    public var bytes: Data { payload }

    internal init(selectedBytes: Data, name: String, offeredType: String) throws {
        guard !selectedBytes.isEmpty, selectedBytes.count <= SharedFileLimits.fileBytes else { throw SharedFileError.fileSize }
        try Self.validate(name: name, offeredType: offeredType)
        // Own the bytes even if a native caller internally supplied bridged data.
        payload = selectedBytes.withUnsafeBytes { Data($0) }
        metadata = SharedFileMetadata(name: name, offeredType: offeredType, bytes: payload.count, sha256: Self.hash(payload))
    }

    internal static func validate(name: String, offeredType: String) throws {
        guard SharedFileLimits.representations.contains(offeredType) else { throw SharedFileError.unsupportedRepresentation }
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.utf16.count <= 255,
              name != ".", name != "..", !name.contains("/"), !name.contains("\\"),
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw SharedFileError.invalidInput
        }
    }

    internal static func hash(_ bytes: Data) -> String {
        SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }

    internal static func readSelectedFile(_ url: URL, name: String?, offeredType: String,
                                         cancelled: () -> Bool) throws -> Self {
        guard url.isFileURL else { throw SharedFileError.providerUnavailable }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        // loadFileRepresentation supplies a temporary copy, not an open-in-place
        // File Provider URL. Copy it within that callback; never retain its URL.
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard fd >= 0 else { throw SharedFileError.providerUnavailable }
        defer { close(fd) }
        let data = try SharedFileIO.read(fd, maximum: SharedFileLimits.fileBytes, cancelled: cancelled)
        return try Self(selectedBytes: data, name: name ?? url.lastPathComponent, offeredType: offeredType)
    }
}

internal enum SharedFileIO {
    static func read(_ fd: Int32, maximum: Int, cancelled: () -> Bool = { false }) throws -> Data {
        var before = stat()
        guard fstat(fd, &before) == 0, before.st_mode & S_IFMT == S_IFREG else { throw SharedFileError.invalidInput }
        guard before.st_size > 0, before.st_size <= maximum else { throw SharedFileError.fileSize }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: false)
        var bytes = Data()
        do {
            while bytes.count <= before.st_size {
                if cancelled() || Task<Never, Never>.isCancelled { throw SharedFileError.cancelled }
                let chunk = try handle.read(upToCount: min(65_536, Int(before.st_size) + 1 - bytes.count)) ?? Data()
                if chunk.isEmpty { break }
                bytes.append(chunk)
            }
        } catch let error as SharedFileError { throw error }
        catch { throw SharedFileError.storageUnavailable }
        var after = stat()
        guard fstat(fd, &after) == 0, bytes.count == before.st_size, after.st_size == before.st_size,
              after.st_mtimespec.tv_sec == before.st_mtimespec.tv_sec,
              after.st_mtimespec.tv_nsec == before.st_mtimespec.tv_nsec,
              after.st_ctimespec.tv_sec == before.st_ctimespec.tv_sec,
              after.st_ctimespec.tv_nsec == before.st_ctimespec.tv_nsec else { throw SharedFileError.fileChanged }
        if cancelled() || Task<Never, Never>.isCancelled { throw SharedFileError.cancelled }
        return bytes
    }
}
