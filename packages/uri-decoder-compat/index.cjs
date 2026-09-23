// query-string 7 requires a callable CommonJS export. The patched upstream
// decoder is ESM; Node's synchronous ESM loader and Metro expose its default.
const upstream = require('decode-uri-component-modern');
const decode = typeof upstream === 'function' ? upstream : upstream.default;

if (typeof decode !== 'function') {
  throw new TypeError('URI decoder export is not callable');
}

// Preserve the legacy decoder's plus-as-space contract, including the fragment
// path in parseUrl. Encoded plus signs (%2B) must remain literal plus signs.
module.exports = (input) => decode(typeof input === 'string' ? input.replace(/\+/g, ' ') : input);
