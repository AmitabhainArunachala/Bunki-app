import type {AudioPackAuthority,AudioPackCurrentSource,AudioPackScope,
 AudioSourceEntry,AudioSourceRegistry} from './audio-pack-admission.mjs';

export interface AudioPackSourceScope {
 readonly environment:string;
 readonly learner:string;
 readonly installation:string;
}
export interface AudioPackSourceStore {
 readonly scope:AudioPackSourceScope;
 readState(options?:{requireCompatible?:boolean}):Promise<unknown>;
}
export interface AudioPackSourceBuild {
 readonly files:Readonly<Record<string,string>>;
 readonly dictionarySha256?:string;
 readonly [key:string]:unknown;
}
export interface AudioPackSourceReaderOptions {
 readonly store:AudioPackSourceStore;
 readonly catalog:readonly AudioSourceEntry[];
 readonly registry:AudioSourceRegistry;
 readonly grammarRecords:readonly Readonly<Record<string,unknown>>[];
 readonly build:AudioPackSourceBuild;
 readonly buildSha256:string;
 readonly authority:AudioPackAuthority;
 readonly scope:AudioPackScope;
 readonly getAssignments?:(state:unknown)=>Readonly<Record<string,unknown>>;
}
export interface AudioPackSourceReadOptions {
 /** Up to 4096 unique current task keys. */
 readonly taskKeys:readonly string[];
 readonly signal?:AbortSignal;
}
export type AudioPackSourceReader=
 (options:AudioPackSourceReadOptions)=>Promise<AudioPackCurrentSource>;
export function createAudioPackSourceReader(
 options:AudioPackSourceReaderOptions,
):AudioPackSourceReader;
