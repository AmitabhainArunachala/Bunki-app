import Foundation
import CoreFoundation
import CoreGraphics
import ImageIO
import Darwin

/// A closed request carries a candidate fingerprint, never a native URL.
public enum NativeFileIntakeRequest: Sendable {
    case available
    case choose(expected: NativeFileSummary?)
    case extract(token: String, firstPage: Int, lastPage: Int)
    case openOriginal(file: NativeFileSummary)

    public static func parse(_ value: Any) throws -> Self {
        guard let body = value as? [String: Any], let method = body["method"] as? String else {
            throw NativeTextExtractionError("invalid-input")
        }
        switch method {
        case "available" where Set(body.keys) == ["method"]: return .available
        case "choose" where Set(body.keys) == ["method", "expected"]:
            return .choose(expected: body["expected"] is NSNull ? nil : try reference(body["expected"]))
        case "extract" where Set(body.keys) == ["method", "token", "firstPage", "lastPage"]:
            guard let token = body["token"] as? String, UUID(uuidString: token) != nil,
                  let first = integer(body["firstPage"], maximum: 10_000),
                  let last = integer(body["lastPage"], maximum: 10_000), last >= first,
                  last - first < NativeTextExtractor.maxPagesPerRequest else {
                throw NativeTextExtractionError("invalid-page-range")
            }
            return .extract(token: token, firstPage: first, lastPage: last)
        case "openOriginal" where Set(body.keys) == ["method", "file"]:
            return .openOriginal(file: try reference(body["file"]))
        default: throw NativeTextExtractionError("invalid-input")
        }
    }

    private static func integer(_ value: Any?, maximum: Int) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let value = number.doubleValue
        guard value.isFinite, value >= 1, value <= Double(maximum), value.rounded(.towardZero) == value else { return nil }
        return Int(value)
    }

    private static func reference(_ value: Any?) throws -> NativeFileSummary {
        guard let raw = value as? [String: Any],
              Set(raw.keys) == ["name", "sha256", "bytes", "mimeType", "kind", "pageCount"],
              let name = raw["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              name.utf16.count <= 255, name != ".", name != "..", !name.contains("/"), !name.contains("\\"),
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              let hash = raw["sha256"] as? String, hash.utf8.count == 64,
              hash.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
              let size = integer(raw["bytes"], maximum: NativeTextExtractor.maxFileBytes),
              let pages = integer(raw["pageCount"], maximum: 10_000),
              let mime = raw["mimeType"] as? String, let kind = raw["kind"] as? String,
              (kind == "pdf" && mime == "application/pdf") ||
                (kind == "image" && pages == 1 && ["image/png", "image/jpeg", "image/heic", "image/heif", "image/tiff"].contains(mime)) else {
            throw NativeTextExtractionError("invalid-file-reference")
        }
        return NativeFileSummary(name: name, sha256: hash, bytes: size, mimeType: mime, kind: kind, pageCount: pages)
    }
}

/// Only native selection/inspection can construct these immutable bytes.
/// Retaining a portable NativeFileSummary cannot construct or recover them.
public struct NativeIntakeFile: Sendable {
    public let file: NativeFileSummary
    private let bytes: Data

    public static func inspect(data: Data, name: String) throws -> Self {
        Self(file: try NativeTextExtractor.inspect(data: data, name: name), bytes: data)
    }

