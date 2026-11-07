/** The browser build behind a context. A persistent context may lack a Browser handle;
 * in that case its version is read once from a short headless launch of that same browser executable. */
const launched = new Map();
export function contextBrowserVersion(context, type, { executablePath } = {}) {
  const own = context.browser()?.version();
  if (own) return Promise.resolve(own);
  const key = `${type.name()}\u0000${executablePath || ''}`;
  if (!launched.has(key))
    launched.set(key, type.launch({ headless: true, ...(executablePath ? { executablePath } : {}) }).then(async (browser) => {
      try { return browser.version(); } finally { await browser.close(); }
    }));
  return launched.get(key);
}
