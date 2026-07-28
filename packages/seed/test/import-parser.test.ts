/**
 * The importer's XML parser, tested against XML rather than against prose.
 *
 * ## Why this file exists
 *
 * The pipeline located elements by searching for the literal string `<tag>`.
 * That is not "an opening tag" — it is "an opening tag carrying no attributes",
 * and JMdict marks explanatory, literal, figurative and trademark glosses with a
 * `g_type` attribute. So 3,674 real English glosses were invisible to the
 * importer, and the 25 entries whose *only* glosses are typed disappeared from
 * the corpus altogether: they reached `senses.length === 0` and were skipped.
 * The shipped manifest recorded `jmdictEntriesAvailable: 218148` against 218,173
 * entries in the file, which is that bug leaving a receipt nobody read.
 *
 * A parser that is wrong in a way its own output cannot show is exactly what a
 * unit test is for, so the cases below are XML the real file contains, written
 * out small enough to read.
 *
 * Offline and dependency-free (controller §17.5): every fixture is a string in
 * this file. Re-deriving values from the real archives is
 * `scripts/import-sources.mjs --verify-reproducible`.
 */

import { describe, expect, it } from 'vitest';

import {
  allBetween,
  allElements,
  between,
  parseJMdict,
  parseKanjidic2,
} from '../scripts/import-sources.mjs';

