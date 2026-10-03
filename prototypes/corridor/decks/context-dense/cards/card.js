/** One authored card. Paragraph text is the sentences joined, in order. */
export function c(id, target, reading, glossJa, glossEn, sentences, extra = {}) {
  return {
    id,
    target,
    reading,
    readings: extra.readings ?? [reading],
    glossJa,
    glossEn,
    sentences,
    note: extra.note ?? null,
    seeAlso: extra.see == null ? [] : Array.isArray(extra.see) ? [...extra.see] : [extra.see],
  };
}
