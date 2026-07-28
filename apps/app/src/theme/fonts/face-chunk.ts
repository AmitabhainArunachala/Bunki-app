/**
 * One `@font-face` worth of a subset face.
 *
 * The generated face modules in this directory are split the way Google Fonts
 * splits a Japanese family: several `@font-face` rules for one family and
 * weight, each declaring the `unicode-range` it really covers. A browser then
 * decodes only the chunks a page actually needs, which is what keeps a
 * three-thousand-glyph face from being a three-thousand-glyph cost on a screen
 * showing eight words.
 */
export interface FontChunk {
  /**
   * The range this chunk covers, in `@font-face` syntax.
   *
   * It comes from the subsetter rather than from the request, so it describes
   * what the file *contains*. That difference matters: if it described what was
   * asked for, a character the face lacks would be claimed by this rule and
   * render as a blank box instead of falling through to the platform stack.
   */
  readonly unicodeRange: string;
  /** `data:font/woff2;base64,…` — self-hosted in the literal sense: no fetch at all. */
  readonly source: string;
  /** SHA-256 of the woff2 bytes, so a regeneration is a reviewable diff. */
  readonly sha256: string;
}
