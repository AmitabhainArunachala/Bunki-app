/** Shared v1/v2 release semantics; persisted resource/store bindings remain unchanged. */
import type {AudioReleaseSelection} from './audio-resources.mjs';
import type {AudioPackInspection,AudioProfile,AudioReleaseReader,AudioRootSummary} from './audio-release.mjs';

export interface AudioPackNamespace {
 readonly environment:string;
 readonly learner:string;
 readonly installation:string;
 readonly epoch:number;
}
export interface AudioPackBinding {
 readonly namespace:AudioPackNamespace;
 readonly releaseId:`sha256:${string}`;
 readonly projectionId:string;
 readonly contentRelease:string;
 readonly root:AudioReleaseSelection['root'];
}
export interface AudioPackScope { readonly accessScope:string;readonly licenseScope:string }
export interface AudioPackAuthority {
 readonly identities:AudioRootSummary['identities'];
 readonly correctionLedgerRevision:string;
 readonly defaultProfileId:string|null;
 readonly profiles:readonly Readonly<{id:string;profile:AudioProfile}>[];
}
export interface AudioPackGrant {
 readonly revision:string;
 readonly namespace:AudioPackNamespace;
 readonly releaseId:`sha256:${string}`;
 readonly packIds:readonly string[];
 readonly profileIds:readonly string[];
 readonly scope:AudioPackScope;
}
export interface AudioPackValidationStamp {
 readonly sourceRevision:string;
 readonly grantRevision:string;
 readonly fingerprint:string;
}
export interface AudioSourceEntry {
 readonly taskKey:string;
 readonly noteGuid:string;
 readonly contractId:string;
 readonly passageId:string;
 readonly contentRevision?:string|null;
 readonly contentReady:true;
 readonly manual?:boolean;
 readonly grammarGuid?:string;
 readonly ja?:string;
 readonly grammarRecord?:Readonly<Record<string,unknown>>;
 readonly [key:string]:unknown;
}
export interface AudioRegistryTask {
 readonly taskKey:string;
 readonly noteGuid:string;
 readonly contractId?:string;
 readonly contract?:string;
 readonly passageId:string;
 readonly player?:unknown;
}
export interface AudioRegistrySource { readonly sourceJaSha256:string;readonly [key:string]:unknown }
export interface AudioSourceRegistry {
 readonly tasks:readonly AudioRegistryTask[];
 readonly passages?:readonly AudioRegistrySource[];
 readonly examples?:readonly AudioRegistrySource[];
 readonly notes?:readonly Readonly<Record<string,unknown>>[];
}
export interface AcceptedAudioDemand {
 readonly demandId:string;
 readonly sourceProof:Readonly<{kind:string;[key:string]:unknown}>;
 readonly [key:string]:unknown;
}
export interface AcceptedAudioSnapshotInputs {
 readonly state:Readonly<Record<string,unknown>>;
 readonly replicaScope:Readonly<{environment:string;learner:string;installation:string}>;
 readonly catalog:readonly AudioSourceEntry[];
 readonly grammarRecords:readonly Readonly<Record<string,unknown>>[];
 readonly sourceRevision:string;
 readonly correctionLedgerRevision:string;
 readonly readingRules:readonly unknown[];
 readonly scope:AudioPackScope;
 readonly assignments:Readonly<Record<string,unknown>>;
}
export interface ResolvedAcceptedAudioBatch {
 readonly catalog:readonly AudioSourceEntry[];
 readonly grammarRecords:readonly Readonly<Record<string,unknown>>[];
 readonly sourceRevision:string;
 readonly scope:AudioPackScope;
 readonly assignments:Readonly<Record<string,unknown>>;
}
export interface AudioPackCurrentSource {
 readonly revision:string;
 readonly namespace:AudioPackNamespace;
 readonly contentRelease:string;
 readonly authority:AudioPackAuthority;
 readonly catalog:readonly AudioSourceEntry[];
 readonly registry:AudioSourceRegistry;
 readonly grammarRecords:readonly Readonly<Record<string,unknown>>[];
 readonly selectedAssignments?:AudioSourceAssignments;
 readonly accepted?:{
  readonly demands:readonly AcceptedAudioDemand[];
  readonly inputs:AcceptedAudioSnapshotInputs;
 };
}
export interface AudioSourceAssignments {
 readonly profiles?:Readonly<Record<string,unknown>>;
 readonly languageAssignments?:Readonly<Record<string,Readonly<Record<string,unknown>>>>;
 readonly readingAssignments?:Readonly<Record<string,Readonly<Record<string,unknown>>>>;
}
export interface AudioPackAdmission {
 readonly binding:AudioPackBinding;
 authorize(packId:string,options?:{signal?:AbortSignal}):Promise<AudioPackGrant>;
 validate(inspection:AudioPackInspection,options:{reader:Pick<AudioReleaseReader,'resolve'>;signal?:AbortSignal;placement?:AudioPackInspection['placements'][number];metadataOnly?:boolean}):Promise<AudioPackValidationStamp>;
}
export function createAudioPackAdmission(options:{
 release:AudioReleaseSelection;
 namespace:AudioPackNamespace;
 authority:AudioPackAuthority;
 scope:AudioPackScope;
 readCurrentSource(options:{taskKeys:readonly string[];signal?:AbortSignal}):Promise<AudioPackCurrentSource>;
 authorize(options:{
  binding:AudioPackBinding;
  packId:string;
  scope:AudioPackScope;
  profileIds:readonly string[];
  signal?:AbortSignal;
 }):Promise<AudioPackGrant|null>;
}):Readonly<AudioPackAdmission>;
