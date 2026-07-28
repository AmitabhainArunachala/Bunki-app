/**
 * Registering the self-hosted faces — the native half (a deliberate no-op).
 *
 * Metro resolves this file on iOS and Android and `./font-face.ts` — the web
 * build — everywhere else, the same split `src/state/persistence/` uses and for
 * the same reason: the choice is module resolution, not a `Platform.OS` branch,
 * so the web bundle carries no dead native path and the Node test runner loads
 * the file the browser loads. Nothing happens here, and the reason is not
 * laziness:
 *
 *   - A React Native `fontFamily` on iOS/Android is a *registered* font name,
 *     resolved by the platform's font manager, and there is no supported way to
 *     hand it a base64 blob at runtime. Registration is a build-time step
 *     (`expo-font`'s config plugin, or an `Info.plist` entry), which needs
 *     `app.json` and `package.json` — files this lane does not own.
 *   - It would also buy very little. The two platforms that would use this file
 *     ship a mincho and a gothic already: Hiragino Mincho ProN and Hiragino Sans
 *     on iOS, Noto Serif/Sans CJK on Android. `FONT_STACKS` names both, so the
 *     native reading surface lands on a real mincho without any bytes from us.
 *
 * The web is the case that genuinely needed solving — a Linux or Windows browser
 * frequently has no CJK serif at all, and the Phase-0 demonstration target is
 * Expo Web (REQ-ARCH-01). So the bytes ship, and they ship where they are used.
 */

/** No-op on native. See the header for why, and see `font-face.web.ts` for the web. */
export function installSelfHostedFaces(): void {
  // Intentionally empty.
}

/** Native never installs, so nothing is ever pending. */
export function selfHostedFacesInstalled(): boolean {
  return false;
}
