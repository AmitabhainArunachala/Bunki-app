import {createNode} from '../player/presentation.mjs';

/** Presentation only. The host opens this panel after Reveal. Nothing here grades,
 * writes a review, infers mastery, or changes a scheduler's state. */
const COPY = Object.freeze({
  en: {
    title: 'Inside this word', characters: n => `${n} ${n === 1 ? 'character' : 'characters'}`,
    choose: 'Choose a character to explore', inspect: glyph => `Explore ${glyph}`,
    selected: glyph => `${glyph} selected`, details: glyph => `Details for ${glyph}`,
    meaning: 'Character meaning', readings: 'Listed readings', strokes: 'Strokes',
    parts: 'Visible components', componentNote: 'Components supplied with this card. They are not a historical explanation.',
    unavailable: 'Character meanings and readings are not available here yet.',
    noKanji: 'This word contains no kanji.', family: 'Sound family',
    soundHint: 'Sound clue', familyNote: 'A sound clue helps you make connections. Learn the reading of each word separately.',
    contrasts: 'Tell similar forms apart', memory: 'Memory cue',
    invented: 'Invented mnemonic', learner: 'Your memory cue',
    mnemonicNote: 'A memory aid, not the historical origin of the character.',
    related: n => `Words in your library${n ? ` · ${n}` : ''}`,
    relatedShown: (shown, total) => `Words in your library · ${shown} of ${total}`,
    relatedAction: term => `Open ${term} in your library`,
    collocations: 'Useful combinations', sources: 'Sources',
    evidence: 'What your record shows', introduced: 'Words introduced', reviewed: 'Words reviewed',
    encountered: 'Characters encountered', evidenceCriterion: 'Success means a self-rating of Good or Easy. Reading, meaning and handwriting have not been tested separately here.',
    windows: 'First attempts in each elapsed-time window', window: 'Window', successful: 'Successful / checked',
    checked: 'Checked / eligible', missing: 'Missing', nextDay: 'Next day', week: 'One week',
    nextDayRange: '24–48 hours', weekRange: '7–9 days', unmeasured: 'Not measured',
    awaiting: (nextDay, week) => `Not yet at their checkpoint: ${nextDay} next-day targets; ${week} one-week targets.`,
    maintained: 'These are maintained-recall checks; normal reviews may have happened between them. A missing check is not a demonstrated failure or success.',
    exposure: 'An introduction or encounter is not proof that a word or character has been mastered.',
    hold: 'Keep the current load', unsupported: 'More evidence is needed',
    unavailableEvidence: 'A supported learning record is needed before these counts and delayed results can be measured.',
    holdReason: 'A higher daily load needs enough delayed results and a trustworthy record of the total study workload.',
    limitation: 'Some required evidence is unavailable. Keep the current load while those gaps are resolved.',
    whyHold: 'Why the load stays here', whyUnavailable: 'Why results are unavailable', measurementLimits: 'How to read these results',
    dueNow: 'Vocabulary tasks due', overdue: 'Over a day overdue', pending: 'Pending reviews omitted',
    openWindows: (nextDay, week) => `Checkpoints still open: ${nextDay} next-day targets; ${week} one-week targets. Results enter the table after their window closes.`,
  },
  ja: {
    title: 'この言葉の漢字', characters: n => `${n}字`,
    choose: '詳しく見る漢字を選ぶ', inspect: glyph => `「${glyph}」を詳しく見る`,
    selected: glyph => `「${glyph}」を選びました`, details: glyph => `「${glyph}」の情報`,
    meaning: '字義', readings: '収録されている読み', strokes: '画数',
    parts: '形を作る部品', componentNote: 'このカードに収録された部品です。漢字の歴史的な成り立ちを示すものではありません。',
    unavailable: 'この漢字の字義や読みの情報はまだありません。',
    noKanji: 'この言葉には漢字がありません。', family: '音でつながる漢字',
    soundHint: '読みの手がかり', familyNote: '音のつながりは読みの手がかりになります。それぞれの言葉の読みは、言葉ごとに覚えましょう。',
    contrasts: '似た形を見分ける', memory: '覚える手がかり',
    invented: '学習用に作った覚え方', learner: '自分の覚え方',
    mnemonicNote: '記憶のための手がかりであり、漢字の歴史的な成り立ちではありません。',
    related: n => `ライブラリにある言葉${n ? ` · ${n}語` : ''}`,
    relatedShown: (shown, total) => `ライブラリにある言葉 · ${total}語中${shown}語`,
    relatedAction: term => `ライブラリで「${term}」を開く`,
    collocations: 'よく使う組み合わせ', sources: '出典',
    evidence: '学習記録から分かること', introduced: '導入した語', reviewed: '復習した語',
    encountered: '出会った漢字', evidenceCriterion: 'ここでの成功は「正解」または「簡単」という自己評価です。読み・意味・手書きの力を別々に確かめた結果ではありません。',
    windows: '導入からの経過時間ごとの最初の回答', window: '確認時期', successful: '成功数／回答数',
    checked: '回答数／対象数', missing: '未確認', nextDay: '翌日', week: '1週間後',
    nextDayRange: '24〜48時間後', weekRange: '7〜9日後', unmeasured: '未測定',
    awaiting: (nextDay, week) => `確認時期を待っている語：翌日 ${nextDay}語、1週間後 ${week}語。`,
    maintained: '通常の復習を挟んだ記憶の維持を見ています。未確認の語は、成功とも失敗とも判定していません。',
    exposure: '導入したことや出会ったことだけでは、その語や漢字を習得した証拠にはなりません。',
    hold: '今の学習量を維持する', unsupported: '判断に必要な記録がまだ足りません',
    unavailableEvidence: 'この集計に対応した学習記録が必要です。件数や時間を置いた確認結果は、まだ測定できません。',
    holdReason: '1日の学習量を増やすには、時間を置いた確認結果と、復習を含む学習負担の記録が必要です。',
    limitation: '判断に必要な情報の一部が確認できません。情報がそろうまでは、今の学習量を維持しましょう。',
    whyHold: '学習量を維持する理由', whyUnavailable: '結果を確認できない理由', measurementLimits: 'この結果の見方',
    dueNow: '復習時期の語彙課題', overdue: '1日以上過ぎた課題', pending: '集計外の未同期回答',
    openWindows: (nextDay, week) => `確認期間中の語：翌日 ${nextDay}語、1週間後 ${week}語。確認期間が終わると表に反映されます。`,
  },
});

