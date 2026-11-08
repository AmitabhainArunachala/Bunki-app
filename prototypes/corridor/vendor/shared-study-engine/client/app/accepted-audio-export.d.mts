import type {AcceptedAudioStore,AcceptedAudioOptions,AudioDemandSink,AudioDemandRecord,
 AudioDemandNamespace,AudioReplicaScope,AudioSourceScope,AudioAssignments} from '../audio/accepted-demand.mjs';

export interface AcceptedAudioExportOptions {
 /** Unique current demand IDs in caller order; cannot be combined with a cursor. */
 readonly demandIds?:readonly string[];
 /** 1–64; defaults to 16, or 64 for explicit IDs. */
 readonly limit?:number;
 readonly afterDemandId?:string|null;
 /** Required with a non-null cursor. An observation, not a freshness proof. */
 readonly expectedDemandRecordRevision?:number;
}
export interface AcceptedAudioExportSelection {
 readonly afterDemandId:string|null; readonly nextAfterDemandId:string|null;
 readonly totalCurrentDemands:number; readonly eligibleCurrentDemands:number;
 readonly unsupportedCurrentDemands:number; readonly selectedCount:number; readonly remainingCount:number;
}
export interface AcceptedAudioExportTask {
 readonly taskKey:string; readonly noteGuid:string; readonly contract:string;
 readonly passageId:string; readonly contentRevision:string;
}
export interface AcceptedAudioExportLocalOwner {
 readonly event:Readonly<Record<string,unknown>>; readonly bodyHash:string;
}
export interface AcceptedAudioExportCanonicalOwner extends AcceptedAudioExportLocalOwner {
 readonly seq:number; readonly rt:number; readonly authority:'device'|'server';
}
export interface AcceptedAudioExportState {
 readonly scope:AudioReplicaScope; readonly epoch:number; readonly appliedSeq:number; readonly blocked:null;
 readonly projection:Readonly<{
  format:'nihongo-projection'; version:4; learner:string; epoch:number; appliedSeq:number;
  error:null; updateRequired:null;
  tasks:Readonly<Record<string,AcceptedAudioExportTask>>;
  manualCards:Readonly<Record<string,Readonly<Record<string,unknown>>>>;
 }>;
 readonly canonical:Readonly<Record<string,AcceptedAudioExportCanonicalOwner>>;
 readonly local:Readonly<Record<string,AcceptedAudioExportLocalOwner>>;
}
export interface AcceptedAudioCurrentSource {
 readonly format:'nsrs-accepted-audio-current-source/v1';
 readonly namespace:AudioDemandNamespace; readonly demandIds:readonly string[];
 readonly observation:Readonly<{storageRevision:number;appliedSeq:number;demandRecordRevision:number}>;
 readonly selection:AcceptedAudioExportSelection;
 readonly sourceRevision:string; readonly correctionLedgerRevision:string;
 readonly scope:AudioSourceScope; readonly assignments:Required<AudioAssignments>;
 readonly catalog:readonly Readonly<Record<string,unknown>>[];
 readonly grammarRecords:readonly Readonly<Record<string,unknown>>[];
 readonly state:AcceptedAudioExportState;
}
export interface AcceptedAudioExport {
 /** Purpose-bound subset, never a replacement record for compareAndSwap. */
 readonly demand:Readonly<{format:'nsrs-private-audio-demand/v1';namespace:AudioDemandNamespace;record:AudioDemandRecord}>;
 readonly currentSource:AcceptedAudioCurrentSource;
}
export interface AcceptedAudioExportHandle {
 exportCurrentSource(options?:AcceptedAudioExportOptions):Promise<AcceptedAudioExport>;
}
export function createAcceptedAudioExporter(options:{
 store:AcceptedAudioStore;sink:AudioDemandSink|null;catalog:readonly Readonly<Record<string,unknown>>[];
 getOptions:(state:unknown)=>AcceptedAudioOptions & {readonly readingRules:readonly Readonly<Record<string,unknown>>[]};
 isDisposed?:()=>boolean;
}):Readonly<AcceptedAudioExportHandle>;