    public static func readChosenURL(_ url: URL, name: String? = nil) throws -> Self {
        guard url.isFileURL else { throw NativeTextExtractionError("file-selection") }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var original = stat()
        // Coordination can itself open the item before our accessor runs.
        // Refuse pipes, devices, directories and symlinks before that step.
        if lstat(url.path, &original) == 0, original.st_mode & S_IFMT != S_IFREG {
            throw NativeTextExtractionError("file-selection")
        }
        // File Provider may materialize or move the selected document during
        // coordination. Only its native accessor URL enters the bounded read.
        var failure: NSError?
        var result: Result<Self, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &failure) { coordinatedURL in
            result = Result { try readRegularURL(coordinatedURL, name: name) }
        }
        guard failure == nil, let result else { throw NativeTextExtractionError("file-selection") }
        return try result.get()
    }

    private static func readRegularURL(_ url: URL, name: String?) throws -> Self {
        var before = stat()
        guard lstat(url.path, &before) == 0, before.st_mode & S_IFMT == S_IFREG,
              before.st_size > 0, before.st_size <= NativeTextExtractor.maxFileBytes else {
            throw NativeTextExtractionError("file-size")
        }
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard fd >= 0 else { throw NativeTextExtractionError("file-selection") }
        defer { close(fd) }
        var opened = stat()
        guard fstat(fd, &opened) == 0, opened.st_mode & S_IFMT == S_IFREG,
              opened.st_dev == before.st_dev, opened.st_ino == before.st_ino, opened.st_size == before.st_size else {
            throw NativeTextExtractionError("file-changed")
        }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: false)
        var data = Data()
        while data.count <= opened.st_size {
            try Task.checkCancellation()
            let chunk = try handle.read(upToCount: min(65_536, Int(opened.st_size) + 1 - data.count)) ?? Data()
            if chunk.isEmpty { break }
            data.append(chunk)
        }
        var after = stat()
        guard fstat(fd, &after) == 0, data.count == opened.st_size, after.st_size == opened.st_size,
              after.st_mtimespec.tv_sec == opened.st_mtimespec.tv_sec,
              after.st_mtimespec.tv_nsec == opened.st_mtimespec.tv_nsec,
              after.st_ctimespec.tv_sec == opened.st_ctimespec.tv_sec,
              after.st_ctimespec.tv_nsec == opened.st_ctimespec.tv_nsec else {
            throw NativeTextExtractionError("file-changed")
        }
        try Task.checkCancellation()
        return try inspect(data: data, name: name ?? url.lastPathComponent)
    }

    public func matches(_ candidate: NativeFileSummary) -> Bool {
        file.sha256 == candidate.sha256 && file.bytes == candidate.bytes && file.kind == candidate.kind &&
            file.mimeType == candidate.mimeType && file.pageCount == candidate.pageCount
    }

    public func extract(firstPage: Int, lastPage: Int) throws -> NativeTextDocument {
        try Task.checkCancellation()
        let result = try NativeTextExtractor.extract(data: bytes, name: file.name, firstPage: firstPage, lastPage: lastPage)
        try Task.checkCancellation()
        return result
    }

    /// The directory is supplied by native application code, never the bridge.
    /// Callers own cleanup of this one generated subdirectory after preview.
    public func writePreview(in directory: URL) throws -> URL {
        let extensions = ["application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg",
                          "image/heic": "heic", "image/heif": "heif", "image/tiff": "tiff"]
        guard let suffix = extensions[file.mimeType], directory.isFileURL else { throw NativeTextExtractionError("file-viewer-unavailable") }
        let root = directory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        do {
            let destination = root.appendingPathComponent("source." + suffix)
            #if os(iOS)
            try bytes.write(to: destination, options: [.atomic, .completeFileProtection])
            #else
            try bytes.write(to: destination, options: [.atomic])
            #endif
            try FileManager.default.setAttributes([.posixPermissions: 0o400], ofItemAtPath: destination.path)
            return destination
        } catch {
            try? FileManager.default.removeItem(at: root)
            throw NativeTextExtractionError("file-viewer-unavailable")
        }
    }
}

/// A native camera supplies a decoded image, not a reusable source-file URL.
/// Keep its pixels/orientation immutable until a bounded JPEG is encoded off
/// the UI thread. This represents that selected capture, never a raw original
/// asset, camera permission, or permission to add it to a learner record.
public struct NativeCameraImage: Sendable {
    private let image: CGImage
    private let orientation: UInt32

    public init(image: CGImage, orientation: UInt32) throws {
        guard (1...8).contains(orientation) else { throw NativeTextExtractionError("image-orientation") }
        guard image.width > 0, image.height > 0, image.width <= 40_000, image.height <= 40_000,
              image.width <= 40_000_000 / image.height else { throw NativeTextExtractionError("image-size") }
        self.image = image; self.orientation = orientation
    }

