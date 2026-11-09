import type {AudioCapability,AudioRef,PackState} from './audio-resources.mjs';
export interface AudioProfile { readonly providerRoute: string; readonly model: string; readonly voice: string; readonly settings: Readonly<Record<string,unknown>> }
export interface AudioSourceField { readonly fieldId: string; readonly text: string; readonly language: 'ja'|'en'|null; readonly pronunciationDirectives: readonly Readonly<{start:number;end:number;reading:string}>[]; readonly pendingReasons:readonly string[] }
export interface AudioSelection {
 readonly taskKey: string; readonly contentRevision: string; readonly audioContentRevision: string;
 readonly contentRelease: string; readonly fields: readonly string[]; readonly profileId: string|null;
 readonly supportedReadingId: null; readonly face: 'front'|'answer'; readonly sourceFields: readonly AudioSourceField[];
}
export type AudioLanguagePartition = readonly Readonly<{start:number;end:number;language:'ja'|'en'}>[];
export type AudioProfileAssignments = Readonly<Partial<Record<'ja'|'en',string|null>>>;
export type AudioSourceFieldV2 = Omit<AudioSourceField,'language'> & Readonly<{language:'ja'|'en'|AudioLanguagePartition|null}>;
export type AudioSelectionV2 = Omit<AudioSelection,'profileId'|'sourceFields'> & Readonly<{
 version:2;profileAssignments:AudioProfileAssignments;sourceFields:readonly AudioSourceFieldV2[];
}>;
export interface AudioMixedSegment {
 readonly fieldId:string;readonly packId:string;readonly supportedReadingId:null;
 readonly index:number;readonly start:number;readonly end:number;readonly unit:'codepoint';
 readonly byteStart:number;readonly byteEnd:number;readonly language:'ja'|'en';
 readonly inputKey:string;readonly profileId:string;readonly ref:AudioRef;
}
export interface AudioRootSummary {
 readonly version?:2;
 readonly contentRelease: string; readonly projectionId: string;
 readonly identities: Readonly<{catalog:string;registry:string;grammar:string;dictionary:string}>;
 readonly correctionLedgerRevision: string; readonly defaultProfileId: string|null;
 readonly profiles: readonly Readonly<{id:string;profile:AudioProfile}>[];
}
declare const verifiedSelection: unique symbol;
/** Logical opaque type. Per-player instance branding is enforced by runtime WeakMaps. */
export interface ReadyAudioSelection {
 readonly [verifiedSelection]: true; readonly status:'ready'; readonly releaseId:string; readonly projectionId:string;
 readonly contentRelease:string; readonly taskKey:string; readonly contentRevision:string; readonly audioContentRevision:string;
 readonly profileId:string; readonly supportedReadingId:null; readonly identities:AudioRootSummary['identities']; readonly localState:PackState;
 readonly segments:readonly Readonly<{fieldId:string;packId:string|null;supportedReadingId:null;start:number;end:number;inputKey:string;profileId:string;ref:AudioRef}>[];
}
export type ReadyAudioSelectionV2 = Omit<ReadyAudioSelection,'profileId'|'segments'> & Readonly<{
 version:2;profileId:null;profileAssignments:AudioProfileAssignments;segments:readonly AudioMixedSegment[];
}>;
export interface AudioPlacementV2 {
 readonly version:2;readonly taskKey:string;readonly contentRevision:string;readonly audioContentRevision:string;
 readonly fieldId:string;readonly supportedReadingId:null;readonly profileAssignments:AudioProfileAssignments;
 readonly language:'ja'|'en'|AudioLanguagePartition|null;readonly state:'pending'|'running'|'verified'|'failed'|'stale';
 readonly packId:string|null;readonly sourceSha256:string;readonly sourceBytes:number;
 readonly segments:readonly Readonly<Omit<AudioMixedSegment,'ref'|'fieldId'|'supportedReadingId'> & {speechInput:unknown}>[];
}
export type AudioUnavailableStatus = 'pending'|'preparation-failed'|'profile-unassigned'|'profile-unavailable'|'source-stale'|'content-release-mismatch'|'integrity-invalid'|'unsupported-capability'|'cancelled'|'face-hidden'|'offline-missing';
export type AudioResolution = ReadyAudioSelection|ReadyAudioSelectionV2|Readonly<{status:AudioUnavailableStatus}>;
export interface AudioPackInspection {
 readonly root:AudioRootSummary; readonly pack:Readonly<{id:string;totalBytes:number}>;
 readonly refs:readonly AudioRef[];
 /** Verified demo-pack rows still require mounted source/directive revalidation with resolve. */
 readonly placements:readonly Readonly<{taskKey:string;contentRevision:string;audioContentRevision:string;fieldId:string;supportedReadingId:null;profileId:string;language:'ja'|'en';state:'verified';packId:string;sourceSha256:string;sourceBytes:number;segments:readonly unknown[]}>[] | readonly AudioPlacementV2[];
}
export interface AudioReleaseReader {
 load(options?:{signal?:AbortSignal}):Promise<AudioRootSummary>;
 resolve(selection:AudioSelection|AudioSelectionV2,options?:{signal?:AbortSignal}):Promise<AudioResolution>;
 inspectPack(packId:string,options?:{signal?:AbortSignal;beforeMedia?:(inspection:AudioPackInspection)=>unknown|Promise<unknown>}):Promise<AudioPackInspection>;
 readClip(ref:AudioRef,options?:{signal?:AbortSignal}):Promise<Uint8Array>;
 dispose():Promise<void>;
}
export function createAudioReleaseReader(options:{capability:AudioCapability}):Readonly<AudioReleaseReader>;
export function audioBucket(taskKey:string):number;
export function hashAudioBytes(bytes:Uint8Array):Promise<string>;
export function isAudioReadyResult(value:unknown):value is ReadyAudioSelection;
