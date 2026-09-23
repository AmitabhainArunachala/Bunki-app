import type {
  AudioMediaVersion,
  EditorialAspect,
  ImageMediaVersion,
  MediaVersion,
} from '../src/index.ts';

/** Compile-only consumer: media must narrow before audio or image fields are usable. */
export function consumeMedia(media: MediaVersion): string {
  // @ts-expect-error Image metadata cannot supply audio duration.
  const uncheckedDuration: number = media.durationMs;
  void uncheckedDuration;
  if (media.kind === 'audio') {
    const audio: AudioMediaVersion = media;
    // @ts-expect-error Audio metadata cannot supply raster dimensions.
    const width: number = media.width;
    void width;
    return `${audio.durationMs}:${audio.transcript ?? ''}:${audio.speakers.length}`;
  }
  const image: ImageMediaVersion = media;
  // @ts-expect-error Image metadata has no audio speakers.
  const speakers: readonly string[] = image.speakers;
  void speakers;
  return `${image.mimeType}:${image.width}x${image.height}:${image.alt}`;
}
export const optionalVisualAspect: EditorialAspect = 'visual';
