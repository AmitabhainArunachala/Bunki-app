# URI decoder compatibility adapter

Expo Router 57 uses the CommonJS API of `query-string` 7. That parser expects
`require('decode-uri-component')` to return a function. The patched upstream
decoder, version 0.5.0, instead exports an ESM default. This private package adapts
that export and preserves the older decoder's plus-to-space behavior, including
URL fragments. `%2B` remains a literal plus sign.

The root override replaces only query-string 7.1.3's decoder. A root file
dependency and `$decode-uri-component` reference anchor the adapter at the
workspace root; a relative file path inside the nested override resolves against
query-string instead and can leave a broken link. An npm alias keeps the fixed
upstream implementation distinct from the overridden package name.
No decoding algorithm is copied or modified here. Keep the dependency pinned
and review this adapter when Expo Router adopts a compatible patched parser.

The Node tooling path uses synchronous `require(esm)`, enabled by default since
Node 22.12; Metro transforms the same dependency for web and native bundles.
Production bundle and deep-link checks are required alongside the Node tests.
The Expo/Metro toolchain already requires Node 22.13 or newer in the 22.x line.

Run the installed-parent compatibility checks from the repository root:

```sh
npx vitest run packages/uri-decoder-compat/test
```

These checks cover the callable export, malformed input in a bounded subprocess,
Japanese and repeated query values, URL fragments, Expo Router's real path
consumers, Xcode's actual UUID call and Metro's asset API. They do not certify
native runtime startup or every possible input size.

Check an existing production Expo web export in an isolated Chromium profile:

```sh
node --experimental-strip-types packages/uri-decoder-compat/test/verify-expo-web.mjs /absolute/export /absolute/external-evidence
```

The browser verifier serves the exported bytes unchanged, drives cold deep links
and ordinary navigation, and executes the bundled query parser to check its
actual browser module format. It uses the repository's existing static host;
Node 22.14 needs the type-stripping flag to load that TypeScript test helper.
`CHROMIUM_PATH` is optional; otherwise Playwright's pinned Chromium is used.
Any unexpected page exception or failed local response fails the run. External
requests are blocked and recorded. An iOS Hermes export verifies bundle
resolution only; native runtime acceptance requires a separate device journey.
