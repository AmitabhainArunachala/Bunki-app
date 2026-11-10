import { readLocalJson, type LocalJson } from './json.ts';

/** Bounded, handle-local decode reuse. A hit requires both the exact bytes and
 * their checked digest; revision alone never attests that disk is unchanged.
 * This cache contains no session authority and is never a source for writes.
 */
export class LocalJsonReadCache {
  readonly #entries = new Map<string, { text: string; sha256: string; value: LocalJson }>();
  #characters = 0;
  constructor(
    readonly maxEntries = 4096,
    readonly maxCharacters = 8 * 1024 * 1024,
  ) {}

  read(key: string, text: string, sha256: string): LocalJson {
    const prior = this.#entries.get(key);
    if (prior) {
      this.#entries.delete(key);
      this.#characters -= prior.text.length;
      if (prior.text === text && prior.sha256 === sha256) {
        this.#entries.set(key, prior);
        this.#characters += text.length;
        return prior.value;
      }
    }
    const value = readLocalJson(text, sha256);
    if (this.maxEntries > 0 && text.length <= this.maxCharacters) {
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
    return value;
  }

  clear(): void {
    this.#entries.clear();
    this.#characters = 0;
  }
}