    public func encode(name: String, maximumBytes: Int = NativeTextExtractor.maxFileBytes) throws -> NativeIntakeFile {
        try Task.checkCancellation()
        guard maximumBytes > 0, maximumBytes <= NativeTextExtractor.maxFileBytes else { throw NativeTextExtractionError("file-size") }
        let buffer = CameraEncodingBuffer(limit: maximumBytes)
        let retained = Unmanaged.passRetained(buffer).toOpaque()
        var callbacks = CGDataConsumerCallbacks(putBytes: { info, bytes, count in
            guard let info else { return 0 }
            return Unmanaged<CameraEncodingBuffer>.fromOpaque(info).takeUnretainedValue().append(bytes, count: count)
        }, releaseConsumer: { info in
            if let info { Unmanaged<CameraEncodingBuffer>.fromOpaque(info).release() }
        })
        guard let consumer = CGDataConsumer(info: retained, cbks: &callbacks) else {
            Unmanaged<CameraEncodingBuffer>.fromOpaque(retained).release()
            throw NativeTextExtractionError("unreadable-image")
        }
        guard let destination = CGImageDestinationCreateWithDataConsumer(consumer, "public.jpeg" as CFString, 1, nil) else {
            throw NativeTextExtractionError("unreadable-image")
        }
        // Only explicit orientation and quality enter the new representation;
        // no camera metadata, GPS, photo-library ID or original-file claim does.
        let properties: [CFString: Any] = [kCGImagePropertyOrientation: orientation,
                                           kCGImageDestinationLossyCompressionQuality: 0.9]
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        let finished = CGImageDestinationFinalize(destination)
        try Task.checkCancellation()
        let bytes = try buffer.result()
        guard finished else { throw NativeTextExtractionError("unreadable-image") }
        return try NativeIntakeFile.inspect(data: bytes, name: name)
    }
}

private final class CameraEncodingBuffer {
    private let lock = NSLock()
    private let limit: Int
    private var bytes = Data()
    private var exceeded = false
    init(limit: Int) { self.limit = limit }

    func append(_ pointer: UnsafeRawPointer, count: Int) -> Int {
        lock.lock(); defer { lock.unlock() }
        guard !exceeded, count >= 0, count <= limit - bytes.count else { exceeded = true; return 0 }
        bytes.append(pointer.assumingMemoryBound(to: UInt8.self), count: count)
        return count
    }

    func result() throws -> Data {
        lock.lock(); defer { lock.unlock() }
        guard !exceeded else { throw NativeTextExtractionError("file-size") }
        return bytes
    }
}

/// One selected Photos representation, never a photo-library identifier or
/// general file bridge. The provider's temporary URL must be read inside its
/// callback. Cancellation revokes publication immediately; an already running
/// bounded read settles before releasing its caller's exclusive intake job.
public final class NativePhotoIntakeLoad: @unchecked Sendable {
    public typealias Completion = @Sendable (Result<NativeIntakeFile, NativeTextExtractionError>) -> Void
    private enum Phase { case idle, waiting, reading, finished }
    private let lock = NSLock()
    private var phase = Phase.idle
    private var completion: Completion?
    private var progress: Progress?
    private var deadline: DispatchWorkItem?
    private var cancellation: String?

    public init(completion: @escaping Completion) { self.completion = completion }

    public func start(provider: NSItemProvider, timeout: TimeInterval = 60) {
        lock.lock()
        guard phase == .idle else { lock.unlock(); return }
        phase = .waiting
        lock.unlock()
        let types = ["public.png": "image/png", "public.jpeg": "image/jpeg", "public.heic": "image/heic",
                     "public.heif": "image/heif", "public.tiff": "image/tiff"]
        // Request an explicitly offered supported representation. A generic
        // image/object request could silently convert bytes or allocate a huge
        // decoded image before the bounded native admission step.
        guard let type = provider.registeredTypeIdentifiers.first(where: { types[$0] != nil }),
              let mime = types[type] else { cancel(code: "unsupported-image"); return }
        let name = provider.suggestedName
        let timer = DispatchWorkItem { [weak self] in self?.cancel(code: "file-intake-unavailable") }
        lock.lock()
        guard phase == .waiting else { lock.unlock(); return }
        deadline = timer
        lock.unlock()
        DispatchQueue.global().asyncAfter(deadline: .now() + (timeout.isFinite && timeout > 0 && timeout <= 60 ? timeout : 60), execute: timer)
        let loading = provider.loadFileRepresentation(forTypeIdentifier: type) { [self] url, error in
            lock.lock()
            guard phase == .waiting else { lock.unlock(); return }
            phase = .reading
            lock.unlock()
            let result: Result<NativeIntakeFile, NativeTextExtractionError>
            do {
                guard error == nil, let url else { throw NativeTextExtractionError("file-intake-unavailable") }
                let value = try NativeIntakeFile.readChosenURL(url, name: name)
                guard value.file.kind == "image", value.file.mimeType == mime else { throw NativeTextExtractionError("unsupported-image") }
                result = .success(value)
            } catch { result = .failure((error as? NativeTextExtractionError) ?? NativeTextExtractionError("file-intake-failed")) }
            lock.lock()
            let callback = completion
            let final = cancellation.map { Result<NativeIntakeFile, NativeTextExtractionError>.failure(NativeTextExtractionError($0)) } ?? result
            phase = .finished; completion = nil; progress = nil
            let timer = deadline; deadline = nil
            lock.unlock()
            timer?.cancel()
            callback?(final)
        }
        lock.lock()
        let stop = phase == .finished || cancellation != nil
        if !stop { progress = loading }
        lock.unlock()
        if stop { loading.cancel() }
    }

