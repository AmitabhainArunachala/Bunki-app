/**
 * `.svg` imports resolve to the file's text (WP-05).
 *
 * Declared to match the Metro transformer in `svg-text-transformer.js`; see
 * `stroke-sources.ts` for why the strokes are read as text rather than as an
 * image asset.
 */
declare module '*.svg' {
  const svgText: string;
  export default svgText;
}
