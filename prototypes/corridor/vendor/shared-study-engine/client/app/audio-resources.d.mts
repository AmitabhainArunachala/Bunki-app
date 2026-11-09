/** Host transport authority only. Runtime enforces digest syntax, lengths and transitive admission. */
export interface AudioRef { readonly key: string; readonly sha256: string; readonly bytes: number }
export interface AudioReleaseSelection {
 readonly releaseId: `sha256:${string}`; readonly projectionId: string; readonly contentRelease: string; readonly root: AudioRef;
}
export type PackState = 'verified-local'|'missing'|'incomplete'|'nonpersistent';
export interface AudioResources {
 read(ref: AudioRef, options?: {signal?: AbortSignal}): Promise<Uint8Array>;
 packState(packId: string, options?: {signal?: AbortSignal}): PackState|Promise<PackState>;
}
export interface AudioCapability { readonly protocol: 'nsrs-audio-resources/v1'; readonly release: AudioReleaseSelection; readonly resources: AudioResources }
export function validateAudioCapability(value: unknown): Readonly<AudioCapability>;
export function createHttpAudioResources(options: {origin: string;release: AudioReleaseSelection;fetch?: typeof globalThis.fetch}): Readonly<AudioResources>;
export function createLocalAudioResources(options: {base: string;release: AudioReleaseSelection;fetch?: typeof globalThis.fetch;packState?: AudioResources['packState']}): Readonly<AudioResources>;
/** Internal reader/transport bridge, not a host-side authorization API. */
export function admitAudioResourceRefs(resources: AudioResources, refs: readonly AudioRef[]): boolean;