const language = locale => ['en', 'both'].includes(locale) ? locale : 'ja';
const interfaceCopy = locale => locale !== 'both' ? COPY[locale] : Object.fromEntries(Object.keys(COPY.ja).map(key => [key,
  typeof COPY.ja[key] === 'function' ? (...args) => `${COPY.ja[key](...args)} · ${COPY.en[key](...args)}` : `${COPY.ja[key]} · ${COPY.en[key]}`]));
const text = value => typeof value === 'string' ? value : '';
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
const localized = (value, locale) => typeof value === 'string' ? value
  : locale === 'both' ? [...new Set([text(value?.ja), text(value?.en)].filter(Boolean))].join('\n')
  : text(value?.[locale] || value?.en || value?.ja);
const contentLanguage = value => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value) ? 'ja' : 'en';
const safeSourceURL = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};
let panelSerial = 0;

function isolateExploration(node) {
  // Text selection and horizontal gestures within an explanation must not turn
  // into a swipe grade on the containing study card. Keep native control actions.
  for (const event of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
    node.addEventListener(event, value => value.stopPropagation());
  }
  // Escape still reaches the host's dictionary/dialog close handler.
  node.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
  node.addEventListener('keyup', event => { if (event.key !== 'Escape') event.stopPropagation(); });
}

function renderSources(h, sources, copy) {
  if (!Array.isArray(sources) || !sources.length) return null;
  const list = h('ul', {class: 'kanji-depth__sources'});
  const seen = new Set();
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const title = text(source.title), href = safeSourceURL(source.url);
    if (!title || seen.has(`${title}\n${href}`)) continue;
    seen.add(`${title}\n${href}`);
    list.append(h('li', {}, href
      ? h('a', {href, target: '_blank', rel: 'noopener noreferrer'}, title)
      : h('span', {}, title)));
  }
  return list.childNodes.length ? h('div', {class: 'kanji-depth__provenance'},
    h('p', {class: 'kanji-depth__eyebrow'}, copy.sources), list) : null;
}

