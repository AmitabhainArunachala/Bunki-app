/**
 * A device tutor for the checks whose door needs one (Hfix-1B, item 11, the lead's ruling on H0-5 and H-kaku-04): since
 * 2026-10-19 every "Ask the tutor" door (the hold strip's, a sentence's, a word page's, the guided room's Sensei doors)
 * shows only while a tutor is set up on this device. A check that walks through such a door sets one up first: the
 * same atomic provider record Settings › Tutor connection saves (corridor.js saveAiDeviceConfig, AI_DEVICE_STORE), with
 * a synthetic key that no service accepts. A check using it never presses Send unless it routes that request itself.
 */
/* global localStorage */
export const DEVICE_TUTOR_STORE = 'kairo-ai-provider-v1';
export const DEVICE_TUTOR = Object.freeze({
  v: 1,
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-5',
  configId: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b',
  credential: Object.freeze({ origin: 'https://api.anthropic.com', key: 'synthetic-device-tutor-key' }),
});

/** For page.evaluate / addInitScript: writes the device tutor into this origin's storage. */
export function writeDeviceTutor([store, record]) {
  localStorage.setItem(store, JSON.stringify(record));
}
export const deviceTutorArgs = () => [DEVICE_TUTOR_STORE, DEVICE_TUTOR];

/** Sets a tutor up on this page's origin now (the next render shows the tutor's doors). */
export async function setUpDeviceTutor(page) {
  await page.evaluate(writeDeviceTutor, deviceTutorArgs());
}

/** Sets a tutor up for a context's pages, before any script of the app runs, wherever no provider is stored yet: a provider
 * a check configures later (its own synthetic one, through Settings › Tutor connection) is never written over on reload. */
export function writeDeviceTutorIfNone([store, record]) {
  if (localStorage.getItem(store) === null) localStorage.setItem(store, JSON.stringify(record));
}
export async function setUpDeviceTutorForContext(context) {
  await context.addInitScript(writeDeviceTutorIfNone, deviceTutorArgs());
}
/** The same on this page now, leaving a provider already stored as it is. */
export async function setUpDeviceTutorIfNone(page) {
  await page.evaluate(writeDeviceTutorIfNone, deviceTutorArgs());
}
