// Answer-side editorial material is separate from assessment identity and evidence.
// A replacement must bind to the exact original paragraph and reconstruct it.
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, label, maximum = 6000) => assert(typeof value === 'string' && value.trim() && value.length <= maximum, `Invalid answer enrichment ${label}.`);
const han = /[\p{Script=Han}々〆〇]/u;
const kana = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function validateSegments(segments, original) {
  assert(Array.isArray(segments) && segments.length > 0 && segments.length <= 8000, 'Invalid reading segments.');
  for (const segment of segments) {
    assert(object(segment) && typeof segment.text === 'string' && segment.text.length > 0 && segment.text.length <= 1000, 'Invalid reading segment.');
    if (segment.lemma !== undefined) text(segment.lemma, 'dictionary form', 300);
    if (segment.reading !== undefined) assert(typeof segment.reading === 'string' && segment.reading.length <= 1000 && kana.test(segment.reading), 'Readings must use kana.');
    assert(!han.test(segment.text) || segment.reading, 'Enriched Japanese has kanji without a reading. Nothing was imported.');
  }
  if (original !== undefined) assert(segments.map(segment => segment.text).join('') === original, 'The reading annotation changes the original text. Nothing was imported.');
}

export async function validateEnrichment(value, collection, digest) {
  assert(object(value) && value.format === 'bunki-personal-enrichment' && value.version === 1, 'Choose a supported answer enrichment file.');
  assert(typeof value.collectionId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value.collectionId), 'Invalid enrichment collection identity.');
  assert(sha(value.contentDigest) && Number.isSafeInteger(value.revision) && value.revision > 0, 'Invalid answer enrichment edition.');
  assert(object(value.provenance), 'Answer explanations must identify their authorship.');
  text(value.provenance.authorshipJa, 'authorship');
  text(value.provenance.readingMethodJa, 'reading method');
  assert(Array.isArray(value.lessons) && value.lessons.length > 0 && value.lessons.length <= 10000, 'Invalid enriched paragraph list.');
  if (collection) assert(value.collectionId === collection.id && value.contentDigest === collection.contentDigest, 'These answers belong to a different collection edition. Nothing was changed.');
  const originals = collection && new Map(collection.lessons.map(lesson => [lesson.id, lesson]));
  const ids = new Set();
  for (const lesson of value.lessons) {
    assert(object(lesson) && typeof lesson.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(lesson.id) && !ids.has(lesson.id), 'Invalid or duplicate enriched paragraph identity.');
    ids.add(lesson.id);
    assert(sha(lesson.contentHash), 'Invalid enriched paragraph binding.');
    for (const key of ['explanationJa', 'grammarJa', 'usageJa']) text(lesson[key], key);
    for (const key of ['applicationJa', 'contrastJa', 'conceptQuestionJa']) if (lesson[key] !== undefined) text(lesson[key], key);
    assert(Array.isArray(lesson.relations) && lesson.relations.length <= 8, 'Invalid related expressions.');
    for (const relation of lesson.relations) {
      assert(object(relation), 'Invalid related expression.');
      for (const key of ['term', 'reading', 'explanationJa']) text(relation[key], key);
      assert(kana.test(relation.reading), 'Related-expression readings must use kana.');
    }
    validateSegments(lesson.segments);
    if (originals) {
      const original = originals.get(lesson.id);
      assert(original && original.contentHash === lesson.contentHash, 'These answers do not match the stored paragraph. Nothing was changed.');
      validateSegments(lesson.segments,original.ja);
    }
    if (lesson.rubySegments !== undefined) {
      assert(object(lesson.rubySegments), 'Invalid Japanese answer readings.');
      for (const field of ['explanationJa','grammarJa','usageJa','contrastJa','applicationJa','conceptQuestionJa']) {
        if (lesson[field] !== undefined) validateSegments(lesson.rubySegments[field],lesson[field]);
      }
      assert(Array.isArray(lesson.rubySegments.relations) && lesson.rubySegments.relations.length === lesson.relations.length, 'Invalid related-expression readings.');
      lesson.relations.forEach((relation,index)=> {
        const readings=lesson.rubySegments.relations[index];
        assert(object(readings),'Invalid related-expression reading.');
        validateSegments(readings.term,relation.term);
        validateSegments(readings.explanationJa,relation.explanationJa);
      });
    }
  }
  const {enrichmentHash, ...content} = value;
  assert(sha(enrichmentHash) && enrichmentHash === await digest(content), 'The answer enrichment failed its integrity check. Nothing was imported.');
  return value;
}

export function mergeEnrichment(current, incoming) {
  if (!incoming) return current;
  if (!current || current.enrichmentHash === incoming.enrichmentHash) return incoming;
  assert(current.collectionId === incoming.collectionId && current.contentDigest === incoming.contentDigest, 'Answer enrichment cannot move between collection editions.');
  assert(incoming.revision > current.revision, 'This answer file is older or conflicts with the saved revision. Your answers and reviews were kept.');
  return incoming;
}
