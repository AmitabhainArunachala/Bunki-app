import { plainStringify, readLocalJson, type LocalJson } from './json.ts';

/**
 * Bounded, handle-local reuse of a row's checked decode.
 *
 * An entry is the answer of a pure function: the value that `readLocalJson`
 * returns for exactly this text and digest. A hit therefore requires the very
 * bytes read from disk in the current transaction to equal the kept text, and
 * the row's digest to equal the kept digest. A revision number, a key or an
 * earlier read never stands in for the bytes. The cache says nothing about what
 * is on disk, holds no session authority and is never a source for a write.
 *
 * `remember` enters the text and digest that `encodeLocalJson` has just made
 * from a value. Decoding that text would give an equal value, so the entry is
 * true whether or not the transaction that wrote the row goes on to commit: it
 * can only ever answer a later read that finds those same bytes.
 */
export class LocalJsonReadCache {
  readonly #entries = new Map<string, { text: string; sha256: string; value: LocalJson }>();
  #characters = 0;
  #retired = false;
  constructor(
    readonly maxEntries = 4096,
    readonly maxCharacters = 48 * 1024 * 1024,
  ) {}

  get size(): number {
    return this.#entries.size;
  }

  read(key: string, text: string, sha256: string): LocalJson {
    // An entry is the answer of a full read. A full read re-serializes the row, so while an inherited toJSON
    // could change that text the full read is made and nothing is answered or kept.
    if (this.#retired || !plainStringify()) return readLocalJson(text, sha256);
    const prior = this.#entries.get(key);
    if (prior) {
      if (prior.sha256 === sha256 && prior.text === text) {
        // Moving a hit to the young end only matters once something could be
        // put out; a store read row by row many times a second stays in place.
        if (this.#crowded()) {
          this.#entries.delete(key);
          this.#entries.set(key, prior);
        }
        return prior.value;
      }
      this.#entries.delete(key);
      this.#characters -= prior.text.length;
    }
    const value = readLocalJson(text, sha256);
    this.#keep(key, text, sha256, value);
    return value;
  }

  remember(key: string, text: string, sha256: string, value: LocalJson): void {
    if (this.#retired || !plainStringify()) return;
    const prior = this.#entries.get(key);
    if (prior) {
      this.#entries.delete(key);
      this.#characters -= prior.text.length;
    }
    this.#keep(key, text, sha256, value);
  }

  forget(key: string): void {
    const prior = this.#entries.get(key);
    if (!prior) return;
    this.#entries.delete(key);
    this.#characters -= prior.text.length;
  }

  /** Whether the cache is over half of either bound, so that the order of entries can matter. */
  #crowded(): boolean {
    return this.#entries.size * 2 > this.maxEntries || this.#characters * 2 > this.maxCharacters;
  }

  #keep(key: string, text: string, sha256: string, value: LocalJson): void {
    if (this.maxEntries <= 0 || text.length > this.maxCharacters) return;
    while (
      this.#entries.size >= this.maxEntries ||
      this.#characters + text.length > this.maxCharacters
    ) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#characters -= this.#entries.get(oldest)!.text.length;
      this.#entries.delete(oldest);
    }
    this.#entries.set(key, { text, sha256, value });
    this.#characters += text.length;
  }

  /** After this no entry is kept or answered: every read is a full checked decode. */
  retire(): void {
    this.#retired = true;
    this.#entries.clear();
    this.#characters = 0;
  }
}
