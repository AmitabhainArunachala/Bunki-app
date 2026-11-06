/** One entry object (G13; SPEC S2-R18, S9): the dictionary search and the word card build the SAME object, keyed by the
 *  G9 ids — entry (JMdict seq + spelling + reading), reading, and one sense id per sense in source order — over the
 *  shipped dictionary data (data/share_alike/dict-v2/index.json for every entry; dict-v2 shards for the full sense rows
 *  where the pool holds them; dict.json core as the agreeing first answer). The first answer is the sense for this
 *  occurrence; the fuller entry is one step away through the same object; the original place is recoverable through a G4
 *  return record. Facts carry the index's provenance; generated text carries a `generated` flag and can never become a
 *  fact. Pure: no I/O (the caller loads the data), no DOM, no clock. */
import { entryId, readingId, senseId } from '../identity/identity.mjs';
import { createReturnRecord } from '../return/return.mjs';

const I = { seq: 0, head: 1, primaryReading: 2, primaryGloss: 3, writtenForms: 4, kanaForms: 5, glosses: 6, senseTagRows: 12 };
const filled = (v) => typeof v === 'string' && v.trim() !== '';
class EntryContractError extends TypeError { constructor(m) { super(m); this.name = 'EntryContractError'; } }
const need = (ok, m) => { if (!ok) throw new EntryContractError(m); };

