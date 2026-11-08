/** Narrow accepted-audio boundary; no engine implementation typecheck implied. */
export interface AudioReplicaScope {readonly environment:string; readonly learner:string; readonly installation:string}
export interface AudioDemandNamespace extends AudioReplicaScope {readonly epoch:number}
export interface AudioSourceScope {readonly accessScope:string; readonly licenseScope:string}
export interface AudioAssignments {
 readonly profiles?:Readonly<Record<string,unknown>>;
 readonly languageAssignments?:Readonly<Record<string,Readonly<Record<string,unknown>>>>;
 readonly readingAssignments?:Readonly<Record<string,Readonly<Record<string,unknown>>>>;
}
export interface AcceptedAudioBatch {
 readonly catalog:readonly Readonly<Record<string,unknown>>[];
 readonly grammarRecords:readonly Readonly<Record<string,unknown>>[];
 readonly sourceRevision:string;
 readonly scope:AudioSourceScope;
 readonly assignments:AudioAssignments;
}
export type AudioSourceProof =
 | Readonly<{kind:'catalog';taskKey:string;sourceRevision:string}>
 | Readonly<{kind:'manual-card';eventId:string;bodyHash:string}>
 | Readonly<{kind:'unsupported';sourceId:string;contractId:string;sourceRevision:string}>;
export interface AcceptedAudioDemand {
 readonly demandId:string; readonly ownerKey:string; readonly audioContentRevision:string;
 readonly sourceProof:AudioSourceProof; readonly batch:AcceptedAudioBatch|null;
 readonly state:'pending'; readonly pendingReasons:readonly string[];
}
export interface AudioDemandRecord {
 readonly revision:number; readonly demands:readonly AcceptedAudioDemand[]; readonly staleDemandIds:readonly string[];
}
export interface AudioDemandSink {
 read(namespace:AudioDemandNamespace):Promise<AudioDemandRecord|null>;
 compareAndSwap(namespace:AudioDemandNamespace,expectedRevision:number|null,candidate:AudioDemandRecord):Promise<boolean>;
 close?():void|Promise<void>;
}
export interface AcceptedAudioCoverage {readonly canonical:number; readonly manual:number; readonly unsupported:number}
export interface AcceptedAudioStatus {
 readonly state:'pending'|'error'|'persistence-unavailable'; readonly error:string|null;
 readonly coverage:AcceptedAudioCoverage|null;
}
export interface AcceptedAudioHandle {
 status():AcceptedAudioStatus; flush():Promise<AcceptedAudioStatus>; dispose():void;
}
export interface AcceptedAudioStore {
 readonly scope:AudioReplicaScope;
 readState(options?:{requireCompatible?:boolean}):Promise<unknown>;
 subscribe(listener:()=>void):()=>void;
}
export interface UnsupportedAudioSource {
 readonly sourceId:string; readonly contractId:string; readonly sourceRevision:string; readonly status:string;
}
export interface AcceptedAudioOptions {
 readonly sourceRevision:string; readonly correctionLedgerRevision:string;
 readonly grammarRecords?:readonly Readonly<Record<string,unknown>>[];
 readonly readingRules?:readonly Readonly<Record<string,unknown>>[];
 readonly scope:AudioSourceScope; readonly assignments?:AudioAssignments;
 readonly unsupportedSources?:readonly UnsupportedAudioSource[];
}
export interface AcceptedAudioSnapshotInputs extends AcceptedAudioOptions {
 readonly state:unknown; readonly replicaScope:AudioReplicaScope;
 readonly catalog:readonly Readonly<Record<string,unknown>>[];
}
export function acceptedAudioDemandSnapshot(input:AcceptedAudioSnapshotInputs):Readonly<{
 demands:readonly AcceptedAudioDemand[];coverage:AcceptedAudioCoverage;
}>;
export function resolveAcceptedAudioDemand(demand:AcceptedAudioDemand,currentSnapshotInputs:AcceptedAudioSnapshotInputs):AcceptedAudioBatch;
export function createAcceptedAudioObserver(options:{
 store:AcceptedAudioStore;catalog:readonly Readonly<Record<string,unknown>>[];sink:AudioDemandSink|null;
 getOptions?:(state:unknown)=>AcceptedAudioOptions;retryMs?:number;debounceMs?:number;
}):Readonly<AcceptedAudioHandle>;
