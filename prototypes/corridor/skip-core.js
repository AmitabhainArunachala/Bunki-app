/* Pure SKIP lookup; no DOM, network, storage, learner-state, or corpus mutation.
 * Data/attribution live separately in data/share_alike/skip.json.
 * Rules: http://www.edrdg.org/wwwjdic/SKIP.html
 */
/* global module:readonly -- Optional CommonJS export, guarded for browsers. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BunkiSkipCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const patterns = Object.freeze([
    Object.freeze({ id: 1, label: 'Left–right', second: 'Left strokes', third: 'Right strokes' }),
    Object.freeze({ id: 2, label: 'Top–bottom', second: 'Top strokes', third: 'Bottom strokes' }),
    Object.freeze({ id: 3, label: 'Enclosure', second: 'Enclosure strokes', third: 'Inside strokes' }),
    Object.freeze({ id: 4, label: 'Solid', second: 'Total strokes', third: 'Solid subtype' }),
  ]);
  const solidSubtypes = Object.freeze([
    Object.freeze({ id: 1, label: 'Top line' }),
    Object.freeze({ id: 2, label: 'Bottom line' }),
    Object.freeze({ id: 3, label: 'Through line' }),
    Object.freeze({ id: 4, label: 'Other' }),
  ]);
  const misclassifications = Object.freeze({
    posn: 'Different division or position',
    stroke_count: 'Different stroke count',
    stroke_and_posn: 'Different stroke count and position',
    stroke_diff: 'Differing opinions on stroke counts',
  });
  const rules = Object.freeze({
    source: 'http://www.edrdg.org/wwwjdic/SKIP.html',
    division: 'Divide at the first natural division; do not break strokes or indivisible units.',
    solid: 'For pattern 4, the second number is TOTAL strokes; the third is subtype 1–4.',
    precedence: 'When several solid subtypes match, use the lowest numbered matching subtype.',
    radical: 'The optional classical radical filter is independent of the three-part SKIP code.',
  });

  function normalize(raw) {
    // NFKC is deliberately not applied to ordinary Japanese text: compatibility
    // ideographs may be distinct lookup targets. Fold fullwidth ASCII only.
    return String(raw == null ? '' : raw)
      .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63]/g, '-')
      .replace(/\u3000/g, ' ')
      .trim();
  }

  function partsError(parts) {
    if (!Array.isArray(parts) || parts.length !== 3) return 'Use three SKIP fields.';
    if (parts.some((n) => n !== null && (!Number.isSafeInteger(n) || n < 1))) {
      return 'Stroke counts and pattern numbers must be positive whole numbers.';
    }
    if (parts[0] !== null && parts[0] > 4) return 'Choose a pattern from 1 to 4.';
    if (parts[0] === 4 && parts[2] !== null && parts[2] > 4) {
      return 'For solid pattern 4, the third field is subtype 1–4, not strokes.';
    }
    return null;
  }

  function parseQuery(raw) {
    const text = normalize(raw);
    const explicit = /^skip\s*:/i.test(text);
    const body = explicit ? text.replace(/^skip\s*:\s*/i, '') : text;
    // A number alone belongs to ordinary dictionary search. A numeric-looking
    // hyphen expression is SKIP intent even if malformed (1-3-x, 5-2-3).
    const bare = /^[\d*?]/.test(body) && body.includes('-');
    const negative = /^-\s*\d+(?:\s*-\s*[\d*?]*)+/.test(body);
    if (!explicit && !bare && !negative) {
      return { kind: 'text', raw, normalized: text };
    }
    const invalid = (error) => ({ kind: 'invalid', raw, normalized: text, error });
    if (!/^[\d*?\s-]*$/.test(body)) {
      return invalid('Use numbers, hyphens, and * or ? for unknown fields.');
    }
    const fields = body.split('-').map((s) => s.trim());
    if (fields.length > 3) return invalid('SKIP has three fields; a radical is a separate filter.');
    if (negative) return invalid('SKIP numbers cannot be negative.');
    while (fields.length < 3) fields.push('');
    if (fields.some((s) => !/^(?:\d+|[?*])?$/.test(s))) {
      return invalid('Each field must be a whole number or one wildcard.');
    }
    const parts = fields.map((s) => /^\d+$/.test(s) ? Number(s) : null);
    const error = partsError(parts);
    if (error) return invalid(error);
    return {
      kind: 'skip',
      raw,
      normalized: parts.map((n) => n === null ? '*' : String(n)).join('-'),
      parts,
      complete: parts.every((n) => n !== null),
    };
  }

  function codeParts(code) {
    if (typeof code !== 'string' || !/^[1-4]-[1-9]\d*-[1-9]\d*$/.test(code)) return null;
    const parts = code.split('-').map(Number);
    return partsError(parts) ? null : parts;
  }

  function matchesCode(code, parts) {
    const candidate = codeParts(code);
    // Source anomalies stay in the data, never silently become valid codes.
    return candidate !== null && parts.every((n, i) => n === null || candidate[i] === n);
  }

  function search(data, query, options) {
    const parsed = query && typeof query === 'object' ? query : parseQuery(query);
    if (parsed.kind !== 'skip' || partsError(parsed.parts)) return [];
    const entries = Array.isArray(data) ? data : data && data.entries;
    if (!Array.isArray(entries)) return [];
    const opts = options || {};
    const filtered = opts.radical !== undefined && opts.radical !== null && opts.radical !== '';
    const radical = filtered ? Number(opts.radical) : null;
    if (filtered && (!Number.isInteger(radical) || radical < 1 || radical > 214 ||
      (typeof opts.radical !== 'number' && typeof opts.radical !== 'string'))) return [];
    const canonical = [];
    const alternates = [];
    const canonicalSeen = new Set();
    const alternateSeen = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry.literal !== 'string' || !entry.literal) continue;
      if (filtered && entry.radical !== radical) continue;
      const code = (Array.isArray(entry.canonical) ? entry.canonical : [])
        .find((c) => matchesCode(c, parsed.parts));
      if (code !== undefined) {
        if (!canonicalSeen.has(entry.literal)) {
          canonicalSeen.add(entry.literal);
          canonical.push({ ...entry, matchedCode: code, matchType: 'canonical', misclass: null });
        }
      } else if (opts.includeAlternates === true && !alternateSeen.has(entry.literal)) {
        const alt = (Array.isArray(entry.alternatives) ? entry.alternatives : [])
          .find((a) => a && Object.prototype.hasOwnProperty.call(misclassifications, a.misclass) &&
            matchesCode(a.code, parsed.parts));
        if (alt) {
          alternateSeen.add(entry.literal);
          alternates.push({ ...entry, matchedCode: alt.code, matchType: 'alternate', misclass: alt.misclass });
        }
      }
    }
    // A later canonical record wins even if an earlier duplicate matched an
    // alternate. Source order is deterministic within each group.
    return canonical.concat(alternates.filter((entry) => !canonicalSeen.has(entry.literal)));
  }

  return Object.freeze({
    parseQuery, search, match: search, patterns, solidSubtypes, misclassifications, rules,
  });
});
