// Adapter factories register the exact object whose reads transfer ownership.
// A spread, proxy or wrapper receives no capability, even if it copies methods.
const ownedReaders = new WeakSet();
export function registerOwnedReader(adapter) { ownedReaders.add(adapter); return adapter; }
export function ownsReadSnapshot(adapter) { return ownedReaders.has(adapter); }
