import type {AudioCapability,AudioRef} from './audio-resources.mjs';
import type {AudioSourceAssignments} from './audio-pack-admission.mjs';
import type {AudioRootSummary,AudioSelection,AudioSelectionV2,AudioResolution,ReadyAudioSelection,ReadyAudioSelectionV2,AudioSourceField,AudioSourceFieldV2,AudioProfileAssignments} from './audio-release.mjs';
export interface StudyAudioPlayer {
 load(options?:{signal?:AbortSignal}):Promise<AudioRootSummary>;
 resolve(selection:AudioSelection|AudioSelectionV2):Promise<AudioResolution>;
 play(selection:ReadyAudioSelection|ReadyAudioSelectionV2):Promise<void>;
 stop(reason?:string):void;
 dispose():Promise<void>;
}
export type StudyAudioPreflightSnapshotV1 = Pick<ReadyAudioSelection,
 'status'|'releaseId'|'projectionId'|'contentRelease'|'taskKey'|'contentRevision'|
 'audioContentRevision'|'profileId'|'supportedReadingId'|'localState'|'segments'>;
export type StudyAudioPreflightSnapshot = StudyAudioPreflightSnapshotV1 | Pick<ReadyAudioSelectionV2,
 'version'|'status'|'releaseId'|'projectionId'|'contentRelease'|'taskKey'|'contentRevision'|
 'audioContentRevision'|'profileId'|'profileAssignments'|'supportedReadingId'|'localState'|'segments'>;
export interface StudyAudioPreflightOptions { readonly signal?:AbortSignal; readonly ref:AudioRef; readonly segment:ReadyAudioSelection['segments'][number]|ReadyAudioSelectionV2['segments'][number] }
export function createStudyAudio(options:{capability:AudioCapability;createContext?:()=>AudioContext;audioSession?:{type:string};authorize?:()=>boolean;preflight?:(snapshot:StudyAudioPreflightSnapshot,options:StudyAudioPreflightOptions)=>void|Promise<void>}):Readonly<StudyAudioPlayer>;
/** Mounted source projection; unknown fields remain absent and ambiguous languages null. */
export function studyAudioSourceFields(entry:unknown):readonly AudioSourceField[];

export function studyAudioSourcePlan(entry:unknown,assignments?:AudioSourceAssignments):Readonly<{audioContentRevision:string;sourceFields:readonly AudioSourceField[]}>;

/** Explicit v2 projection retains original source partitions; default signature remains v1. */
export function studyAudioSourcePlan(entry:unknown,assignments:AudioSourceAssignments|undefined,options:{version:2}):Readonly<{audioContentRevision:string;sourceFields:readonly AudioSourceFieldV2[]}>;
export function studyAudioSourcePlan(entry:unknown,assignments:AudioSourceAssignments|undefined,options:{version:1}):Readonly<{audioContentRevision:string;sourceFields:readonly AudioSourceField[]}>;
export function studyAudioProfileAssignments(root:AudioRootSummary|null,assignments:AudioSourceAssignments,sourceFields:readonly (AudioSourceField|AudioSourceFieldV2)[],selectedFields:readonly string[]):AudioProfileAssignments;
