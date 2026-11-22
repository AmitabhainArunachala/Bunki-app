// Adapter factories register the exact object whose reads transfer ownership.
// A spread, proxy or wrapper receives no capability, even if it copies methods.
const ownedReaders = new WeakSet();
export function registerOwnedReader(adapter) { ownedReaders.add(adapter); return adapter; }
export function ownsReadSnapshot(adapter) { return ownedReaders.has(adapter); }
// Storage that returns a structured clone of exactly the candidate last
// committed, key order included (IndexedDB). An adapter that transforms a
// committed candidate or wraps IndexedDB must read it again.
const candidateReaders = new WeakSet();
export function registerCandidateReader(adapter) { candidateReaders.add(adapter); return adapter; }
export function readsCommittedCandidate(adapter) { return ownedReaders.has(adapter) && candidateReaders.has(adapter); }
