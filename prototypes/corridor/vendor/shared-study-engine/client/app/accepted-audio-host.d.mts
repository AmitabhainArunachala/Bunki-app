import type {AcceptedAudioStore,AcceptedAudioHandle,AudioAssignments,UnsupportedAudioSource} from '../audio/accepted-demand.mjs';
import type {NativeAudioDemandCapability} from './private-audio-demand.mjs';
import type {AcceptedAudioExportHandle} from './accepted-audio-export.mjs';
export function acceptedAudioSourceRevision(options:{
 build?:Readonly<{contentRevision?:number;files:Readonly<Record<string,string>>}>|null;
 catalog?:readonly Readonly<Record<string,unknown>>[];grammarRecords?:readonly Readonly<Record<string,unknown>>[];
}):string;
export function startAcceptedAudioHost(options:{
 store:AcceptedAudioStore;catalog:readonly Readonly<Record<string,unknown>>[];
 grammarRecords:readonly Readonly<Record<string,unknown>>[];sourceRevision:string;
 native?:boolean;nativeCapability?:NativeAudioDemandCapability|null;indexedDB?:IDBFactory;
 getAssignments?:()=>AudioAssignments;unsupportedSources?:()=>readonly UnsupportedAudioSource[];
 observerOptions?:{retryMs?:number;debounceMs?:number};
}):Readonly<AcceptedAudioHandle & AcceptedAudioExportHandle>;
