import Foundation
import CoreGraphics
import ImageIO
import CryptoKit
import PDFKit
import Vision

/// Recognition produces observations, never source rights, editorial approval,
/// filesystem authority or learner-model actions. The host owns the explicit
/// file choice and fences each reply to its original document and learner.
public struct NativeFileSummary: Codable, Sendable {
    public let name: String
    public let sha256: String
    public let bytes: Int
    public let mimeType: String
    public let kind: String
    public let pageCount: Int
}
public struct NativeTextBounds: Codable, Sendable {
    public let left: Double
    public let top: Double
    public let width: Double
    public let height: Double
}
public struct NativeTextRegion: Codable, Sendable {
    public let start: Int
    public let end: Int
    public let text: String
    public let confidence: Float?
    public let bounds: NativeTextBounds
}
public struct NativeTextPage: Codable, Sendable {
    public let page: Int
    public let width: Double
    public let height: Double
    public let rotation: Int
    public let coordinateSpace: String
    public let unit: String
    public let provider: String
    public let revision: Int?
    public let text: String
    public let regions: [NativeTextRegion]
}
public struct NativeTextDocument: Codable, Sendable {
    public let version: Int
    public let file: NativeFileSummary
    public let pages: [NativeTextPage]
}
public struct NativeTextExtractionError: Error, Sendable {
    public let code: String
    public init(_ code: String) { self.code = code }
}

public enum NativeTextExtractor {
    public static let maxFileBytes = 20 * 1024 * 1024
    public static let maxTextUnits = 120_000
    public static let maxPagesPerRequest = 20
    private static let maxImagePixels = 40_000_000
    private static let maxRegions = 4000

