import Darwin
import Foundation

/// Four-byte unsigned big-endian length, followed by exactly one UTF-8 JSON body.
/// Limits are checked before buffering an advertised body. No frame is truncated.
public struct JournalRPCFrameDecoder: Sendable {
    private let limits: JournalRPCLimits
    private var buffer = Data()
    private var expected: Int?
    public init(limits: JournalRPCLimits = try! JournalRPCLimits()) { self.limits = limits }
    public mutating func append(_ bytes: Data) throws -> [Data] {
        guard bytes.count <= limits.maxChunkBytes,
              buffer.count + bytes.count <= limits.maxFrameBytes + limits.maxChunkBytes + 4 else { throw JournalRPCError.limitsExceeded }
        buffer.append(bytes)
        var frames: [Data] = []
        while true {
            if expected == nil {
                guard buffer.count >= 4 else { break }
                let prefix = Array(buffer.prefix(4))
                let size = prefix.reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
                guard size > 0, size <= limits.maxFrameBytes else { throw JournalRPCError.limitsExceeded }
                expected = Int(size); buffer.removeFirst(4)
            }
            guard let size = expected, buffer.count >= size else { break }
            guard frames.count < limits.maxQueuedFrames else { throw JournalRPCError.limitsExceeded }
            frames.append(Data(buffer.prefix(size))); buffer.removeFirst(size); expected = nil
        }
        return frames
    }
    public mutating func endOfInput() throws {
        guard expected == nil, buffer.isEmpty else { throw JournalRPCError.invalidFrame }
    }
    public static func frame(_ body: Data, limits: JournalRPCLimits = try! JournalRPCLimits()) throws -> Data {
        guard !body.isEmpty, body.count <= limits.maxFrameBytes else { throw JournalRPCError.limitsExceeded }
        let size = UInt32(body.count)
        var result = Data([UInt8((size >> 24) & 255), UInt8((size >> 16) & 255), UInt8((size >> 8) & 255), UInt8(size & 255)])
        result.append(body); return result
    }
}

/// Foreground pipe pump, independent of executable policy/provisioning. The
/// embedding host owns these handles for the duration. The process never logs.
/// Nonblocking syscalls and bounded active-I/O waits keep revocation independent
/// of a full pipe; these waits do not schedule sync or create background work.
public enum JournalRPCStdioServer {
    public static func run(input: FileHandle, output: FileHandle, adapter: JournalRPCAdapter,
                           connectionID: UUID) async throws {
        let limits = adapter.framingLimits
        let readFD = input.fileDescriptor; let writeFD = output.fileDescriptor
        let readFlags = fcntl(readFD, F_GETFL); let writeFlags = fcntl(writeFD, F_GETFL)
        guard readFlags >= 0, writeFlags >= 0 else { adapter.connectionLost(connectionID); throw JournalRPCError.ioFailure }
        guard fcntl(readFD, F_SETFL, readFlags | O_NONBLOCK) == 0 else { adapter.connectionLost(connectionID); throw JournalRPCError.ioFailure }
        defer { _ = fcntl(readFD, F_SETFL, readFlags) }
        guard fcntl(writeFD, F_SETFL, writeFlags | O_NONBLOCK) == 0 else { adapter.connectionLost(connectionID); throw JournalRPCError.ioFailure }
        defer { _ = fcntl(writeFD, F_SETFL, writeFlags) }
        // Per-descriptor, not a process-wide SIGPIPE policy change.
        let priorNoSigPipe = fcntl(writeFD, F_GETNOSIGPIPE)
        guard priorNoSigPipe >= 0, fcntl(writeFD, F_SETNOSIGPIPE, 1) == 0 else { adapter.connectionLost(connectionID); throw JournalRPCError.ioFailure }
        defer { _ = fcntl(writeFD, F_SETNOSIGPIPE, priorNoSigPipe); adapter.connectionLost(connectionID) }
        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask { try await readLoop(readFD, adapter: adapter, connectionID: connectionID, limits: limits) }
                group.addTask { try await writeLoop(writeFD, adapter: adapter, limits: limits) }
                defer { group.cancelAll(); adapter.connectionLost(connectionID) }
                _ = try await group.next()
            }
        } catch {
            if error is CancellationError { throw JournalRPCError.cancelled }
            throw (error as? JournalRPCError) ?? .ioFailure
        }
    }
    private static func pause() async throws { try await Task.sleep(for: .milliseconds(5)) }
    private static func readLoop(_ fd: Int32, adapter: JournalRPCAdapter, connectionID: UUID,
                                 limits: JournalRPCLimits) async throws {
        var decoder = JournalRPCFrameDecoder(limits: limits)
        var bytes = [UInt8](repeating: 0, count: limits.maxChunkBytes)
        while true {
            try Task.checkCancellation()
            guard adapter.mayContinueStdio else { throw JournalRPCError.staleSession }
            let count = Darwin.read(fd, &bytes, bytes.count)
            if count == 0 { try decoder.endOfInput(); return }
            if count < 0 {
                if errno == EINTR { continue }
                if errno == EAGAIN || errno == EWOULDBLOCK { try await pause(); continue }
                throw JournalRPCError.ioFailure
            }
            for frame in try decoder.append(Data(bytes.prefix(count))) {
                try await adapter.submit(frame, from: connectionID)
            }
        }
    }
    private static func writeLoop(_ fd: Int32, adapter: JournalRPCAdapter, limits: JournalRPCLimits) async throws {
        while let packet = await adapter.nextPacket() {
            try Task.checkCancellation()
            guard adapter.mayContinueStdio else { throw JournalRPCError.staleSession }
            let frame = try JournalRPCFrameDecoder.frame(packet.bytes, limits: limits)
            var offset = 0
            while offset < frame.count {
                try Task.checkCancellation()
                // If part of a success is already in the pipe, reject/close the
                // stream instead of completing that response after revocation.
                guard adapter.mayWrite(packet) else { throw JournalRPCError.staleSession }
                let count = frame.withUnsafeBytes { raw in
                    Darwin.write(fd, raw.baseAddress!.advanced(by: offset), min(limits.maxChunkBytes, frame.count - offset))
                }
                if count < 0 {
                    if errno == EINTR { continue }
                    if errno == EAGAIN || errno == EWOULDBLOCK { try await pause(); continue }
                    throw JournalRPCError.ioFailure
                }
                guard count > 0 else { throw JournalRPCError.ioFailure }
                offset += count
            }
        }
    }
}
