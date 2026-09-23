import { sha256Hex } from '@bunki/ai/hash';

/** Identity uses the publisher and canonical link across its feed channels. */
export function feedEntryId(publisherId: string, canonicalUrl: string): string {
  return 'feed:' + sha256Hex(JSON.stringify([publisherId, canonicalUrl]));
}

export function feedRevisionId(entry: {
  id: string;
  canonicalUrl: string;
  title: string;
  publishedAt: string | null;
  updatedAt: string | null;
  categories: readonly string[];
}): string {
  return (
    'feedv:' +
    sha256Hex(
      JSON.stringify([
        entry.id,
        entry.canonicalUrl,
        entry.title,
        entry.publishedAt,
        entry.updatedAt,
        entry.categories,
      ]),
    )
  );
}
