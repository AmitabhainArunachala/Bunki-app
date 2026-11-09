import type {AudioCapability,AudioRef} from './audio-resources.mjs';
import type {AudioSourceAssignments} from './audio-pack-admission.mjs';
import type {AudioRootSummary,AudioSelection,AudioResolution,ReadyAudioSelection,AudioSourceField} from './audio-release.mjs';
export interface StudyAudioPlayer {
 load(options?:{signal?:AbortSignal}):Promise<AudioRootSummary>;
 resolve(selection:AudioSelection):Promise<AudioResolution>;
 play(selection:ReadyAudioSelection):Promise<void>;
 stop(reason?:string):void;
 dispose():Promise<void>;
}
export type StudyAudioPreflightSnapshot = Pick<ReadyAudioSelection,
 'status'|'releaseId'|'projectionId'|'contentRelease'|'taskKey'|'contentRevision'|
 'audioContentRevision'|'profileId'|'supportedReadingId'|'localState'|'segments'>;
export interface StudyAudioPreflightOptions { readonly signal?:AbortSignal; readonly ref:AudioRef; readonly segment:ReadyAudioSelection['segments'][number] }
export function createStudyAudio(options:{capability:AudioCapability;createContext?:()=>AudioContext;audioSession?:{type:string};authorize?:()=>boolean;preflight?:(snapshot:StudyAudioPreflightSnapshot,options:StudyAudioPreflightOptions)=>void|Promise<void>}):Readonly<StudyAudioPlayer>;
/** Mounted source projection; unknown fields remain absent and ambiguous languages null. */
export function studyAudioSourceFields(entry:unknown):readonly AudioSourceField[];

export function studyAudioSourcePlan(entry:unknown,assignments?:AudioSourceAssignments):Readonly<{audioContentRevision:string;sourceFields:readonly AudioSourceField[]}>;