    public func cancel() { cancel(code: "source-owner-changed") }

    private func cancel(code: String) {
        lock.lock()
        guard phase != .finished else { lock.unlock(); return }
        if cancellation == nil { cancellation = code }
        let loading = progress; progress = nil
        let timer = deadline; deadline = nil
        let callback = phase == .reading ? nil : completion
        if phase != .reading { phase = .finished; completion = nil }
        lock.unlock()
        timer?.cancel(); loading?.cancel()
        callback?(.failure(NativeTextExtractionError(code)))
    }
}

public struct NativeFileIntakeLease: Sendable {
    fileprivate let id: UUID
    fileprivate let generation: UUID
    fileprivate let document: UUID
}

/// An issued lease and native selected bytes are necessary for extraction.
/// Revocation removes selection immediately but keeps a running job busy until
/// finish: in-process Vision work must not overlap a replacement job.
@MainActor
public final class NativeFileIntakeSession {
    private var generation = UUID()
    private var active: UUID?
    private var selection: (token: String, document: UUID, expires: TimeInterval, value: NativeIntakeFile)?
    private let clock: () -> TimeInterval
    private let ttl: TimeInterval

    public init(ttl: TimeInterval = 600, clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.ttl = ttl.isFinite && ttl > 0 && ttl <= 600 ? ttl : 600
        self.clock = clock
    }

    public var isBusy: Bool { active != nil }

    public func begin(document: UUID) throws -> NativeFileIntakeLease {
        guard active == nil else { throw NativeTextExtractionError("file-intake-busy") }
        let lease = NativeFileIntakeLease(id: UUID(), generation: generation, document: document)
        active = lease.id
        return lease
    }

    public func assertCurrent(_ lease: NativeFileIntakeLease, document: UUID) throws {
        guard active == lease.id, generation == lease.generation, document == lease.document else {
            throw NativeTextExtractionError("source-owner-changed")
        }
    }

    public func finish(_ lease: NativeFileIntakeLease) {
        if active == lease.id { active = nil }
    }

    public func invalidate() {
        generation = UUID()
        selection = nil
    }

    public func clearSelection() { selection = nil }
    public func clearSelection(ifToken token: String) {
        if selection?.token == token { selection = nil }
    }

    public func select(_ value: NativeIntakeFile, expected: NativeFileSummary?, lease: NativeFileIntakeLease, document: UUID) throws -> String {
        try assertCurrent(lease, document: document)
        if let expected, !value.matches(expected) { throw NativeTextExtractionError("file-mismatch") }
        let now = clock()
        guard now.isFinite, now >= 0 else { throw NativeTextExtractionError("file-selection-expired") }
        let token = UUID().uuidString.lowercased()
        selection = (token, document, now + ttl, value)
        return token
    }

    public func selected(token: String, firstPage: Int, lastPage: Int, lease: NativeFileIntakeLease, document: UUID) throws -> NativeIntakeFile {
        try assertCurrent(lease, document: document)
        let now = clock()
        guard let selected = selection, now.isFinite, now >= 0, now < selected.expires else {
            selection = nil
            throw NativeTextExtractionError("file-selection-expired")
        }
        guard selected.document == document, token == selected.token else { throw NativeTextExtractionError("file-selection-expired") }
        guard firstPage >= 1, lastPage >= firstPage, lastPage <= selected.value.file.pageCount,
              lastPage - firstPage < NativeTextExtractor.maxPagesPerRequest else {
            throw NativeTextExtractionError("invalid-page-range")
        }
        return selected.value
    }
}
