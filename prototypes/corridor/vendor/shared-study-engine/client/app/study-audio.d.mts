import type {AudioCapability} from './audio-resources.mjs';
import type {AudioRootSummary,AudioSelection,AudioResolution,ReadyAudioSelection,AudioSourceField} from './audio-release.mjs';
export interface StudyAudioPlayer {
 load():Promise<AudioRootSummary>;
 resolve(selection:AudioSelection):Promise<AudioResolution>;
 play(selection:ReadyAudioSelection):Promise<void>;
 stop(reason?:string):void;
 dispose():Promise<void>;
}
export function createStudyAudio(options:{capability:AudioCapability;createContext?:()=>AudioContext;audioSession?:{type:string};authorize?:()=>boolean}):Readonly<StudyAudioPlayer>;
/** Mounted source projection; unknown fields remain absent and ambiguous languages null. */
export function studyAudioSourceFields(entry:unknown):readonly AudioSourceField[];

export function studyAudioSourcePlan(entry:unknown):Readonly<{audioContentRevision:string;sourceFields:readonly AudioSourceField[]}>;