/** `model` comes from buildKanjiModel. `renderCollocation` preserves the host's
 * exact token spans and dictionary lookup rather than guessing them here. */
export function renderKanjiPanel(document, model = {}, {
  locale = 'ja', onRelated = () => {}, renderCollocation = null,
} = {}) {
  const lang = language(locale), copy = interfaceCopy(lang);
  const h = (tag, attrs, ...children) => createNode(document, tag, attrs, ...children);
  const root = h('section', {class: 'kanji-depth kanji-panel', 'data-kanji-depth': '', 'data-vocabulary-source': '',
    'data-kanji-interface-language': lang, lang: lang === 'both' ? 'ja' : lang, 'aria-label': copy.title});
  isolateExploration(root);
  const glyphs = Array.isArray(model?.glyphs)
    ? model.glyphs.filter(item => item && typeof item.glyph === 'string' && item.glyph.trim()) : [];
  const term = text(model?.term), reading = text(model?.reading);
  const description = localized({ja: model?.definitionJa, en: model?.meaning}, lang);
  const header = h('div', {class: 'kanji-depth__intro'},
    h('div', {class: 'kanji-depth__title-row'}, h('h3', {}, copy.title),
      h('span', {class: 'kanji-depth__count'}, copy.characters(glyphs.length))),
    term ? h('p', {class: 'kanji-depth__word', lang: 'ja'}, h('strong', {}, term),
      reading ? h('span', {class: 'kanji-depth__word-reading'}, reading) : null) : null,
    description ? h('p', {class: 'kanji-depth__word-meaning', lang: contentLanguage(description)}, description) : null);
  root.append(header);

  const fold = (label, ...children) => h('details', {class: 'kanji-depth__fold'},
    h('summary', {}, label), h('div', {class: 'kanji-depth__fold-body'}, ...children));
  if (!glyphs.length) root.append(h('p', {class: 'kanji-depth__note'}, copy.noKanji));
  else {
    const id = `kanji-depth-${++panelSerial}`;
    const selector = h('div', {class: 'kanji-depth__selector', role: 'group', 'aria-label': copy.choose});
    const body = h('div', {class: 'kanji-depth__character', id: `${id}-body`, role: 'region'});
    const status = h('p', {class: 'kanji-depth__sr-only', role: 'status', 'aria-live': 'polite'});
    const buttons = [];
    let selected = 0;

    function character(record) {
      const meanings = strings(record.meanings), readings = strings(record.readings), components = strings(record.components);
      const provenance = localized(record.sourceLabel, lang);
      const facts = h('div', {class: 'kanji-depth__facts'});
      if (meanings.length) facts.append(h('div', {}, h('p', {class: 'kanji-depth__eyebrow'}, copy.meaning),
        h('p', {class: 'kanji-depth__character-meaning', lang: contentLanguage(meanings.join(' '))}, meanings.join(' · '))));
      const descriptionList = h('dl', {class: 'kanji-depth__attributes'});
      if (readings.length) descriptionList.append(h('div', {}, h('dt', {}, copy.readings), h('dd', {lang: 'ja'}, readings.join(' · '))));
      if (Number.isSafeInteger(record.strokeCount) && record.strokeCount > 0) {
        descriptionList.append(h('div', {}, h('dt', {}, copy.strokes), h('dd', {}, String(record.strokeCount))));
      }
      if (descriptionList.childNodes.length) facts.append(descriptionList);
      if (provenance && (meanings.length || readings.length || descriptionList.childNodes.length)) {
        facts.append(h('p', {class: 'kanji-depth__source-label'}, provenance));
      }
      if (!meanings.length && !readings.length && !components.length && !descriptionList.childNodes.length) {
        facts.append(h('p', {class: 'kanji-depth__note'}, copy.unavailable));
      }
      const node = h('div', {'data-kanji-character': record.glyph}, facts);

      if (components.length) node.append(h('div', {class: 'kanji-depth__components'},
        h('h4', {}, copy.parts), h('ul', {class: 'kanji-depth__component-list', lang: 'ja'},
          ...components.map(value => h('li', {}, value))),
        h('p', {class: 'kanji-depth__note'}, copy.componentNote)));

      const family = record.family;
      const members = Array.isArray(family?.members) ? family.members.filter(member => member && text(member.glyph)) : [];
      if (family && typeof family === 'object' && (text(family.phonetic) || text(family.readingHint) || localized(family.explanation, lang) || members.length)) {
        const explanation = localized(family.explanation, lang);
        const familyBody = h('div', {class: 'kanji-depth__family', 'data-kanji-family': text(family.id)},
          h('p', {class: 'kanji-depth__family-clue'},
            h('span', {class: 'kanji-depth__family-glyph', lang: 'ja'}, text(family.phonetic)),
            h('span', {}, h('span', {class: 'kanji-depth__eyebrow'}, copy.soundHint),
              h('strong', {lang: 'ja'}, text(family.readingHint)))),
          explanation ? h('p', {class: 'kanji-depth__explanation'}, explanation) : null);
        if (members.length) familyBody.append(h('ul', {class: 'kanji-depth__family-members'}, ...members.map(member =>
          h('li', {}, h('span', {class: 'kanji-depth__member-glyph', lang: 'ja'}, member.glyph),
            h('div', {}, h('p', {class: 'kanji-depth__example-word', lang: 'ja'}, text(member.term)),
              member.reading ? h('p', {class: 'kanji-depth__reading', lang: 'ja'}, text(member.reading)) : null,
              member.meaning ? h('p', {class: 'kanji-depth__note', lang: contentLanguage(text(member.meaning))}, text(member.meaning)) : null)))));
        familyBody.append(h('p', {class: 'kanji-depth__note'}, copy.familyNote));
        const sources = renderSources(h, family.sources, copy);
        if (sources) familyBody.append(sources);
        node.append(fold(copy.family, familyBody));
      }

      const contrasts = Array.isArray(record.contrasts)
        ? record.contrasts.filter(value => value && text(value.glyph) && localized(value.distinction, lang)) : [];
      if (contrasts.length) node.append(fold(copy.contrasts,
        ...contrasts.map(value => h('div', {class: 'kanji-depth__contrast'},
          h('p', {class: 'kanji-depth__contrast-pair', lang: 'ja'},
            h('span', {}, record.glyph), h('span', {'aria-hidden': 'true', class: 'kanji-depth__versus'}, '／'), h('span', {}, value.glyph)),
          h('p', {class: 'kanji-depth__explanation'}, localized(value.distinction, lang)),
          value.term ? h('p', {class: 'kanji-depth__example-word', lang: 'ja'}, text(value.term),
            value.reading ? h('span', {class: 'kanji-depth__word-reading'}, text(value.reading)) : null) : null))));

      const mnemonic = record.mnemonic, cue = localized(mnemonic?.text, lang);
      if (cue && ['invented', 'learner'].includes(mnemonic?.kind)) node.append(fold(copy.memory,
        h('p', {class: 'kanji-depth__eyebrow'}, copy[mnemonic.kind]),
        h('p', {class: 'kanji-depth__mnemonic'}, cue), h('p', {class: 'kanji-depth__note'}, copy.mnemonicNote)));

      const related = Array.isArray(record.related) ? record.related.filter(value => value && text(value.term)) : [];
      const relatedLabel = Number.isSafeInteger(record.relatedTotal) && record.relatedTotal > related.length
        ? copy.relatedShown(related.length, record.relatedTotal) : copy.related(related.length);
      if (related.length) node.append(fold(relatedLabel, h('ul', {class: 'kanji-depth__related'},
        ...related.map(value => {
          const meaning = localized({ja: value.definitionJa, en: value.meaning}, lang);
          return h('li', {}, h('button', {
            type: 'button', class: 'kanji-depth__related-word', 'data-kanji-related': value.term,
            'aria-label': copy.relatedAction(value.term), disabled: !value.entry,
            onclick: () => { if (value.entry && typeof onRelated === 'function') onRelated(value.entry); },
          }, h('span', {class: 'kanji-depth__example-word', lang: 'ja'}, value.term),
          value.reading ? h('span', {class: 'kanji-depth__reading', lang: 'ja'}, text(value.reading)) : null,
          meaning ? h('span', {class: 'kanji-depth__related-meaning', lang: contentLanguage(meaning)}, meaning) : null));
        }))));
      return node;
    }

    function select(index, {focus = false, announce = true} = {}) {
      selected = index;
      buttons.forEach((button, position) => button.setAttribute('aria-pressed', String(position === selected)));
      body.setAttribute('aria-label', copy.details(glyphs[selected].glyph));
      body.replaceChildren(character(glyphs[selected]));
      if (announce) status.textContent = copy.selected(glyphs[selected].glyph);
      if (focus) buttons[selected].focus();
    }
    glyphs.forEach((record, index) => {
      const button = h('button', {
        type: 'button', class: 'kanji-depth__glyph',
        'data-kanji-select': record.glyph, 'aria-label': copy.inspect(record.glyph),
        'aria-pressed': 'false', 'aria-controls': `${id}-body`,
        onclick: () => select(index),
      }, h('span', {lang: 'ja'}, record.glyph));
      button.addEventListener('keydown', event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % glyphs.length
          : event.key === 'ArrowLeft' ? (index + glyphs.length - 1) % glyphs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? glyphs.length - 1 : null;
        if (next !== null) { event.preventDefault(); select(next, {focus: true}); }
      });
      buttons.push(button); selector.append(button);
    });
    root.append(selector, body, status);
    select(0, {announce: false});
  }

  const collocations = strings(model?.collocations);
  if (collocations.length) root.append(h('section', {class: 'kanji-depth__collocation-section'},
    h('h4', {}, copy.collocations), h('ul', {class: 'kanji-depth__collocations'},
      ...collocations.map(value => h('li', {'data-collocation': value},
        typeof renderCollocation === 'function' ? renderCollocation(value) : h('span', {lang: 'ja'}, value))))));
  if (model?.learningReport) root.append(renderKanjiCapacity(document, model.learningReport, {locale: lang}));
  return root;
}

