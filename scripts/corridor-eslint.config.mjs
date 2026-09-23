/** The shipped Corridor has a browser environment even though historical
 * prototypes are excluded from the monorepo's default discovery. The release
 * gate supplies the authored runtime files explicitly with --no-ignore. */
import base from '../eslint.config.mjs';

const readonly = (names) =>
  Object.fromEntries(names.split(/\s+/u).map((name) => [name, 'readonly']));
const browser = readonly(`window document navigator location history localStorage sessionStorage
  console performance crypto fetch URL URLSearchParams Request Response Headers Blob File FileReader
  FormData TextEncoder TextDecoder AbortController AbortSignal DOMException Event CustomEvent
  HTMLElement HTMLInputElement HTMLTextAreaElement HTMLButtonElement HTMLSelectElement HTMLAudioElement
  Element Node NodeFilter DOMParser XMLSerializer MutationObserver IntersectionObserver ResizeObserver
  Audio SpeechSynthesisUtterance speechSynthesis CSS Worker indexedDB IDBKeyRange caches self clients
  setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame
  queueMicrotask structuredClone addEventListener removeEventListener dispatchEvent atob btoa
  getComputedStyle matchMedia innerWidth innerHeight scrollY devicePixelRatio Image OffscreenCanvas
  GPUBufferUsage GPUTextureUsage Path2D Storage IDBDatabase IDBObjectStore IDBIndex scrollX`);

export default [
  ...base,
  {
    files: ['prototypes/corridor/**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...browser,
        process: 'off',
        Buffer: 'off',
        module: 'off',
        require: 'off',
        __dirname: 'off',
      },
    },
    rules: {
      // Japanese prose intentionally uses full-width spacing inside templates.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
    },
  },
  {
    files: ['prototypes/corridor/tools/*.mjs'],
    languageOptions: {
      globals: { ...browser, ...readonly('process Buffer setImmediate clearImmediate') },
    },
  },
];