    private static func checkFile(_ data: Data, name: String) throws {
        guard !data.isEmpty, data.count <= maxFileBytes else { throw NativeTextExtractionError("file-size") }
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.utf16.count <= 255,
              !name.contains("/"), !name.contains("\\"), name != ".", name != "..",
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw NativeTextExtractionError("file-name")
        }
    }
    private static func summary(_ data: Data, name: String, mimeType: String, kind: String, pages: Int) -> NativeFileSummary {
        NativeFileSummary(name: name, sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(),
                          bytes: data.count, mimeType: mimeType, kind: kind, pageCount: pages)
    }
    private static func pdf(_ data: Data) throws -> PDFDocument {
        guard let document = PDFDocument(data: data) else { throw NativeTextExtractionError("unreadable-pdf") }
        guard !document.isLocked else { throw NativeTextExtractionError("locked-pdf") }
        guard document.allowsCopying else { throw NativeTextExtractionError("copy-restricted-pdf") }
        guard (1...10_000).contains(document.pageCount) else { throw NativeTextExtractionError("page-count") }
        return document
    }
    private static func image(_ data: Data) throws -> (CGImageSource, String, Int, Int) {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source) as String?,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let w = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let h = properties[kCGImagePropertyPixelHeight] as? NSNumber else { throw NativeTextExtractionError("unsupported-image") }
        let mimeTypes = ["public.png": "image/png", "public.jpeg": "image/jpeg", "public.heic": "image/heic", "public.heif": "image/heif", "public.tiff": "image/tiff"]
        guard let mime = mimeTypes[type] else { throw NativeTextExtractionError("unsupported-image") }
        let width = w.intValue, height = h.intValue
        guard width > 0, height > 0, width <= 40_000, height <= 40_000,
              width <= maxImagePixels / height else { throw NativeTextExtractionError("image-size") }
        let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
        guard (1...8).contains(orientation) else { throw NativeTextExtractionError("image-orientation") }
        return (source, mime, orientation >= 5 ? height : width, orientation >= 5 ? width : height)
    }
    public static func inspect(data: Data, name: String) throws -> NativeFileSummary {
        try checkFile(data, name: name)
        if data.starts(with: Data("%PDF-".utf8)) {
            let document = try pdf(data)
            return summary(data, name: name, mimeType: "application/pdf", kind: "pdf", pages: document.pageCount)
        }
        let (_, mime, _, _) = try image(data)
        return summary(data, name: name, mimeType: mime, kind: "image", pages: 1)
    }
    private static func bounds(_ rectangle: CGRect, in frame: CGRect) throws -> NativeTextBounds {
        guard frame.width > 0, frame.height > 0, frame.width.isFinite, frame.height.isFinite,
              rectangle.minX.isFinite, rectangle.minY.isFinite, rectangle.width.isFinite, rectangle.height.isFinite else {
            throw NativeTextExtractionError("region-bounds")
        }
        let clipped = rectangle.intersection(frame)
        guard !clipped.isNull, clipped.width > 0, clipped.height > 0 else { throw NativeTextExtractionError("region-bounds") }
        return NativeTextBounds(left: max(0, (clipped.minX - frame.minX) / frame.width),
                                top: max(0, (frame.maxY - clipped.maxY) / frame.height),
                                width: min(1, clipped.width / frame.width), height: min(1, clipped.height / frame.height))
    }
    private static func recognize(_ image: CGImage, page: Int, width: Double, height: Double,
                                  rotation: Int = 0, provider: String = "apple-vision") throws -> NativeTextPage {
        let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate
        guard try request.supportedRecognitionLanguages().contains("ja-JP") else { throw NativeTextExtractionError("japanese-ocr-unavailable") }
        request.recognitionLanguages = ["ja-JP", "en-US"]; request.usesLanguageCorrection = false
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        let observations = request.results ?? []
        guard observations.count <= maxRegions else { throw NativeTextExtractionError("text-capacity") }
        var text = ""; var regions: [NativeTextRegion] = []
        for observation in observations {
            guard let candidate = observation.topCandidates(1).first, !candidate.string.isEmpty else { continue }
            guard candidate.confidence.isFinite, (0...1).contains(candidate.confidence) else { throw NativeTextExtractionError("recognition-result") }
            if !text.isEmpty { text += "\n" }
            let start = text.utf16.count; text += candidate.string
            guard text.utf16.count <= maxTextUnits else { throw NativeTextExtractionError("text-capacity") }
            regions.append(NativeTextRegion(start: start, end: text.utf16.count, text: candidate.string, confidence: candidate.confidence,
                                            bounds: try bounds(observation.boundingBox, in: CGRect(x: 0, y: 0, width: 1, height: 1))))
        }
        return NativeTextPage(page: page, width: width, height: height, rotation: rotation,
                              coordinateSpace: "normalized-top-left-oriented-page", unit: "utf16-code-unit",
                              provider: provider, revision: request.revision, text: text, regions: regions)
    }
    private static func extractPDFPage(_ page: PDFPage, number: Int) throws -> NativeTextPage {
        let frame = page.bounds(for: .mediaBox), rotation = (page.rotation % 360 + 360) % 360
        guard frame.width.isFinite, frame.height.isFinite, frame.width > 0, frame.height > 0,
              frame.width <= 40_000, frame.height <= 40_000, [0, 90, 180, 270].contains(rotation) else { throw NativeTextExtractionError("page-size") }
        let raw = page.string ?? ""
        guard raw.utf16.count <= maxTextUnits else { throw NativeTextExtractionError("text-capacity") }
        if !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let lines = page.selection(for: frame)?.selectionsByLine() ?? []
            guard lines.count <= maxRegions else { throw NativeTextExtractionError("text-capacity") }
            let nsText = raw as NSString; var cursor = 0; var regions: [NativeTextRegion] = []
            for line in lines {
                guard let text = line.string, !text.isEmpty else { continue }
                let range = nsText.range(of: text, options: [], range: NSRange(location: cursor, length: nsText.length - cursor))
                // Fine anchors require an exact text match. Otherwise only the
                // original page anchor is retained.
                if range.location == NSNotFound { continue }
                guard let box = try? bounds(line.bounds(for: page), in: frame) else { continue }
                regions.append(NativeTextRegion(start: range.location, end: NSMaxRange(range), text: text, confidence: nil, bounds: box))
                cursor = NSMaxRange(range)
            }
            return NativeTextPage(page: number, width: frame.width, height: frame.height, rotation: rotation,
                                  coordinateSpace: "normalized-top-left-unrotated-media-box", unit: "utf16-code-unit",
                                  provider: "apple-pdfkit-text", revision: nil, text: raw, regions: regions)
        }
        guard let reference = page.pageRef else { throw NativeTextExtractionError("unreadable-pdf-page") }
        let rotated = rotation == 90 || rotation == 270
        let width = rotated ? frame.height : frame.width, height = rotated ? frame.width : frame.height
        let scale = min(2, 4096 / max(width, height)), w = max(1, Int(ceil(width * scale))), h = max(1, Int(ceil(height * scale)))
        guard w <= 16_777_216 / h,
              let context = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw NativeTextExtractionError("page-raster-size")
        }
        let raster = CGRect(x: 0, y: 0, width: CGFloat(w), height: CGFloat(h))
        context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(raster)
        context.concatenate(reference.getDrawingTransform(.mediaBox, rect: raster, rotate: 0, preserveAspectRatio: true)); context.drawPDFPage(reference)
        guard let bitmap = context.makeImage() else { throw NativeTextExtractionError("page-raster-unavailable") }
        return try recognize(bitmap, page: number, width: width, height: height, rotation: rotation, provider: "apple-vision-pdf")
    }
    public static func extract(data: Data, name: String, firstPage: Int, lastPage: Int) throws -> NativeTextDocument {
        let file = try inspect(data: data, name: name)
        guard firstPage >= 1, lastPage >= firstPage, lastPage <= file.pageCount,
              lastPage - firstPage < maxPagesPerRequest else { throw NativeTextExtractionError("page-range") }
        var pages: [NativeTextPage] = []
        if file.kind == "pdf" {
            let document = try pdf(data)
            for number in firstPage...lastPage {
                guard let page = document.page(at: number - 1) else { throw NativeTextExtractionError("unreadable-pdf-page") }
                pages.append(try extractPDFPage(page, number: number))
                guard pages.reduce(0, { $0 + $1.text.utf16.count }) <= maxTextUnits else { throw NativeTextExtractionError("text-capacity") }
            }
        } else {
            let (source, _, width, height) = try image(data)
            let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                           kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 4096]
            guard let bitmap = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw NativeTextExtractionError("unreadable-image") }
            pages = [try recognize(bitmap, page: 1, width: Double(width), height: Double(height))]
        }
        return NativeTextDocument(version: 1, file: file, pages: pages)
    }
}