/** Optional read-only report. A collapsed view may also be placed in Record by
 * the host; it never interprets ordinary grades as independently tested skills. */
export function renderKanjiCapacity(document, report, {locale = 'ja'} = {}) {
  if (!report || typeof report !== 'object') return null;
  const lang = language(locale), copy = interfaceCopy(lang);
  const h = (tag, attrs, ...children) => createNode(document, tag, attrs, ...children);
  const supported = ['ready', 'partial'].includes(report.status);
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  const count = value => supported && validCount(value) ? String(value) : '—';
  const ratio = (numerator, denominator) => supported && validCount(numerator) && validCount(denominator) && denominator > 0
    ? `${numerator} / ${denominator}` : copy.unmeasured;
  const root = h('details', {class: 'kanji-capacity', 'data-kanji-capacity': '', 'data-vocabulary-source': '',
    'data-kanji-interface-language': lang, 'data-capacity-status': supported ? report.status : 'unsupported',
    lang: lang === 'both' ? 'ja' : lang}, h('summary', {}, copy.evidence));
  isolateExploration(root);
  const body = h('div', {class: 'kanji-capacity__body'});
  const counts = report.counts || {};
  body.append(h('dl', {class: 'kanji-capacity__counts'},
    ...[['wordIntroductions', copy.introduced], ['vocabularyWordsReviewed', copy.reviewed], ['glyphsExposed', copy.encountered]].map(([key, label]) =>
      h('div', {}, h('dt', {}, label), h('dd', {'data-capacity-count': key}, count(counts[key]))))),
    h('p', {class: 'kanji-capacity__note'}, copy.exposure),
    h('p', {class: 'kanji-capacity__criterion'}, copy.evidenceCriterion));
  const table = h('table', {class: 'kanji-capacity__windows'}, h('caption', {}, copy.windows),
    h('thead', {}, h('tr', {}, ...[copy.window, copy.successful, copy.checked, copy.missing].map(label => h('th', {scope: 'col'}, label)))));
  const rows = h('tbody', {});
  for (const [key, label, range] of [['nextDay', copy.nextDay, copy.nextDayRange], ['week', copy.week, copy.weekRange]]) {
    const window = report.windows?.[key] || {};
    rows.append(h('tr', {'data-capacity-window': key}, h('th', {scope: 'row'}, label, h('span', {}, range)),
      h('td', {'data-capacity-success': key}, ratio(window.successful, window.attempted)),
      h('td', {'data-capacity-coverage': key}, ratio(window.attempted, window.matured)),
      h('td', {'data-capacity-missing': key}, count(window.missing))));
  }
  table.append(rows); body.append(table, h('p', {class: 'kanji-capacity__note'}, copy.maintained));
  const nextAwaiting = report.windows?.nextDay?.awaiting, weekAwaiting = report.windows?.week?.awaiting;
  if (supported && validCount(nextAwaiting) && validCount(weekAwaiting) && (nextAwaiting || weekAwaiting)) {
    body.append(h('p', {class: 'kanji-capacity__note'}, copy.awaiting(nextAwaiting, weekAwaiting)));
  }
  const nextOpen = report.windows?.nextDay?.open, weekOpen = report.windows?.week?.open;
  if (supported && validCount(nextOpen) && validCount(weekOpen) && (nextOpen || weekOpen)) {
    body.append(h('p', {class: 'kanji-capacity__note'}, copy.openWindows(nextOpen, weekOpen)));
  }
  if (supported) {
    const workload = [
      ['dueNow', report.backlog?.dueNow, copy.dueNow],
      ['overdueByOneDay', report.backlog?.overdueByOneDay, copy.overdue],
      ['pendingReviews', report.exclusions?.pendingReviews, copy.pending],
    ].filter(([, value]) => validCount(value));
    if (workload.length) body.append(h('dl', {class: 'kanji-capacity__workload'},
      ...workload.map(([key, value, label]) => h('div', {}, h('dt', {}, label), h('dd', {'data-capacity-workload': key}, count(value))))));
  }
  const recommendation = h('div', {class: 'kanji-capacity__recommendation'},
    h('strong', {}, supported && report.recommendation?.action === 'hold' ? copy.hold : copy.unsupported),
    h('p', {}, supported ? copy.holdReason : copy.unavailableEvidence));
  // The only supported action in this report version is hold. Do not turn an
  // unexpected future action into an automatic pace change or an invented goal.
  const reasons = [...new Set(strings(report.recommendation?.reasons))];
  if (reasons.length) recommendation.append(h('details', {class: 'kanji-capacity__explanation'}, h('summary', {}, supported ? copy.whyHold : copy.whyUnavailable),
    h('ul', {}, ...reasons.map(code => h('li', {'data-capacity-reason': code}, capacityExplanation(code, lang, copy.limitation))))));
  body.append(recommendation);
  const limitations = Array.isArray(report.limitations) ? [...new Set(report.limitations.map(value => text(value?.code)).filter(Boolean))] : [];
  if (limitations.length) body.append(h('details', {class: 'kanji-capacity__explanation'}, h('summary', {}, copy.measurementLimits),
    h('ul', {}, ...limitations.map(code => h('li', {'data-capacity-limitation': code}, capacityExplanation(code, lang, copy.limitation))))));
  root.append(body); return root;
}

