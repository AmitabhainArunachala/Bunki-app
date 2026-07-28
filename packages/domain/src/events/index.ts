/** Public surface of the v1 event layer (WP-02). */

export * from './envelope.ts';
export * from './shared.ts';
export * from './catalog.ts';
export * from './parse.ts';
export * from './factories.ts';

// `./mint-registry.ts` is deliberately absent. It holds the *write* side of the
// mint registry, and a module that could call `recordKernelMint` could launder
// any object literal into "this kernel minted it" — the exact hole the persist
// seam exists to close (REQ-ARCH-04). The read side and the sealed-batch API are
// public; the registration is not. `test/events/provenance.test.ts` pins this.
export * from './provenance.ts';
