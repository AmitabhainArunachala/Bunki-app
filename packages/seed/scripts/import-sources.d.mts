/**
 * Types for `import-sources.mjs`, so the pipeline's pure stages can be unit
 * tested from TypeScript.
 *
 * The script stays JavaScript because it runs under bare `node` with no build
 * step — that is what makes "anyone with network access can reproduce the
 * shipped data with one command" true. But its parsers are the part most likely
 * to be quietly wrong (a whole round shipped with attribute-carrying `<gloss>`
 * elements invisible to it), and a parser nothing tests is a parser nobody
 * knows the behaviour of. This file is the seam that lets
 * `test/import-parser.test.ts` reach them.
 *
 * It cannot drift into fiction unnoticed: every name declared here is imported
 * and *called* by that test, so a declaration for an export the script does not
 * have fails at run time rather than passing as a type.
 *
 * Only the stages that are pure and offline are typed precisely. The network and
 * filesystem stages are declared with the shapes their callers use.
 */

export const KANJIVG_COMMIT: string;

export interface LicenceTextSpec {
  readonly url: string;
  readonly describes: string;
}
export const LICENCE_TEXTS: Readonly<Record<string, LicenceTextSpec>>;

export interface SourceSpec {
  readonly displayName: string;
  readonly licence: string;
  readonly licenceFiles: readonly string[];
  readonly download: { readonly url: string; readonly cacheAs: string } | null;
  readonly projectUrl: string;
}
export const SOURCES: Readonly<Record<string, SourceSpec>>;

export const FIELD_PROVENANCE: Readonly<Record<string, Readonly<Record<string, string>>>>;

/** One located XML element: its raw attribute text and its inner text. */
export interface XmlElement {
  readonly attributes: string;
  readonly text: string;
}

export function between(
  xml: string,
  tag: string,
  from?: number,
): { readonly text: string; readonly attributes: string; readonly end: number } | null;

export function allElements(xml: string, tag: string): readonly XmlElement[];

export function allBetween(xml: string, tag: string): readonly string[];

export function parseEntities(xml: string): Map<string, string>;

export function priorityScore(tags: readonly string[]): number | null;

export interface JMdictEntry {
  readonly entSeq: string;
  readonly headword: string;
  readonly reading: string;
  readonly hasKanji: boolean;
  readonly partOfSpeech: readonly string[];
  readonly senses: readonly string[];
  readonly priorityTags: readonly string[];
  readonly score: number | null;
}
export function parseJMdict(xml: string): readonly JMdictEntry[];

export interface Kanjidic2Character {
  readonly literal: string;
  readonly strokeCount: number | null;
  readonly grade: number | null;
  readonly frequency: number | null;
  readonly jlpt: number | null;
  readonly onReadings: readonly string[];
  readonly kunReadings: readonly string[];
  readonly meanings: readonly string[];
}
export function parseKanjidic2(xml: string): Map<string, Kanjidic2Character>;

export function tatoebaCell(raw: unknown): string | null;

export function selectLexemes(
  entries: readonly JMdictEntry[],
  limit: number,
): readonly JMdictEntry[];

export function kanjiIn(text: string): readonly string[];

export function parseArgs(argv: readonly string[]): {
  readonly lexemes: number;
  readonly sentences: number;
  readonly strokes: number;
  readonly concurrency: number;
  readonly cache: string;
  readonly offline: boolean;
  readonly licencesOnly: boolean;
  readonly check: boolean;
  readonly verifyReproducible: boolean;
  readonly verifyFixtures: boolean;
  readonly rewriteFixtures: boolean;
  readonly verifyAttribution: boolean;
};

export function assertProvenanceRegistered(): Promise<boolean>;
export function assertLicensed(sourceKey: string): Promise<boolean>;
export function fetchLicences(options: { readonly offline: boolean }): Promise<unknown>;
export function parseTatoebaSentences(
  path: string,
  keep: ReadonlySet<string> | null,
): Promise<Map<string, { id: string; lang: string; text: string; username: string | null }>>;
export function verifyFixtures(
  options: unknown,
  extra?: { readonly rewrite?: boolean },
): Promise<number>;
export function runImport(
  options: unknown,
  extra?: { readonly dataDir?: string; readonly log?: (message: string) => void },
): Promise<{
  readonly manifest: Record<string, unknown>;
  readonly outputs: Record<string, { bytes: number; sha256: string }>;
  readonly outDir: string;
  readonly dataDir: string;
}>;
export function verifyReproducible(options: unknown): Promise<number>;
export function verifyAttribution(options: unknown): Promise<number>;