const CAPACITY_EXPLANATIONS = Object.freeze({
  'unsupported-projection-or-clock': {
    en: 'The current learning history and observation time could not be verified.',
    ja: '現在の学習記録と集計時刻を確認できません。',
  },
  'self-reported-composite-review': {
    en: 'These are your vocabulary grades. They do not independently test pronunciation, meaning, handwriting or kanji mastery.',
    ja: '語彙課題への自己評価です。発音・意味・手書き・漢字の習得を別々に測ったものではありません。',
  },
  'unfamiliarity-baseline-unavailable': {
    en: 'There was no pretest establishing which words and characters you already knew.',
    ja: 'その語や漢字を学習前に知っていたかどうかを確認する事前テストがありません。',
  },
  'maintained-recall': {
    en: 'Normal reviews may occur between checks. The result measures maintained recall, not a week without practice.',
    ja: '確認の間に通常の復習を挟むことがあります。復習なしで1週間覚えていたかではなく、復習による記憶の維持を見ています。',
  },
  'total-study-time-unavailable': {
    en: 'Thinking time before Reveal is only part of studying. Total learning, reading and review time is not recorded.',
    ja: '答えを見る前に考えた時間は、学習時間の一部です。学習・読解・復習を含む全体の時間は記録されていません。',
  },
  'missing-is-unobserved': {
    en: 'Missing checks are unobserved, not failures. Next-day windows close after 48 hours; one-week windows close after 9 days.',
    ja: '確認できなかった語は失敗とは判定しません。翌日の確認期間は48時間後、1週間後の確認期間は9日後に終わります。',
  },
  'practice-exposure-not-attributable': {
    en: 'The available record cannot attribute every practice or assisted exposure to an individual word.',
    ja: '現在の記録だけでは、練習や補助を使った学習のすべてを語ごとに確認できません。',
  },
  'task-limit-is-not-word-load': {
    en: 'Daily limits count tasks across modules. They are not a record of a 20 → 30 → 40 distinct-word experiment.',
    ja: '1日の上限は各モジュールの課題数です。異なる語を20→30→40語と増やす実験の記録ではありません。',
  },
  'imported-history-not-new-cohort': {
    en: 'Imported study records contribute to review and exposure counts, but do not establish newly introduced words.',
    ja: '取り込んだ学習記録は復習数や出会った漢字の数には含めますが、新しく導入した語の開始点にはしません。',
  },
  'excluded-introductions': {
    en: 'Some first introductions were undone or unconfirmed, so their learning start cannot be established.',
    ja: '最初の導入が取り消された語や、未確認の語は、学習の開始点を確定できません。',
  },
  'canonical-history-incomplete': {
    en: 'Some history is pending or cannot yet be applied. Only confirmed reviews enter the delayed results.',
    ja: '同期待ちや未反映の記録があります。時間を置いた確認結果には、確定した回答だけを含めます。',
  },
  'ambiguous-review-history': {
    en: 'Conflicting or ambiguous review times leave the affected outcomes unknown; later successes cannot replace them.',
    ja: '回答時刻が矛盾したり曖昧だったりする場合は、その結果を未確認とします。後の成功で置き換えることはありません。',
  },
  'signalled-first-attempt': {
    en: 'A first Good or Easy answer marked uncertain or looked up is not verified recall. Again and Hard remain weak outcomes; a later success does not replace the first answer.',
    ja: '自信がない・調べたという印のある最初の「正解」「簡単」は、確かな想起として扱いません。「もう一度」「難しい」は弱い結果のまま残し、後の成功で最初の回答を置き換えません。',
  },
  'incomplete-glyph-exposure': {
    en: 'Some reviewed tasks have no unambiguous written word available, so their character exposure cannot be counted.',
    ja: '一部の復習課題では語の表記を確定できないため、出会った漢字の数に含められません。',
  },
  'insufficient-mature-cohorts': {
    en: 'Delayed results from more introduction days are needed before considering a higher load.',
    ja: '学習量を増やす判断には、複数の日に導入した語について、時間を置いた確認結果が必要です。',
  },
  'insufficient-delayed-sample': {
    en: 'More eligible words need to complete their delayed observation windows.',
    ja: '時間を置いた確認期間を終えた語の数がまだ足りません。',
  },
  'next-day-evidence-unavailable': {
    en: 'There is not enough next-day evidence to assess the proposed increase.',
    ja: '学習量を増やす判断に必要な、翌日の確認結果がまだありません。',
  },
  'next-day-recall-below-threshold': {
    en: 'Next-day confident recall is below the experiment’s target.',
    ja: '翌日の確かな想起が、実験で設定した目標に届いていません。',
  },
  'week-evidence-unavailable': {
    en: 'There is not enough one-week evidence to assess the proposed increase.',
    ja: '学習量を増やす判断に必要な、1週間後の確認結果がまだありません。',
  },
  'week-recall-below-threshold': {
    en: 'One-week maintained recall is below the experiment’s target.',
    ja: '1週間後の記憶の維持が、実験で設定した目標に届いていません。',
  },
  'incomplete-delayed-coverage': {
    en: 'Some eligible words have no first attempt in their delayed windows.',
    ja: '確認期間中の最初の回答が記録されていない対象語があります。',
  },
  'backlog-trend-unavailable': {
    en: 'Today’s due count is available, but its change over time is not recorded. Review workload may still be growing.',
    ja: '現在の復習件数は確認できますが、時間とともにどう変化したかは記録されていません。復習負担が増え続けている可能性があります。',
  },
});

function capacityExplanation(code, locale, fallback) {
  return CAPACITY_EXPLANATIONS[code] ? localized(CAPACITY_EXPLANATIONS[code], locale) : fallback;
}