function fnv1a32(text) {
  let h = 2166136261 >>> 0;
  for (const b of new TextEncoder().encode(text)) { h ^= b; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** a dictionary fact: text + the index's provenance; refuses generated text (S2-R18) */
export function asFact({ text, provenance, generated }) {
  need(generated !== true, 'a fact cannot be generated text (S2-R18)');
  need(filled(text), 'a fact needs its text');
  need(provenance && filled(provenance.dataset) && filled(provenance.version) && filled(provenance.licence), 'a fact needs dataset, version and licence');
  return Object.freeze({ text, provenance: Object.freeze({ dataset: provenance.dataset, version: provenance.version, licence: provenance.licence }) });
}

export function createEntryCatalog(data) {
  need(data && data.index && Array.isArray(data.index.entries) && data.index.source, 'createEntryCatalog needs the shipped dict-v2 index');
  const index = data.index; const shards = data.shards || {}; const core = data.core?.words || {};
  const provenance = Object.freeze({ dataset: index.source.name, version: index.source.pin, licence: index.source.licence });
  const bySeq = new Map(index.entries.map((e) => [e[I.seq], e]));
  const byHead = new Map();
  for (const e of index.entries) byHead.set(e[I.head], [...(byHead.get(e[I.head]) || []), e]);
  const byForm = new Map();
  for (const e of index.entries) for (const f of [...(e[I.writtenForms] || []), ...(e[I.kanaForms] || [])]) if (f !== e[I.head]) byForm.set(f, [...(byForm.get(f) || []), e]);

  /** the senses of an index row: one per senseTagRow [glossStart, glossCount, misc, field, dialect], glosses sliced from the row */
  function sensesOf(row) {
    const entry = entryId({ seq: row[I.seq], spelling: row[I.head], reading: row[I.primaryReading] });
    const glosses = row[I.glosses] || [];
    return (row[I.senseTagRows] || []).map((tag, i) => Object.freeze({
      id: senseId({ entry, index: i + 1 }), index: i + 1,
      glosses: Object.freeze(glosses.slice(tag[0], tag[0] + tag[1])),
      misc: Object.freeze([...(tag[2] || [])]), field: Object.freeze([...(tag[3] || [])]), dialect: Object.freeze([...(tag[4] || [])]),
    }));
  }
  function shardEntry(seq) {
    const id = (fnv1a32(seq) & 15).toString(16).padStart(2, '0');
    const sh = shards[id]; if (!sh) return null;
    return (sh.entries || []).find((e) => e[0] === seq) || null;
  }
  /** the one object: built from the index row; `occurrence.sense` (1-based) selects the first answer */
  function build(row, occurrence = null) {
    const spelling = row[I.head]; const readingText = row[I.primaryReading];
    const entry = entryId({ seq: row[I.seq], spelling, reading: readingText });
    const reading = readingId({ kanji: spelling, reading: readingText });
    const senses = sensesOf(row);
    need(senses.length >= 1, `${spelling}: an entry needs at least one sense`);
    let pick = 1;
    if (occurrence && occurrence.sense != null) { need(Number.isInteger(occurrence.sense) && occurrence.sense >= 1 && occurrence.sense <= senses.length, `${spelling}: occurrence sense ${occurrence.sense} is not one of ${senses.length}`); pick = occurrence.sense; }
    const first = senses[pick - 1];
    const facts = [asFact({ text: `${spelling}（${readingText}）: ${first.glosses[0]}`, provenance })];
    return Object.freeze({
      entry, reading, seq: row[I.seq], spelling, readingText,
      senses: Object.freeze(senses.map((s) => Object.freeze({ id: s.id, index: s.index, glosses: s.glosses }))),
      firstAnswer: Object.freeze({ sense: first.id, text: first.glosses[0] }),
      occurrence: occurrence ? Object.freeze({ ...occurrence }) : null,
      facts: Object.freeze(facts), provenance,
    });
  }
  function rowsFor(query) {
    const q = String(query || '').trim();
    const rows = [...(byHead.get(q) || []), ...(byForm.get(q) || [])];
    return [...new Map(rows.map((r) => [r[I.seq], r])).values()];
  }
  return {
    /** dictionary search: every entry whose head or form is the query, as entry objects (one per seq) */
    fromSearch(query) { return rowsFor(query).map((row) => build(row)); },
    /** the word card: the entry for this card's seq (a homograph without a seq is refused, never guessed) */
    fromCard({ seq, spelling, reading, occurrence = null } = {}) {
      let row = null;
      if (seq != null) { row = bySeq.get(String(seq)) || null; need(row, `no entry with seq ${seq}`); }
      else {
        const rows = rowsFor(spelling).filter((r) => !reading || r[I.primaryReading] === reading);
        need(rows.length !== 0, `no entry for ${spelling}`);
        need(rows.length === 1, `${spelling}/${reading}: ambiguous without a seq (${rows.map((r) => r[I.seq]).join(', ')}); the card must name its seq`);
        row = rows[0];
      }
      if (spelling) need(row[I.head] === spelling || (row[I.writtenForms] || []).includes(spelling) || (row[I.kanaForms] || []).includes(spelling), `seq ${row[I.seq]} is not written ${spelling}`);
      return build(row, occurrence);
    },
    /** the fuller entry, one step from the same object: every sense with every gloss, the forms, the shard detail when the pool holds it */
    fuller(obj) {
      const row = bySeq.get(obj.seq); need(row, `no entry with seq ${obj.seq}`);
      const senses = sensesOf(row); const detail = shardEntry(obj.seq);
      return Object.freeze({
        entry: obj.entry, reading: obj.reading, seq: obj.seq, spelling: obj.spelling, readingText: obj.readingText,
        senses: Object.freeze(senses), forms: Object.freeze({ written: Object.freeze([...(row[I.writtenForms] || [])]), kana: Object.freeze([...(row[I.kanaForms] || [])]) }),
        detail: detail ? Object.freeze({ kanjiForms: detail[1], kanaForms: detail[2], senses: detail[3] }) : null,
        facts: Object.freeze(senses.map((s) => asFact({ text: `${obj.spelling}（${obj.readingText}）: ${s.glosses.join('; ')}`, provenance }))), provenance,
      });
    },
    /** generated explanation text: flagged, never a fact */
    explain(obj, question) {
      const sense = obj.senses.find((s) => s.id === obj.firstAnswer.sense) || obj.senses[0];
      return Object.freeze({ generated: true, text: `${obj.spelling} here reads ${obj.readingText} and means "${sense.glosses[0]}" (sense ${sense.index} of ${obj.senses.length})${question ? ` — ${question}` : ''}`, provenance: null });
    },
    /** the G4 return record for this object at its place */
    returnRecordFor(obj, place, { purpose = 'word-entry', question = null, drafts = [], runs = [] } = {}) {
      need(place && typeof place === 'object', 'a place is required');
      return createReturnRecord({
        origin: { surface: place.surface, passageId: place.passageId, paragraph: place.paragraph },
        object: obj.entry, anchor: place.anchor, scroll: place.scroll, focus: place.focus,
        drafts, runs, purpose: { kind: purpose, question },
        distinction: obj.firstAnswer.sense,
      });
    },
  };
}
