import Darwin
import Foundation

public struct SharedFileReceipt: Equatable, Sendable {
    public let id: UUID
    /// Identifies this publication, independently of payload or wall-clock time.
    /// It is not a learner identity or permission to capture a source.
    public let incarnation: UUID
    public let storedAtMilliseconds: Int64
    public let metadata: SharedFileMetadata
}

public struct SharedStoredFile: Sendable {
    public let receipt: SharedFileReceipt
    public let candidate: SharedFileCandidate
}

private struct StoredHeader: Codable {
    let version: Int
    let id: String
    let incarnation: String
    let storedAtMilliseconds: Int64
    let name: String
    let offeredType: String
    let bytes: Int
    let sha256: String
}

#if DEBUG
internal enum SharedFileCheckpoint: Sendable, Equatable {
    case temporaryFlushed, published
    case storageFailure(String, Int32)
    case namespaceOpened(Int32, UInt64)
}
#endif

/// A file holding area, not a learner record or an import queue. The native
/// adapter must supply an existing approved container; no App Group discovery,
/// fallback path, learner assignment or consume-on-read occurs in this module.
///
/// Each operation opens its own flock descriptor. This serializes separate
/// instances, threads and processes that follow this storage protocol. The
/// directory FD pins the namespace and all children use openat/no-follow.
/// This is cooperative synchronization, not isolation from an entitled process
/// that deliberately ignores the protocol. POSIX permissions are private;
/// iOS Data Protection and App Group provisioning require device verification.
/// Header v2 requires publication identity. The v1 namespace/envelope framing is
/// retained; legacy headers without identity fail closed and stay on disk. This
/// module never assigns an identity during read or silently migrates old files.
public final class SharedFileInbox: @unchecked Sendable {
    internal static let directoryName = "KairoSharedFiles-v1"
    private static let magic = Data("KAIRO-SHARE-1\n".utf8)
    private static let headerLimit = 4096
    private static let maximumEnvelope = SharedFileLimits.fileBytes + headerLimit + magic.count + 4
    private let directoryFD: Int32
    private let lockSeconds: TimeInterval
#if DEBUG
    // Assigned only during internal test construction, before the instance is
    // returned. These fields and their initializer do not exist in release.
    private var checkpoint: (@Sendable (SharedFileCheckpoint) -> Void)?
    private var testClock: (@Sendable () -> TimeInterval)?
#endif

