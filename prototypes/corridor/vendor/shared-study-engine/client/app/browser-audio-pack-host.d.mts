import type {AudioCapability, AudioReleaseSelection} from './audio-resources.mjs';
import type {AudioPackBinding, createAudioPackAdmission} from './audio-pack-admission.mjs';
import type {StudyAudioPreflightSnapshot, StudyAudioPreflightOptions} from './study-audio.mjs';
import type {AudioPackTransport} from './audio-pack-manager.mjs';
import type {AudioPackSourceReader,AudioPackSourceReaderOptions} from './audio-pack-source.mjs';

export type AudioDownloadsState = 'idle' | 'checking' | 'downloading' | 'saved' |
  'cancelled' | 'error' | 'paused' | 'disposed';
export interface AudioDownloadsSnapshot {
  readonly state: AudioDownloadsState;
  /** Configured packs, never cards or learning progress. */
  readonly selectedPacks: number;
  readonly installedPacks: number;
}
export interface AudioDownloads {
  read(): Readonly<AudioDownloadsSnapshot>;
  subscribe(listener: (snapshot: Readonly<AudioDownloadsSnapshot>) => void): () => void;
  acquire(): Promise<void>;
  cancel(): void;
  refresh(): Promise<void>;
  readSource: AudioPackSourceReader;
  authorizePlayback(snapshot: StudyAudioPreflightSnapshot, options: StudyAudioPreflightOptions): Promise<void>;
}
export interface BrowserAudioPackConfiguration {
  readonly release: AudioReleaseSelection;
  readonly authority: AudioPackSourceReaderOptions['authority'];
  readonly scope: AudioPackSourceReaderOptions['scope'];
  /** Between 1 and 64 unique actual release pack IDs. */
  readonly packIds: readonly string[];
  readonly transport: AudioPackTransport;
  readonly authorize: Parameters<typeof createAudioPackAdmission>[0]['authorize'];
  readonly getAssignments?: AudioPackSourceReaderOptions['getAssignments'];
}
export interface BrowserAudioPackHostOptions extends Partial<Pick<AudioPackSourceReaderOptions,
  'store' | 'catalog' | 'registry' | 'grammarRecords' | 'build' | 'buildSha256' | 'getAssignments'>> {
  readonly configuration?: BrowserAudioPackConfiguration | null;
  readonly eventTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
}
export interface BrowserAudioPackHost {
  readonly binding: AudioPackBinding;
  readonly audio: AudioCapability;
  readonly audioDownloads: Readonly<AudioDownloads>;
  /** Idempotent: returns the same promise and drains work before closing storage. */
  dispose(): Promise<void>;
}
export function createBrowserAudioPackHost(options?: BrowserAudioPackHostOptions):
  Promise<Readonly<BrowserAudioPackHost> | null>;
