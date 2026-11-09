import type {AudioCapability,AudioRef,AudioReleaseSelection,PackState} from './audio-resources.mjs';
import type {AudioPackAdmission,AudioPackBinding,AudioPackNamespace} from './audio-pack-admission.mjs';
import type {StudyAudioPreflightSnapshot,StudyAudioPreflightOptions} from './study-audio.mjs';

export interface InstalledAudioPackMarker {
 readonly format:'nsrs-installed-audio-pack/v1';
 readonly binding:AudioPackBinding;
 readonly packId:string;
 readonly refs:readonly AudioRef[];
}
export interface AudioPackStore {
 listPacks(binding:AudioPackBinding,options?:{signal?:AbortSignal}):Promise<string[]>;
 readPack(binding:AudioPackBinding,packId:string,options?:{signal?:AbortSignal}):Promise<InstalledAudioPackMarker|null>;
 readResource(binding:AudioPackBinding,ref:AudioRef,options?:{signal?:AbortSignal}):Promise<Uint8Array|null>;
 stageResource(binding:AudioPackBinding,ref:AudioRef,bytes:Uint8Array,options:{
  signal?:AbortSignal;
  quotaBytes:536870912;
 }):Promise<void>;
 commitPack(binding:AudioPackBinding,marker:InstalledAudioPackMarker,options?:{signal?:AbortSignal}):Promise<void>;
 invalidatePack(binding:AudioPackBinding,packId:string,options?:{signal?:AbortSignal}):Promise<void>;
}
export interface AudioPackTransport {
 read(ref:AudioRef,options?:{signal?:AbortSignal}):Promise<Uint8Array>;
}
export interface AudioPackManager {
 readonly audio:AudioCapability;
 acquire(packIds:readonly string[],options?:{signal?:AbortSignal}):Promise<void>;
 verifyPack(packId:string,options?:{signal?:AbortSignal}):Promise<PackState>;
 authorizePlayback(snapshot:StudyAudioPreflightSnapshot,options:StudyAudioPreflightOptions):Promise<void>;
 dispose():Promise<void>;
}
export function createAudioPackManager(options:{
 release:AudioReleaseSelection;
 namespace:AudioPackNamespace;
 transport:AudioPackTransport;
 store:AudioPackStore;
 admission:AudioPackAdmission;
}):Readonly<AudioPackManager>;