    public init(container: URL, lockTimeout: TimeInterval = 2) throws {
        guard container.isFileURL, lockTimeout.isFinite, lockTimeout > 0, lockTimeout <= 5 else { throw SharedFileError.invalidContainer }
        let containerFD = open(container.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard containerFD >= 0 else { throw SharedFileError.invalidContainer }
        defer { close(containerFD) }
        let created = mkdirat(containerFD, Self.directoryName, 0o700) == 0
        guard created || errno == EEXIST else { throw SharedFileError.storageUnavailable }
        if created, fsync(containerFD) != 0 { throw SharedFileError.storageUnavailable }
        let fd = openat(containerFD, Self.directoryName, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw SharedFileError.invalidContainer }
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_uid == geteuid(), info.st_mode & 0o077 == 0 else {
            close(fd); throw SharedFileError.invalidContainer
        }
        directoryFD = fd; lockSeconds = lockTimeout
    }

#if DEBUG
    internal convenience init(container: URL, lockTimeout: TimeInterval,
                              checkpoint: (@Sendable (SharedFileCheckpoint) -> Void)?,
                              testClock: (@Sendable () -> TimeInterval)? = nil) throws {
        try self.init(container: container, lockTimeout: lockTimeout)
        self.checkpoint = checkpoint; self.testClock = testClock
        var info = stat()
        guard fstat(directoryFD, &info) == 0 else { throw SharedFileError.storageUnavailable }
        let fd = directoryFD
        checkpoint?(.namespaceOpened(fd, info.st_ino))
    }
#endif

    deinit { close(directoryFD) }

    /// Call only for the native user's explicit Keep action, retaining one ID
    /// for that operation. Same ID and exact bytes return the ORIGINAL receipt
    /// (including original incarnation/name/type/time); different bytes conflict. No source
    /// read or provider callback invokes this API automatically.
    ///
    /// After an uncertain outcome, read that ID first. Never blindly retry with
    /// a new ID. Explicit removal ends the stored item's idempotency window; a
    /// later deliberate Keep is a new user action, not recovery of that removal.
    public func keep(_ candidate: SharedFileCandidate, id: UUID) throws -> SharedFileReceipt {
        try withLock {
            let final = Self.finalName(id), pending = Self.pendingName(id)
            let entries = try inventory()
            if entries.contains(where: { $0.name == final }) {
                let stored = try readUnlocked(id)
                guard stored.candidate.bytes == candidate.bytes else { throw SharedFileError.conflict }
                return stored.receipt
            }
            guard !entries.contains(where: { $0.name == pending }) else { throw SharedFileError.unfinishedWrite }
#if DEBUG
            let now = (testClock?() ?? Date().timeIntervalSince1970) * 1000
#else
            let now = Date().timeIntervalSince1970 * 1000
#endif
            guard now.isFinite, now >= 0, now <= 253_402_300_799_999 else { throw SharedFileError.storageUnavailable }
            let m = candidate.metadata
            let header = StoredHeader(version: 2, id: id.uuidString.lowercased(), incarnation: UUID().uuidString.lowercased(),
                                      storedAtMilliseconds: Int64(now),
                                      name: m.name, offeredType: m.offeredType, bytes: m.bytes, sha256: m.sha256)
            let prefix = try Self.prefix(header)
            guard entries.count < SharedFileLimits.items,
                  entries.reduce(0, { $0 + $1.size }) + prefix.count + m.bytes <= SharedFileLimits.storedBytes else {
                throw SharedFileError.capacity
            }
            try cancellation()
            let fd = openat(directoryFD, pending, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
            guard fd >= 0 else { throw unavailable("pending-open") }
            var published = false
            defer {
                close(fd)
                // Only this invocation's unpublished preparation is removed.
                // Kept files and leftovers from a killed writer are never swept.
                if !published { _ = unlinkat(directoryFD, pending, 0) }
            }
            do {
                try write(prefix, to: fd)
                try write(candidate.bytes, to: fd)
                guard fchmod(fd, 0o400) == 0, fsync(fd) == 0 else { throw unavailable("pending-flush") }
#if DEBUG
                checkpoint?(.temporaryFlushed)
#endif
                try cancellation()
                // Exclusive rename refuses replacement even if a noncooperating
                // writer inserts a destination while the lock is held.
                guard renameatx_np(directoryFD, pending, directoryFD, final, UInt32(RENAME_EXCL)) == 0 else {
                    throw unavailable("publish-rename")
                }
                published = true
#if DEBUG
                checkpoint?(.published)
#endif
                guard fsync(directoryFD) == 0 else { throw SharedFileError.commitOutcomeUnknown }
                let stored = try readUnlocked(id)
                guard stored.candidate.bytes == candidate.bytes else { throw SharedFileError.commitOutcomeUnknown }
                return stored.receipt
            } catch {
                // A late cancellation/error must not report that published data
                // vanished. Resolve by the original ID; never delete to retry.
                if published { throw SharedFileError.commitOutcomeUnknown }
                throw (error as? SharedFileError) ?? .storageUnavailable
            }
        }
    }

    public func list() throws -> [SharedFileReceipt] {
        try withLock {
            try inventory().compactMap { entry in
                guard let id = Self.finalID(entry.name) else { return nil }
                return try readUnlocked(id).receipt
            }.sorted { $0.id.uuidString < $1.id.uuidString }
        }
    }

    /// Returns a copy without changing the holding area or claiming capture.
    public func read(id: UUID) throws -> SharedStoredFile { try withLock { try readUnlocked(id) } }

    /// A killed writer's unfinished preparation is visible for explicit native
    /// recovery. It counts toward capacity; it is never a selectable source.
    public func unfinishedWrites() throws -> [UUID] {
        try withLock { try inventory().compactMap { Self.pendingID($0.name) }.sorted { $0.uuidString < $1.uuidString } }
    }

    /// Explicit native removal only. The exact receipt prevents a stale UI from
    /// deleting an item that was removed and deliberately kept again under an ID,
    /// even when its bytes, metadata and wall-clock millisecond are unchanged.
    public func remove(_ expected: SharedFileReceipt) throws -> Bool {
        try withLock {
            let stored: SharedStoredFile
            do { stored = try readUnlocked(expected.id) }
            catch SharedFileError.notFound { return false }
            guard stored.receipt == expected else { throw SharedFileError.conflict }
            guard unlinkat(directoryFD, Self.finalName(expected.id), 0) == 0 else { throw SharedFileError.storageUnavailable }
            guard fsync(directoryFD) == 0 else { throw SharedFileError.commitOutcomeUnknown }
            return true
        }
    }

    /// Separate explicit discard, never an automatic cleanup or a final-file
    /// removal. Call after resolving the associated Keep outcome by its ID.
    public func discardUnfinishedWrite(id: UUID) throws -> Bool {
        try withLock {
            let entries = try inventory()
            guard entries.contains(where: { $0.name == Self.pendingName(id) }) else { return false }
            guard !entries.contains(where: { $0.name == Self.finalName(id) }) else { throw SharedFileError.conflict }
            guard unlinkat(directoryFD, Self.pendingName(id), 0) == 0 else { throw SharedFileError.storageUnavailable }
            guard fsync(directoryFD) == 0 else { throw SharedFileError.commitOutcomeUnknown }
            return true
        }
    }

    private func cancellation() throws {
        if Task<Never, Never>.isCancelled { throw SharedFileError.cancelled }
    }

    private func unavailable(_ operation: String) -> SharedFileError {
#if DEBUG
        checkpoint?(.storageFailure(operation, errno))
#endif
        return .storageUnavailable
    }

    private func withLock<T>(_ action: () throws -> T) throws -> T {
        try cancellation()
        let flags = O_RDWR | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC
        var fd = openat(directoryFD, ".lock", flags)
        if fd < 0 && errno == ENOENT {
            // One process creates the permanent lock inode. A competing
            // initializer may have just created it, so reopen that inode once
            // without creation flags; never replace it or retry indefinitely.
            fd = openat(directoryFD, ".lock", flags | O_CREAT | O_EXCL, 0o600)
            if fd < 0 && (errno == EEXIST || errno == ENOENT) {
                fd = openat(directoryFD, ".lock", flags)
            }
        }
        guard fd >= 0 else {
#if DEBUG
            let failure = errno
            var state = stat()
            let observed = fstat(directoryFD, &state)
            checkpoint?(.storageFailure("lock-open-fd-\(directoryFD)-inode-\(state.st_ino)-links-\(state.st_nlink)-stat-\(observed)", failure))
#endif
            throw SharedFileError.storageUnavailable
        }
        defer { close(fd) }
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_nlink == 1,
              info.st_uid == geteuid(), info.st_size == 0, info.st_mode & 0o077 == 0 else { throw SharedFileError.corruptItem }
        let deadline = ProcessInfo.processInfo.systemUptime + lockSeconds
        while flock(fd, LOCK_EX | LOCK_NB) != 0 {
            guard errno == EWOULDBLOCK || errno == EINTR else { throw unavailable("lock-wait") }
            try cancellation()
            guard ProcessInfo.processInfo.systemUptime < deadline else { throw SharedFileError.storageBusy }
            usleep(10_000)
        }
        defer { _ = flock(fd, LOCK_UN) }
        var current = stat()
        guard fstatat(directoryFD, ".lock", &current, AT_SYMLINK_NOFOLLOW) == 0,
              current.st_dev == info.st_dev, current.st_ino == info.st_ino else { throw unavailable("lock-identity") }
        try cancellation()
        return try action()
    }

    private func inventory() throws -> [(name: String, size: Int)] {
        // A fresh open description is necessary: dup(directoryFD) would share
        // a directory cursor and incorrectly make later inventories empty.
        let fd = openat(directoryFD, ".", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw unavailable("inventory-open") }
        guard let stream = fdopendir(fd) else { close(fd); throw unavailable("inventory-stream") }
        defer { closedir(stream) }
        var values: [(name: String, size: Int)] = []
        while true {
            errno = 0
            guard let entry = readdir(stream) else {
                guard errno == 0 else { throw unavailable("inventory-next") }; break
            }
            let name = withUnsafePointer(to: &entry.pointee.d_name) {
                $0.withMemoryRebound(to: CChar.self, capacity: Int(MAXNAMLEN) + 1) { String(cString: $0) }
            }
            if [".", "..", ".lock"].contains(name) { continue }
            guard Self.finalID(name) != nil || Self.pendingID(name) != nil else { throw SharedFileError.corruptItem }
            var info = stat()
            guard fstatat(directoryFD, name, &info, AT_SYMLINK_NOFOLLOW) == 0,
                  info.st_mode & S_IFMT == S_IFREG, info.st_nlink == 1, info.st_uid == geteuid(),
                  info.st_size >= 0, info.st_size <= Self.maximumEnvelope, info.st_mode & 0o077 == 0 else { throw SharedFileError.corruptItem }
            values.append((name, Int(info.st_size)))
            guard values.count <= SharedFileLimits.items,
                  values.reduce(0, { $0 + $1.size }) <= SharedFileLimits.storedBytes else { throw SharedFileError.capacity }
        }
        return values
    }

    private func readUnlocked(_ id: UUID) throws -> SharedStoredFile {
        let fd = openat(directoryFD, Self.finalName(id), O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard fd >= 0 else { throw errno == ENOENT ? SharedFileError.notFound : .corruptItem }
        defer { close(fd) }
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_nlink == 1, info.st_uid == geteuid(), info.st_mode & 0o277 == 0 else {
            throw SharedFileError.corruptItem
        }
        do {
            let data = try SharedFileIO.read(fd, maximum: Self.maximumEnvelope)
            let offset = Self.magic.count + 4
            guard data.count >= offset, data.prefix(Self.magic.count) == Self.magic else { throw SharedFileError.corruptItem }
            let length = data[Self.magic.count..<offset].reduce(0) { ($0 << 8) | Int($1) }
            guard length > 0, length <= Self.headerLimit, offset + length < data.count else { throw SharedFileError.corruptItem }
            let encoded = Data(data[offset..<offset + length])
            let header = try JSONDecoder().decode(StoredHeader.self, from: encoded)
            guard header.version == 2, header.id == id.uuidString.lowercased(),
                  let incarnation = UUID(uuidString: header.incarnation), incarnation.uuidString.lowercased() == header.incarnation,
                  header.storedAtMilliseconds >= 0, header.storedAtMilliseconds <= 253_402_300_799_999,
                  header.bytes == data.count - offset - length,
                  try Self.encode(header) == encoded else { throw SharedFileError.corruptItem }
            let candidate = try SharedFileCandidate(selectedBytes: Data(data[(offset + length)...]), name: header.name, offeredType: header.offeredType)
            guard candidate.metadata.sha256 == header.sha256 else { throw SharedFileError.corruptItem }
            return SharedStoredFile(receipt: SharedFileReceipt(id: id, incarnation: incarnation,
                                                               storedAtMilliseconds: header.storedAtMilliseconds,
                                                               metadata: candidate.metadata), candidate: candidate)
        } catch SharedFileError.cancelled { throw SharedFileError.cancelled }
        catch { throw SharedFileError.corruptItem }
    }

    private func write(_ data: Data, to fd: Int32) throws {
        try data.withUnsafeBytes { buffer in
            guard let base = buffer.baseAddress else { return }
            var offset = 0
            while offset < buffer.count {
                try cancellation()
                let count = Darwin.write(fd, base.advanced(by: offset), min(65_536, buffer.count - offset))
                if count < 0 && errno == EINTR { continue }
                guard count > 0 else { throw unavailable("pending-write") }
                offset += count
            }
        }
    }

    private static func encode(_ header: StoredHeader) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(header)
    }

    private static func prefix(_ header: StoredHeader) throws -> Data {
        let encoded = try encode(header)
        guard encoded.count <= headerLimit else { throw SharedFileError.invalidInput }
        let count = UInt32(encoded.count)
        var result = magic
        result.append(contentsOf: [UInt8(count >> 24), UInt8((count >> 16) & 255), UInt8((count >> 8) & 255), UInt8(count & 255)])
        result.append(encoded); return result
    }

    private static func finalName(_ id: UUID) -> String { id.uuidString.lowercased() + ".share" }
    private static func pendingName(_ id: UUID) -> String { ".pending-" + id.uuidString.lowercased() }
    private static func finalID(_ name: String) -> UUID? {
        guard name.hasSuffix(".share"), let id = UUID(uuidString: String(name.dropLast(6))), finalName(id) == name else { return nil }
        return id
    }
    private static func pendingID(_ name: String) -> UUID? {
        guard name.hasPrefix(".pending-"), let id = UUID(uuidString: String(name.dropFirst(9))), pendingName(id) == name else { return nil }
        return id
    }
}