describe('between() locates an element by name, not by the absence of attributes', () => {
  it('finds a tag that carries attributes', () => {
    const hit = between('<gloss g_type="expl">an explanation</gloss>', 'gloss');
    expect(hit?.text).toBe('an explanation');
    expect(hit?.attributes).toBe('g_type="expl"');
  });

  it('finds a bare tag, and reports no attributes', () => {
    const hit = between('<gloss>plain</gloss>', 'gloss');
    expect(hit?.text).toBe('plain');
    expect(hit?.attributes).toBe('');
  });

  it('matches the tag name exactly, so a longer name is not a match', () => {
    // The literal-string search got this right by accident. A regex written
    // carelessly to fix the attribute bug would break it.
    expect(between('<glossary>no</glossary>', 'gloss')).toBeNull();
    expect(between('<sense_extra>no</sense_extra>', 'sense')).toBeNull();
  });

  it('handles a self-closing element without hunting for a close tag', () => {
    const hit = between('<gloss/><gloss>after</gloss>', 'gloss');
    expect(hit?.text).toBe('');
    const rest = between('<gloss/><gloss>after</gloss>', 'gloss', hit?.end ?? 0);
    expect(rest?.text).toBe('after');
  });

  it('closes at its own close tag, not at a same-named child', () => {
    const hit = between('<a><a>inner</a>tail</a>', 'a');
    expect(hit?.text).toBe('<a>inner</a>tail');
  });

  it('returns null rather than a truncated slice when the close tag is missing', () => {
    expect(between('<gloss>unterminated', 'gloss')).toBeNull();
  });

  it('advances past attributes when scanning, so nothing is skipped or re-read', () => {
    const xml = '<g>a</g><g x="1">b</g><g>c</g><g y="2" z="3">d</g>';
    expect(allBetween(xml, 'g')).toEqual(['a', 'b', 'c', 'd']);
    expect(allElements(xml, 'g').map((element) => element.attributes)).toEqual([
      '',
      'x="1"',
      '',
      'y="2" z="3"',
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * The bug, in the shape JMdict actually writes it
 * ------------------------------------------------------------------ */

/** One JMdict entry with a typed gloss beside a plain one — 石, abbreviated. */
const ENTRY_WITH_TYPED_GLOSS = `<JMdict>
<entry>
<ent_seq>1382450</ent_seq>
<k_ele><keb>石</keb><ke_pri>news1</ke_pri><ke_pri>nf05</ke_pri></k_ele>
<r_ele><reb>こく</reb><re_pri>news1</re_pri><re_pri>nf05</re_pri></r_ele>
<sense>
<pos>&n;</pos>
<gloss>koku</gloss>
<gloss g_type="expl">traditional unit of volume, approx. 180.4 litres</gloss>
</sense>
</entry>
</JMdict>`;

/** An entry whose every gloss is typed: the old parser dropped it entirely. */
const ENTRY_WITH_ONLY_TYPED_GLOSSES = `<JMdict>
<entry>
<ent_seq>9999999</ent_seq>
<k_ele><keb>試験</keb><ke_pri>ichi1</ke_pri></k_ele>
<r_ele><reb>しけん</reb></r_ele>
<sense><pos>&n;</pos><gloss g_type="lit">a literal rendering only</gloss></sense>
</entry>
</JMdict>`;

describe('parseJMdict keeps the glosses upstream actually wrote', () => {
  it('ships a typed gloss alongside the plain one it sits beside', () => {
    const [entry] = parseJMdict(ENTRY_WITH_TYPED_GLOSS);
    expect(entry?.headword).toBe('石');
    expect(entry?.senses).toEqual(['koku', 'traditional unit of volume, approx. 180.4 litres']);
  });

  it('keeps an entry whose only glosses are typed, instead of dropping it', () => {
    // This is the 25-entry class. Losing it changed the corpus size, which is
    // why the old manifest could not agree with the file it read.
    const entries = parseJMdict(ENTRY_WITH_ONLY_TYPED_GLOSSES);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.senses).toEqual(['a literal rendering only']);
  });

  it('still drops a non-English gloss, reading the attribute rather than the text', () => {
    // The old guard tested the element's *body* for `xml:lang`, where an
    // attribute can never appear — dead code that would have waved every French
    // gloss through the moment the pipeline was pointed at the multilingual
    // JMdict. It now reads the attributes, which is the only place that string
    // lives.
    const xml = `<JMdict><entry>
<ent_seq>1000001</ent_seq>
<k_ele><keb>猫</keb></k_ele><r_ele><reb>ねこ</reb></r_ele>
<sense><gloss>cat</gloss><gloss xml:lang="fre">chat</gloss></sense>
</entry></JMdict>`;
    expect(parseJMdict(xml)[0]?.senses).toEqual(['cat']);
  });

  it('does not mistake a language-tagged gloss for an English one by its type', () => {
    const xml = `<JMdict><entry>
<ent_seq>1000002</ent_seq>
<k_ele><keb>犬</keb></k_ele><r_ele><reb>いぬ</reb></r_ele>
<sense><gloss xml:lang="ger" g_type="expl">Erklaerung</gloss><gloss>dog</gloss></sense>
</entry></JMdict>`;
    expect(parseJMdict(xml)[0]?.senses).toEqual(['dog']);
  });

  it('expands the DTD entities that spell the part-of-speech vocabulary', () => {
    const xml = `<!DOCTYPE JMdict [<!ENTITY n "noun (common) (futsuumeishi)">]>
<JMdict><entry>
<ent_seq>1000003</ent_seq>
<k_ele><keb>本</keb></k_ele><r_ele><reb>ほん</reb></r_ele>
<sense><pos>&n;</pos><gloss>book</gloss></sense>
</entry></JMdict>`;
    expect(parseJMdict(xml)[0]?.partOfSpeech).toEqual(['noun (common) (futsuumeishi)']);
  });
});

describe('parseKanjidic2 reads the attribute-typed elements it depends on', () => {
  const KANJI = `<kanjidic2><character>
<literal>一</literal>
<codepoint><cp_value cp_type="ucs">4e00</cp_value></codepoint>
<misc><grade>1</grade><stroke_count>1</stroke_count><freq>2</freq><jlpt>4</jlpt></misc>
<reading_meaning><rmgroup>
<reading r_type="pinyin">yi1</reading>
<reading r_type="ja_on">イチ</reading>
<reading r_type="ja_kun">ひと-</reading>
<meaning>one</meaning>
<meaning m_lang="fr">un</meaning>
</rmgroup></reading_meaning>
</character></kanjidic2>`;

  it('takes only the Japanese readings and only the English meanings', () => {
    const record = parseKanjidic2(KANJI).get('一');
    expect(record?.onReadings).toEqual(['イチ']);
    expect(record?.kunReadings).toEqual(['ひと-']);
    expect(record?.meanings).toEqual(['one']);
  });

  it('reads the numeric fields that sit inside attribute-carrying parents', () => {
    const record = parseKanjidic2(KANJI).get('一');
    expect(record?.strokeCount).toBe(1);
    expect(record?.grade).toBe(1);
    expect(record?.frequency).toBe(2);
    expect(record?.jlpt).toBe(4);
  });
});
