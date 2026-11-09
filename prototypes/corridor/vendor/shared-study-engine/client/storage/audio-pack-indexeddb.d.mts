export interface AudioPackRef {key:string;sha256:string;bytes:number}
export interface AudioPackBinding {namespace:{environment:string;learner:string;installation:string;epoch:number};releaseId:string;projectionId:string;contentRelease:string;root:AudioPackRef}
export interface InstalledAudioPackMarker {format:'nsrs-installed-audio-pack/v1';binding:AudioPackBinding;packId:string;refs:AudioPackRef[]}
export interface StoreOptions {signal?:AbortSignal}
export interface AudioPackIndexedDBStore {
 listPacks(binding:AudioPackBinding,options?:StoreOptions):Promise<string[]>;
 readPack(binding:AudioPackBinding,packId:string,options?:StoreOptions):Promise<InstalledAudioPackMarker|null>;
 readResource(binding:AudioPackBinding,ref:AudioPackRef,options?:StoreOptions):Promise<Uint8Array|null>;
 stageResource(binding:AudioPackBinding,ref:AudioPackRef,bytes:Uint8Array,options?:StoreOptions&{quotaBytes?:number}):Promise<void>;
 commitPack(binding:AudioPackBinding,marker:InstalledAudioPackMarker,options?:StoreOptions):Promise<void>;
 invalidatePack(binding:AudioPackBinding,packId:string,options?:StoreOptions):Promise<void>;
 close():Promise<void>;
}
export function createAudioPackIndexedDBStore(options?:{databaseName?:string}):AudioPackIndexedDBStore;
