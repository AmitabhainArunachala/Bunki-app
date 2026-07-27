// Metro transformer: `.svg` resolves to its text (WP-05).
//
// The kanji page animates KanjiVG strokes one at a time, which means it needs
// the individual `<path>` elements — not a rendered image. The seed's SVGs are
// the authority for that data and they must stay in `packages/seed`, because
// KanjiVG is CC BY-SA 3.0 and controller §4/DL-33 confine share-alike data to
// that package. So the bundler reads them in place and hands the text to the
// parser in `src/data/kanjivg.ts`; nothing is copied into `apps/app`.
//
// This is the standard `react-native-svg-transformer` shape, written by hand
// because adding a dependency for eight lines would put a package outside
// WP-00's verified register into the build (controller §14).
//
// Paired with the `sourceExts`/`assetExts` swap in `metro.config.js`: SVG must
// leave the asset list, or Metro resolves it to an image before this runs.

const upstreamTransformer = require('@expo/metro-config/babel-transformer');

module.exports.transform = async function transform({ src, filename, options }) {
  if (filename.endsWith('.svg')) {
    return upstreamTransformer.transform({
      src: `export default ${JSON.stringify(src)};`,
      filename,
      options,
    });
  }
  return upstreamTransformer.transform({ src, filename, options });
};

// Metro keys its transform cache on this. Delegating keeps the upstream key and
// adds our own marker, so flipping this transformer on or off invalidates the
// cache instead of serving stale asset modules.
module.exports.getCacheKey = function getCacheKey(...args) {
  const upstreamKey =
    typeof upstreamTransformer.getCacheKey === 'function'
      ? upstreamTransformer.getCacheKey(...args)
      : '';
  return `${upstreamKey}-bunki-svg-text-v1`;
};
