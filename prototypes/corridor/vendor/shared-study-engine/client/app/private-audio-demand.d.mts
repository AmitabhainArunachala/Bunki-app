import type {AudioDemandSink} from '../audio/accepted-demand.mjs';
export interface NativeAudioDemandCapability extends AudioDemandSink {readonly protocol:'nsrs-private-audio-demand/v1'}
export function createPrivateAudioDemandSink(options?:{indexedDB?:IDBFactory}):Readonly<AudioDemandSink>;
export function selectAudioDemandSink(options?:{
 native?:boolean;nativeCapability?:NativeAudioDemandCapability|null;indexedDB?:IDBFactory;
}):Readonly<{state:'available';sink:AudioDemandSink}|{state:'persistence-unavailable';sink:null}>;
