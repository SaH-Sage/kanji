// ── Utility ───────────────────────────────────────────────────

/** Read a CSS custom property from :root. */
const cssVar = name =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Katakana → hiragana, for comparing an on'yomi reading (katakana)
 * against a word's kana (hiragana) — see buildInfoButton's coverage
 * check. Katakana and hiragana share the same code-point ordering,
 * offset by 0x60 (U+30A1–U+30F6 vs U+3041–U+3096). */
const kataToHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Rough measure of how much room a kanji's own fields need ("info
 * density") — the largest single-field count among the ones that each
 * render as their own list of chips/readings (on, onAdd, kun, kunAdd,
 * name, components, variants). MAX across fields, not a sum: a kanji
 * with a lot of kun'yomi and nothing else unusual needs exactly as
 * much room as one with that many readings spread across several
 * fields, since no two of these ever share the same column/row space
 * at once. Deliberately not stored anywhere — it's fully derived from
 * data already on the record, so computing it fresh here means it can
 * never silently go stale the way a cached copy would the moment
 * someone edits e.g. kunAdd without remembering to recompute it. */
function getKanjiInfoWeight(k) {
  const fields = ['on', 'onAdd', 'kun', 'kunAdd', 'name', 'components', 'variants'];
  return Math.max(...fields.map(f => (k[f] || []).length));
}


// ── HTML builders ─────────────────────────────────────────────

/**
 * Build the variants span for r-top.
 * Text inside parentheses (e.g. "(漢字)") becomes a button that opens a
 * popup comparing the variant glyph against `char` (the card's own
 * kanji) — helps distinguish e.g. a Kangxi radical form from the
 * everyday kanji it stands in for. Each side is labeled with what it
 * actually is, from info.json's variantTypes table (`info`, optional —
 * falls back to generic wording if it didn't load). The button and its
 * popup are siblings (not nested), so any future hyperlink inside the
 * popup stays a real, clickable link. Opening/closing is handled by
 * initPopups() via event delegation, and toggling also works
 * on touch (tap), not just mouse hover.
 */
function buildVariants(variants, char, info) {
  if (!variants.length) return '';
  const variantTypes = (info && info.variantTypes) || {};
  const standardLabel = variantTypes.standard || 'standard kanji';
  const fallbackLabel = variantTypes.fallback || 'variant form';
  const glyphTypes    = variantTypes.types || {};

  const inner = variants
    .map(v => v.replace(/\s*\(([^)]+)\)/, (_, label) => {
      const glyph = v.replace(/\s*\([^)]+\)/, '').trim();
      const glyphLabel = glyphTypes[glyph] || fallbackLabel;
      return ` <span class="popupWrap variantWrap">
        <button type="button" class="popupTrigger variantTag" aria-expanded="false">(${label})</button>
        <span class="popupContent variantTooltip">
          <span class="variantCol">
            <span class="variantGlyphBig">${glyph}</span>
            <span class="variantSubLabel">${glyphLabel}</span>
          </span>
          <span class="variantVs">↔</span>
          <span class="variantCol">
            <span class="variantGlyphBig">${char}</span>
            <span class="variantSubLabel">${standardLabel}</span>
          </span>
        </span>
      </span>`;
    }))
    .join(' ');
  return `<span class="variantsKanji">${inner}</span>`;
}

/**
 * Build the bottom-left info button + popup: the kanji's full word
 * list from words.json (not just the 2-3 featured on the card face),
 * each with its pitch diagram, full meaning, part of speech, JLPT
 * level, a link to search it on kanshudo, and a marker on any
 * selfAdded entry (hand-added, not yet verified against kanshudo).
 * Returns '' if there's no word data for this kanji — no point in an
 * empty popup.
 */
function buildInfoButton(char, words, moraInfo, kanji) {
  const rawEntries = (words && words[char]) || [];
  if (!rawEntries.length) return '';

  // No way to measure a word's actual rendered height in pure
  // string-building (no DOM yet to lay it out in) — this is a proxy:
  // total text length across word/kana/meaning/pos/jlpt roughly
  // tracks how much a row wraps onto multiple lines. Used for two
  // things below: sorting (same-size entries end up next to each
  // other, which is what lets flex-wrap actually pack multiple rows
  // per line well — a short row stranded next to a long one leaves a
  // gap instead of sharing) and per-row flex-grow (so that on a line
  // it does share, a bigger-content row still claims more of the
  // leftover space — see .infoWordRow in style.css for why that's a
  // separate mechanism from the basis used for the wrap decision).
  const weight = e => e.word.length + e.kana.length
    + (e.meaning || []).join('').length + (e.pos || '').length + (e.jlpt || '').length
    + (e.pronunciationSplit || []).reduce((n, v) => n + v.kana.length + 6, 0);
  const entries = [...rawEntries].sort((a, b) => weight(a) - weight(b));

  const rows = entries.map(e => {
    const rt = PitchAccent.buildPitchRT(e.kana, e.pitch, moraInfo);
    const meaning = (e.meaning || []).join('; ');
    const query = encodeURIComponent(`${e.word}:${e.kana}`);
    const link = `https://www.kanshudo.com/searchq?q=${query}`;
    const grow = Math.max(1, Math.round(weight(e) / 15));
    // Only words with more than one accepted pronunciation carry this
    // (e.g. 本 read as ほん 90% of the time, ぽん 10%) — most entries
    // have none, so this is empty for them. The variant matching the
    // card's own kana is picked out so it reads as "this is the one
    // shown above, and here's how common it is".
    const pronunciation = e.pronunciationSplit
      ? `<div class="infoPronunciation">${e.pronunciationSplit.map(v =>
          `<span${v.kana === e.kana ? ' class="infoPronunciationActive"' : ''}>${v.kana} ${v.pct}%</span>`
        ).join('<span class="infoPronunciationSep">・</span>')}</div>`
      : '';
    return `<div class="infoWordRow" style="flex-grow: ${grow}">
      <button type="button" class="wordKanji exploreWord" data-explore-word="${e.word}" data-explore-kana="${e.kana}"><ruby>${e.word}<rt>${rt}</rt></ruby></button>
      ${pronunciation}
      <div class="infoWordMeta">
        <span class="infoWordMeaning">${meaning}</span>
        ${e.pos ? `<span>${e.pos}</span>` : ''}
        ${e.jlpt ? `<span class="infoJlpt">${e.jlpt}</span>` : ''}
        ${e.selfAdded ? `<span class="infoSelfAdded" title="Hand-added, not yet verified against kanshudo">unverified</span>` : ''}
        <a class="infoWordLink" href="${link}" target="_blank" rel="noopener noreferrer">kanshudo ↗</a>
      </div>
    </div>`;
  }).join('');

  const kanjiLink = `https://www.kanshudo.com/kanji/${encodeURIComponent(char)}`;
  const kanjiLinkJapandict = `https://www.japandict.com/kanji/${encodeURIComponent(char)}`;
  const kanjiLinkWanikani = `https://www.wanikani.com/kanji/${encodeURIComponent(char)}`;

  // All of this kanji's pronunciations, one row at the top of the
  // popup: its own on'yomi/kun'yomi (+ okurigana-marked -Add variants
  // — the same strings kanji.json's card face already shows) plus any
  // "extra" reading found on a single-character word entry (e.g. 本
  // itself, not a compound like 蔵人) whose pronunciationSplit isn't
  // part of that list — e.g. ぽん for 本, whose card only lists ホン.
  // Extras render in the warn color; one tagged with a "cause" (see
  // words.json) also becomes a popup trigger (hover, or click to lock
  // like every other popup here) naming and explaining whichever
  // reading-variation phenomenon (半濁音化, 連濁, counter suffix — see
  // moraInfo.readingPhenomena) produced it.
  const phenomenaTypes = (moraInfo && moraInfo.readingPhenomena && moraInfo.readingPhenomena.types) || {};
  const ownReadings = [...(kanji && kanji.on || []), ...(kanji && kanji.onAdd || []), ...(kanji && kanji.kun || []), ...(kanji && kanji.kunAdd || [])];
  const knownReadings = new Set(ownReadings.map(r => kataToHira(r.replace(/^-|-$/g, ''))));
  const extraReadings = [];
  rawEntries.forEach(e => {
    if (e.word !== char || !e.pronunciationSplit) return;
    e.pronunciationSplit.forEach(v => {
      if (knownReadings.has(v.kana) || extraReadings.some(x => x.kana === v.kana)) return;
      extraReadings.push({ kana: v.kana, causes: v.cause || [] });
    });
  });
  // kun/kunAdd readings that have a kunMeaning/kunAddMeaning get the
  // full (untruncated) meaning here as a real <ruby>/<rt> annotation —
  // unlike the card face's own ruby overlay (buildCard's kun/kunAdd),
  // which is force-nowrap + absolutely positioned so it can never push
  // on the tight density layout, there's no such constraint in this
  // popup, so the meaning renders in normal flow at full length. Per
  // the user's own note: alternating over/under per entry (rather than
  // every one stacked the same side) gives each one room to breathe
  // without colliding with its neighbors' meaning text; centering over
  // the reading is just the browser's native ruby default.
  let meaningfulReadingCount = 0;
  const buildReadingSpan = (r, meaning, extraClass) => {
    if (!meaning) return `<span${extraClass ? ` class="${extraClass}"` : ''}>${r}</span>`;
    const under = meaningfulReadingCount % 2 === 1;
    meaningfulReadingCount++;
    const cls = ['infoReadingMeaning', extraClass, under ? 'rubyUnder' : ''].filter(Boolean).join(' ');
    return `<span class="${cls}"><ruby>${r}<rt>${meaning}</rt></ruby></span>`;
  };
  const ownReadingSpans = [
    ...(kanji && kanji.on || []).map(r => buildReadingSpan(r, null, '')),
    ...(kanji && kanji.onAdd || []).map(r => buildReadingSpan(r, null, '')),
    ...(kanji && kanji.kun || []).map((r, i) => buildReadingSpan(r, (kanji.kunMeaning || [])[i], '')),
    ...(kanji && kanji.kunAdd || []).map((r, i) => buildReadingSpan(r, (kanji.kunAddMeaning || [])[i], '')),
  ].join('');
  const extraReadingSpans = extraReadings.map(ex => {
    const defs = ex.causes.map(c => phenomenaTypes[c]).filter(Boolean);
    if (!defs.length) return `<span class="infoReadingExtra">${ex.kana}</span>`;
    const note = defs.map(d => `<div>${d.note}</div>`).join('');
    return `<span class="popupWrap phenomenonWrap">
      <button type="button" class="popupTrigger infoReadingExtra" aria-expanded="false">${ex.kana}</button>
      <div class="popupContent phenomenonPopup">${note}</div>
    </span>`;
  }).join('');

  // Which reading-variation phenomena are represented ANYWHERE among
  // this kanji's words (any word, not just a single-character one —
  // unlike the reading list above, which only explains one specific
  // reading like ぽん). All 4 categories (counter suffix + the three
  // sound-change phenomena — 半濁音化, 連濁, 音便) are always listed, on
  // every kanji, so this reads as a fixed reference key rather than a
  // sometimes-there-sometimes-not row; ones this kanji's words don't
  // actually demonstrate are just grayed out rather than omitted.
  // Each is still its own popup trigger either way, with its own
  // definition-only popup — grayed-out ones stay genuinely useful to
  // hover, just visually deemphasized as "not relevant here".
  const causesPresent = new Set();
  rawEntries.forEach(e => (e.pronunciationSplit || []).forEach(v => (v.cause || []).forEach(c => causesPresent.add(c))));
  const categorySpans = Object.keys(phenomenaTypes).map(c => {
    const type = phenomenaTypes[c];
    const active = causesPresent.has(c);
    return `<span class="popupWrap phenomenonWrap">
      <button type="button" class="popupTrigger infoCategory${active ? '' : ' infoCategoryInactive'}" aria-expanded="false">${type.label}</button>
      <div class="popupContent phenomenonPopup"><div>${type.note}</div></div>
    </span>`;
  }).join('');

  const phenomenaRow = `<div class="infoPhenomena">
    <div class="infoReadings">${ownReadingSpans}${extraReadingSpans}</div>
    <div class="infoCategoryList">${categorySpans}</div>
  </div>`;

  return `<span class="popupWrap infoWrap">
    <button type="button" class="popupTrigger infoBtn" aria-expanded="false" aria-label="Word list and info for this kanji">i</button>
    <div class="popupContent infoPopup">
      ${phenomenaRow}
      <div class="infoWordList">${rows}</div>
      <div class="infoFooter">
        <a class="infoFooterLink" href="${kanjiLink}" target="_blank" rel="noopener noreferrer">${char} on kanshudo ↗</a>
        <a class="infoFooterLink" href="${kanjiLinkJapandict}" target="_blank" rel="noopener noreferrer">${char} on japandict ↗</a>
        <a class="infoFooterLink" href="${kanjiLinkWanikani}" target="_blank" rel="noopener noreferrer">${char} on wanikani ↗</a>
      </div>
    </div>
  </span>`;
}

/**
 * Build the components span for r-top.
 */
function buildComponents(components) {
  if (!components.length) return '';
  return `<span class="componentKanji">${components.map(c => `<button type="button" class="componentLink" data-component="${c}" title="Explore this component">${c}</button>`).join(' ')}</span>`;
}

/**
 * Build the full card HTML string for a kanji entry — real or custom
 * (see the "Editable kanji data" section below for what makes a kanji
 * "custom"). The card's DOM id is derived from `k.char`, never read
 * from or written onto `k` itself — a custom kanji's record is exported
 * verbatim as kanji.json-shaped data, so it must never pick up an `id`
 * field.
 *
 * `words` is a char -> word-entries map — data/words.json for a real
 * kanji, or `{ [char]: customWords[char] }` for a custom one (see
 * rerenderCard/init). `moraInfo` is the parsed data/info.json — both
 * optional; pitch lines are skipped and variant-popup labels fall back
 * to generic wording if either is missing.
 *
 * `kanjiOverrides`/`wordOverrides` (both optional) are appState's
 * merged edit layers — see "Editable kanji data" below for their shape.
 * Every field a user can click to edit carries data-char plus either
 * data-field (a whole array/string field: variants, components, on,
 * onAdd, kun, kunAdd, name, meaning) or data-idx (one frequent-word
 * slot), so the generic handlers down there know what they're looking
 * at without re-deriving it from rendered text.
 */
function buildCard(k, words, moraInfo, kanjiOverrides, wordOverrides) {
  const char = k.char;
  const kOv  = (kanjiOverrides && kanjiOverrides[char]) || {};
  // Shallow merge — every overridable field replaces wholesale (see
  // initFieldEditing, which always writes a field's full new array/
  // string), never patches partially.
  const mergedK = { ...k, ...kOv };

  // Word-slot overrides are full words.json-shaped entries (word, kana,
  // meaning[], pos, jlpt, pitch, selfAdded) — folded into a copy of
  // this char's word list (replacing a same-word entry in place, or
  // appended) so buildInfoButton's popup word list and the card face's
  // own frequent words both see one consistent, already-merged picture.
  const wOvForChar = (wordOverrides && wordOverrides[char]) || {};
  const mergedWordEntries = [...((words && words[char]) || [])];
  Object.keys(wOvForChar).forEach(idxStr => {
    const ov = wOvForChar[idxStr];
    const pos = mergedWordEntries.findIndex(e => e.word === ov.word);
    if (pos >= 0) mergedWordEntries[pos] = ov; else mergedWordEntries.push(ov);
  });
  const mergedWords = { ...words, [char]: mergedWordEntries };

  const variantsHtml   = buildVariants(mergedK.variants, char, moraInfo);
  // Extensive components (the nav's "Extensive components" toggle) show
  // a finer, source-verbatim radical breakdown (e.g. kanshudo's own
  // multi-part split) in place of the compact, hand-picked one — but
  // only for a kanji that actually has componentsExtensive data yet;
  // one that doesn't just keeps showing compact regardless of the
  // toggle, rather than going blank.
  const showExtensive = appState.settings.extensiveComponents
    && mergedK.componentsExtensive && mergedK.componentsExtensive.length > 0;
  const componentsField = showExtensive ? 'componentsExtensive' : 'components';
  const componentsHtml  = buildComponents(showExtensive ? mergedK.componentsExtensive : mergedK.components);
  const infoButton     = buildInfoButton(char, mergedWords, moraInfo, mergedK);

  // Each frequentWord[i] is either a number (index into the word list
  // above, pulling word/kana/pitch from it) or a literal string — kana/
  // pitch for a literal still come from a same-text entry if one exists.
  // frequentWordMeaning[i] is the card face's own short gloss, separate
  // from a words.json entry's own (often longer/multi-sense) meaning.
  // A word-slot override replaces this whole slot — word, kana, pitch,
  // and meaning together — rather than just the meaning text.
  const displayWords = mergedK.frequentWord.map((w, i) => {
    const slotOv = wOvForChar[i];
    if (slotOv) {
      return {
        word: slotOv.word, kana: slotOv.kana, pitch: slotOv.pitch,
        meaning: (slotOv.meaning || []).join('; '),
        pos: slotOv.pos, jlpt: slotOv.jlpt, overridden: true,
      };
    }
    const entry = typeof w === 'number' ? mergedWordEntries[w] : mergedWordEntries.find(e => e.word === w);
    // frequentWordMeaning[i] is the curated short gloss real kanji.json
    // entries have — but a custom kanji's word slot never gets one (its
    // popup form only ever writes to customWords, not this array), so
    // fall back to the word entry's own words.json-shaped meaning[]
    // rather than showing blank forever.
    const meaning = mergedK.frequentWordMeaning[i] || (entry && (entry.meaning || []).join('; ')) || '';
    return {
      word: typeof w === 'number' ? (entry ? entry.word : '') : w,
      kana: entry ? entry.kana : '',
      pitch: entry ? entry.pitch : null,
      meaning,
      pos: null, jlpt: null, overridden: false,
    };
  });

  // The .wordKanji chip (r-top) has no popup of its own — clicking it
  // forwards to its .wordMeaning counterpart's trigger (below, r-bot)
  // instead of duplicating one; see initWordSlotEditing.
  const wordKanji = displayWords
    .map(({ word, kana, pitch }, i) => {
      const rt = PitchAccent.buildPitchRT(kana, pitch, moraInfo);
      return `<span class="wordKanji" role="button" tabindex="0" data-explore-word="${word}" data-explore-kana="${kana}" data-char="${char}" data-idx="${i}"><ruby>${word}<rt>${rt}</rt></ruby></span>`;
    })
    .join('');

  // Each word slot is a popup like every other one on this page: the
  // .wordMeaning button is the trigger, the form is the content. Save
  // writes a full words.json-shaped entry (initWordSlotEditing ->
  // saveWordSlot); Cancel just discards. .overridden (this slot came
  // from wordOverrides/customWords, not frequentWordMeaning[i] itself)
  // gets a CSS marker so an edited card doesn't look identical to an
  // unedited one at a glance.
  const wordMeaning = displayWords
    .map(({ meaning, overridden, word, kana, pitch, pos, jlpt }, i) => `<span class="popupWrap wordSlotWrap">
      <button type="button" class="popupTrigger wordMeaning${overridden ? ' overridden' : ''}" data-char="${char}" data-idx="${i}" aria-expanded="false" title="Click to edit">${meaning}</button>
      <div class="popupContent wordSlotPopup">
        <label>word <input class="wsWord" value="${word || ''}"></label>
        <label>kana <input class="wsKana" value="${kana || ''}"></label>
        <label>pitch <input class="wsPitch" type="number" min="0" value="${pitch != null ? pitch : ''}"></label>
        <label>pos <input class="wsPos" value="${pos || ''}"></label>
        <label>JLPT <input class="wsJlpt" value="${jlpt || ''}"></label>
        <label>meaning <input class="wsMeaning" value="${meaning || ''}"></label>
        <div class="wordSlotActions">
          <button type="button" class="wsSave">Save</button>
          <button type="button" class="wsCancel">Cancel</button>
        </div>
      </div>
    </span>`)
    .join('');

  // Adding a word slot is custom-kanji-only for now — real kanji keep
  // their curated 3 words as-is; every existing slot is still editable.
  const addWordBtn = isCustomKanji(char) && displayWords.length < 3
    ? `<button type="button" class="addWordBtn" data-char="${char}" title="Add a frequent word">+ word</button>`
    : '';

  const on     = mergedK.on.map(r => `<span>${r}</span>`).join('');
  const onAdd  = mergedK.onAdd.map(r => `<span class="add">${r}</span>`).join('');
  // kunMeaning/kunAddMeaning are parallel-indexed to kun/kunAdd (see
  // KUN_MEANING_FIELDS' comment below) — a reading with a
  // meaning gets it as furigana-style rt, same <ruby>/<rt> structure as
  // the frequent-word readings' own pitch furigana (buildPitchRT
  // above), just plain text instead of a pitch diagram. data-reading
  // carries the reading alone, since a span's .textContent would
  // otherwise pick up the rt's meaning text too, corrupting every
  // character-count/row-matching use of it elsewhere
  // (densityColumnsOfElement, applyRowOrder, capReadingOverflow) —
  // those all prefer dataset.reading when present. A reading with no
  // meaning yet (not every kun/kunAdd has one) falls back to a plain
  // span, same as every other field.
  const kunAdd = mergedK.kunAdd.map((r, i) => {
    const meaning = (mergedK.kunAddMeaning || [])[i];
    return meaning
      ? `<span class="add" data-reading="${r}"><ruby>${r}<rt>${meaning}</rt></ruby></span>`
      : `<span class="add">${r}</span>`;
  }).join('');
  const kun = mergedK.kun.map((r, i) => {
    const meaning = (mergedK.kunMeaning || [])[i];
    return meaning
      ? `<span data-reading="${r}"><ruby>${r}<rt>${meaning}</rt></ruby></span>`
      : `<span>${r}</span>`;
  }).join('');
  const name   = mergedK.name.map(r => `<span class="add">${r}</span>`).join('');
  // A blank "+" placeholder wherever a field is currently empty —
  // custom-kanji-only. A real kanji's empty field (no onAdd readings,
  // no name readings, ...) is just empty, not missing data inviting a
  // fill-in; only a brand-new custom kanji (every field starts empty)
  // gets the click target.
  const ph = extra => isCustomKanji(char) ? `<span class="fieldPlaceholder${extra ? ' ' + extra : ''}">+</span>` : '';

  return `
    <div class="kc" id="kc-${char}" data-kanji="${char}">
      <div class="r-top">
        <span class="fieldWrap" data-char="${char}" data-field="variants" title="Click to edit">${variantsHtml || ph()}</span>
        <span class="fieldWrap" data-char="${char}" data-field="${componentsField}" title="Click to edit">${componentsHtml || ph()}</span>
        ${wordKanji}${addWordBtn}
      </div>
      <div class="kc-body"><div class="ctr">
        <div class="kc-left">
          <div class="l1 on" data-char="${char}" data-field="on" title="Click to edit">${on || ph()}</div>
          <div class="l2 on" data-char="${char}" data-field="onAdd" title="Click to edit">${onAdd || ph('add')}</div>
          <div class="l3 kun" data-char="${char}" data-field="kunAdd" title="Click to edit">${kunAdd || ph('add')}</div>
        </div>
        <svg class="kanji" viewBox="0 0 109 109" role="button" tabindex="0" aria-label="Explore ${char}" data-explore-char="${char}"></svg>
        <button class="animBtn" disabled>Animate</button>
        <span class="editPositionGroup">
          <button type="button" class="editKanjiBtn" data-char="${char}" title="Edit all fields for this kanji" aria-label="Edit all fields for this kanji">e</button>
          <span class="positionQuickPopup" data-char="${char}">
            <label>pos <input type="number" step="1" class="positionQuickInput" value="${mergedK.position}" title="Grid position — Enter or click away to apply. Every other kanji between the old and new spot shifts to make room."></label>
          </span>
        </span>
        <button type="button" class="placeholderBtn" title="Placeholder for Kanji Test" aria-label="Placeholder for Kanji Test">t</button>
        ${infoButton}
        <div class="kc-right">
          <div class="r1 kun" data-char="${char}" data-field="kun" title="Click to edit">${kun || ph()}</div>
          <div class="r2 name" data-char="${char}" data-field="name" title="Click to edit">${name || ph('add')}</div>
        </div>
      </div></div>
      <div class="r-bot">
        <span class="meaningKanji" data-char="${char}" data-field="meaning" title="Click to edit">${mergedK.meaning || ph()}</span>${wordMeaning}
      </div>
    </div>`;
}

/**
 * Build the "legend" card — same markup/classes as a real card (so it
 * inherits the exact same layout and column colors), but every field
 * that's normally per-kanji data is replaced by a label naming what
 * that area actually is. Fully generic rather than borrowing a real
 * kanji's real data: 漢字 ("kanji [character]") stands in for the
 * stroke-order square itself — a real, working stroke animation, same
 * as every other card, just for two characters sharing one square
 * instead of one filling it (see loadKanjiMulti and initCard's
 * char.length branch) — and the info popup describes in prose what it
 * would show rather than populating it with any specific kanji's real
 * (or fabricated) word list. Needs no kanji/words/moraInfo data at
 * all, unlike buildCard() — the empty <svg class="kanji"> here is
 * populated the same way as any real card's, by initCard() after
 * insertion (called on this card too, back in init()).
 */
function buildLegendCard() {
  return `
    <div class="kc legendCard" id="kc-legend" data-kanji="漢字">
      <span class="legendTitle">key</span>
      <div class="r-top">
        <span class="legendLabel">
          <span>versions</span>
          <span class="componentKanji">components</span>
        </span>
        <span class="legendLabel">· words with pitch accent</span>
      </div>
      <div class="kc-body"><div class="ctr">
        <div class="kc-left">
          <div class="l1 on"><span class="legendLabel">on'yomi</span></div>
          <div class="l2 on"><span class="legendLabel">other<br/>on'yomi</span></div>
          <div class="l3 kun"><span class="legendLabel">kun<br/>okurigana</span></div>
        </div>
        <svg class="kanji" viewBox="0 0 109 109"></svg>
        <button class="animBtn" disabled>Animate</button>
        <span class="popupWrap infoWrap">
          <button type="button" class="popupTrigger infoBtn" aria-expanded="false" aria-label="Example info button">i</button>
          <div class="popupContent infoPopup">
            <span class="legendLabel legendInfoText">
              Opens this kanji's full word list — each word's reading
              (with pitch accent), meaning, part of speech, JLPT level,
              and any alternate pronunciations — plus a link to look it
              up on kanshudo.
            </span>
          </div>
        </span>
        <div class="kc-right">
          <div class="r1 kun"><span class="legendLabel">kun'yomi</span></div>
          <div class="r2 name"><span class="legendLabel">name<br/>reading</span></div>
        </div>
      </div></div>
      <div class="r-bot">
        <span class="legendLabel meaningKanji">kanji meaning</span><span class="legendLabel wordMeaning">word meaning</span>
      </div>
    </div>`;
}

/**
 * Build the empty "counters" box — a non-kanji entry appended after
 * every real card (see initCards' own insertion order). SheetExplorer's
 * setCounter() (js/explorer.js) fills this in at init. Shares the grid's
 * own flex-wrap flow with every real card (no forced row-break) — it
 * lands on whichever row has room, wrapping to a fresh one on its own if
 * it doesn't fit, same as a (very wide) card would. .counterBox's own
 * margin-left: auto (style.css) is what pushes it flush to that row's
 * right edge rather than tucking in right after the last card.
 */
function buildCountersPlaceholder() {
  return `<section class="counterBox" id="kc-counters" aria-label="Number and counter explorer"></section>`;
}

/**
 * .counterBox's height is meant to match a real card's own rendered
 * height exactly, but that height isn't one clean CSS value anywhere —
 * it's the sum of .kc's own padding plus .r-top/.kc-body/.r-bot's
 * individual heights, each resolved against a DIFFERENT font-size
 * (.r-top/.r-bot's own 2em is relative to --font-top/--font-bot, not
 * .kc's inherited one), so a hand-derived calc() drifted off by
 * several px from the real thing on the first attempt. Measuring a
 * real card directly sidesteps that entirely, and stays correct
 * automatically through future tuning of any of those pieces — same
 * approach syncNavMenuSpacing (above) already uses for the same
 * reason. ResizeObserver, not a one-time read, since the real card's
 * own height can shift with zoom/font-metric changes the counters box
 * should track too. rerenderCard replaces cards outright (e.g. the
 * "Extensive components" toggle rebuilds all of them), and a detached
 * card reports a 0 height — so when the observed card is gone, switch
 * to whichever card is first now instead of copying that 0.
 */
function syncCountersBoxHeight() {
  const box = document.getElementById('kc-counters');
  const findReference = () => document.querySelector('#kanji-grid .kc:not(.legendCard)');
  let referenceCard = findReference();
  if (!box || !referenceCard) return;
  box.style.height = `${referenceCard.getBoundingClientRect().height}px`;
  const ro = new ResizeObserver(entries => {
    if (!referenceCard.isConnected) {
      ro.unobserve(referenceCard);
      referenceCard = findReference();
      if (referenceCard) ro.observe(referenceCard); // its own initial callback sets the height
      return;
    }
    const entry = entries.find(e => e.target === referenceCard);
    if (!entry) return;
    const height = entry.borderBoxSize
      ? entry.borderBoxSize[0].blockSize
      : referenceCard.getBoundingClientRect().height;
    box.style.height = `${height}px`;
  });
  ro.observe(referenceCard);
}


// ── SVG helpers ───────────────────────────────────────────────

/** Create an SVG element with optional attributes and text content. */
function svgEl(tag, attrs, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text !== undefined) el.textContent = text;
  return el;
}

/**
 * Clear the SVG and show a plain-text fallback character.
 * Called before each KanjiVG fetch so the card never looks empty.
 * Font-size shrinks for a multi-character fallback (only the legend
 * card's 漢字 placeholder needs this) — the single-char size (82,
 * roughly the full 109-unit box) would badly overflow two characters
 * side by side otherwise.
 */
function resetSVG(char, svg, btn, st) {
  if (st.cancel) { st.cancel(); st.cancel = null; }
  if (st.timer)  { clearTimeout(st.timer); st.timer = null; }
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  st.paths = [];
  st.lens  = [];
  btn.disabled = true;
  st.fb = svgEl('text', {
    x: '54.5', y: '54.5',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-size': [...char].length > 1 ? 42 : 82,
    class: 'kanjiFallback', // color comes from CSS (svg.kanji text.kanjiFallback,
      // style.css) — same reasoning as appendStrokes' own paths/numbers:
      // a literal fill here would never update on a later theme switch
    'font-family': 'serif',
  }, char);
  st.fb.style.userSelect = 'none';
  svg.appendChild(st.fb);
}

/**
 * Fetch one character's KanjiVG stroke-order SVG source as text.
 * Tries the locally vendored copy first (data/strokes/<code>.svg —
 * fetched from KanjiVG's GitHub repo and committed into this project;
 * see README's attribution note) and only falls back to the live
 * GitHub fetch if that 404s, e.g. for a kanji added to kanji.json
 * since the local set was last updated. Throws if both fail.
 */
async function fetchStrokeSVG(code) {
  const local = await fetch(`data/strokes/${code}.svg`).catch(() => null);
  if (local && local.ok) return local.text();
  const remote = await fetch(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${code}.svg`);
  if (!remote.ok) throw new Error(`HTTP ${remote.status}`);
  return remote.text();
}

/**
 * Parse one character's KanjiVG SVG source and append its strokes
 * (as animatable <path>s) plus their stroke-order numbers into
 * `target` (the card's own <svg>, or — for loadKanjiMulti — a <g>
 * representing that one character's slice of a shared square),
 * pushing each path onto st.paths so animate() can play them in
 * order. Split out of loadKanji so loadKanjiMulti can reuse it
 * per-character instead of duplicating this loop.
 */
function appendStrokes(svgSource, target, st) {
  const doc = new DOMParser().parseFromString(svgSource, 'image/svg+xml');
  doc.querySelectorAll('path').forEach((p, i) => {
    const d  = p.getAttribute('d');
    // stroke/fill come from CSS (svg.kanji path/text, style.css), not
    // set here — a literal color baked in now would never update when
    // the theme changes later, since nothing re-creates these elements
    // on a theme switch (unlike cssVar(), a live CSS value keeps
    // tracking --color-kanji-ink/--color-num for free).
    const el = svgEl('path', {
      d,
      fill: 'none',
      'stroke-width': '3.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    target.appendChild(el);
    st.paths.push(el);

    // Stroke-order number, placed at the path's starting point
    const m = d.match(/M\s*([\d.]+)[,\s]+([\d.]+)/);
    if (m) {
      const t = svgEl('text', {
        x: +m[1], y: +m[2] - 3,
        'font-size': '7',
        'font-weight': 'bold',
        'text-anchor': 'middle',
      }, i + 1);
      t.style.userSelect = 'none';
      target.appendChild(t);
    }
  });
}

/**
 * Common tail of a successful load, shared by loadKanji and
 * loadKanjiMulti (which populate st.paths differently but finish the
 * same way): drop the fallback text, measure each stroke's real
 * length now that it's painted (getTotalLength() needs that to be
 * accurate for the stroke-dasharray/dashoffset animation), and only
 * then enable Animate.
 */
function finishLoad(st, btn) {
  if (st.fb) { st.fb.remove(); st.fb = null; }
  requestAnimationFrame(() => {
    st.lens = st.paths.map(p => {
      try { return p.getTotalLength(); } catch { return 300; }
    });
    btn.disabled = false;
  });
}

/**
 * Fetch the KanjiVG stroke-order SVG for `char` and populate the card's SVG.
 * Falls back to the plain-text character if the fetch fails.
 */
async function loadKanji(char, svg, btn, st) {
  resetSVG(char, svg, btn, st);
  const code = char.codePointAt(0).toString(16).padStart(5, '0');
  try {
    const svgSource = await fetchStrokeSVG(code);
    appendStrokes(svgSource, svg, st);
    finishLoad(st, btn);
  } catch (e) {
    // Fallback character remains; button stays disabled
    console.warn(`Failed to load stroke data for ${char}:`, e);
  }
}

/**
 * Same idea as loadKanji, but for a short string of 2+ characters
 * sharing one stroke-order square — used only by the legend card's
 * 漢字 placeholder, never a real (always single-character) card. Each
 * character is scaled down uniformly (not stretched, so its own
 * proportions stay intact) and translated into place via a wrapping
 * <g> — its own stroke-order numbering restarts at 1 too, same as two
 * separate real diagrams shown side by side — and its strokes land in
 * the same st.paths in character order, so animate() (unchanged)
 * plays straight through both without knowing there were two. Any
 * one character's fetch failing aborts the whole thing and leaves the
 * plain-text fallback, same as loadKanji — no partial-diagram state.
 */
async function loadKanjiMulti(chars, svg, btn, st) {
  resetSVG(chars, svg, btn, st);
  const list = [...chars];
  // scale/spacing are independent knobs, not "divide the box into
  // list.length non-overlapping slices" — that first version read as
  // small and far apart. spacing (center-to-center) deliberately runs
  // narrower than the scaled character's own width (size), so adjacent
  // characters' bounding squares overlap slightly; invisible in
  // practice since a kanji glyph never fills its own nominal square
  // edge-to-edge, and it's what lets them sit closer together while
  // still individually bigger than the old non-overlapping tiling.
  const scale   = 0.62;
  const spacing = 50;
  const size    = scale * 109;
  const yOffset = (109 - size) / 2;
  const startX  = 109 / 2 - spacing * (list.length - 1) / 2;
  try {
    const sources = await Promise.all(
      list.map(c => fetchStrokeSVG(c.codePointAt(0).toString(16).padStart(5, '0')))
    );
    sources.forEach((svgSource, i) => {
      const centerX = startX + i * spacing;
      const g = svgEl('g', { transform: `translate(${centerX - size / 2}, ${yOffset}) scale(${scale})` });
      svg.appendChild(g);
      appendStrokes(svgSource, g, st);
    });
    finishLoad(st, btn);
  } catch (e) {
    // Fallback text remains; button stays disabled
    console.warn(`Failed to load stroke data for ${chars}:`, e);
  }
}


// ── Animation ─────────────────────────────────────────────────

/** Ease-in-out curve (quadratic). */
function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

/**
 * Animate a single SVG path using stroke-dashoffset.
 * Returns a cancel function.
 */
function animatePath(el, length, duration, onDone) {
  el.setAttribute('stroke-dasharray',  length);
  el.setAttribute('stroke-dashoffset', length);
  const start = performance.now();
  let raf;
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    el.setAttribute('stroke-dashoffset', length * (1 - ease(t)));
    if (t < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      el.setAttribute('stroke-dashoffset', 0);
      if (onDone) onDone();
    }
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/**
 * Animate all strokes of a kanji sequentially.
 * Cancels any in-progress animation first.
 */
function animate(st) {
  if (st.cancel) st.cancel();
  if (st.timer)  clearTimeout(st.timer);

  st.paths.forEach((p, i) => {
    p.setAttribute('stroke-dasharray',  st.lens[i] || 300);
    p.setAttribute('stroke-dashoffset', st.lens[i] || 300);
  });

  let idx = 0;
  function next() {
    if (idx >= st.paths.length) return;
    const i = idx++;
    st.cancel = animatePath(st.paths[i], st.lens[i] || 300, 500, () => {
      st.timer = setTimeout(next, 120);
    });
  }
  st.timer = setTimeout(next, 80);
}


// ── Reading overflow (too many readings to fit in 3 columns) ────

/**
 * Cap one reading field (l2/l3/r2 — see capCardReadingOverflow for why
 * l1/r1 are excluded) at `maxColumns` wrapped columns (default 3).
 * Each field wraps into a new column once its own fixed-height box is
 * full (see .l1, .r1's row-gap comment in style.css) — a kanji with
 * enough readings can need a 4th. Rather than let the card keep
 * growing sideways, whatever wouldn't fit is removed and replaced with
 * a single "…" trigger; hovering/clicking it opens a compact,
 * parchment-themed popup (same plumbing as every other popup — see
 * initPopups) listing the readings that got cut.
 * Must run after layout has settled (requestAnimationFrame), and
 * before markR2Columns (below) so its dividers reflect the capped
 * column count, not the original uncapped one.
 */
function capReadingOverflow(container, maxColumns = 3) {
  const items = [...container.querySelectorAll(':scope > span:not(.fieldPlaceholder)')];
  if (items.length < 2) return;

  // How many items share the first column's anchored edge — l1/l2/l3
  // are right-aligned (align-items: flex-end), so same-column items
  // share a right edge, not a left one (which instead shifts with
  // each reading's own text width, e.g. うまれ vs う); r1/r2 are the
  // opposite. Every column but the last is always fully packed before
  // wrapping to a new one, so this is that field's per-column capacity.
  const rightAligned = getComputedStyle(container).alignItems === 'flex-end';
  const edge = el => {
    const r = el.getBoundingClientRect();
    return Math.round(rightAligned ? r.right : r.left);
  };
  const firstEdge = edge(items[0]);
  let itemsPerColumn = 0;
  for (const el of items) {
    if (Math.abs(edge(el) - firstEdge) > 1) break;
    itemsPerColumn++;
  }
  if (!itemsPerColumn) return;
  const numColumns = Math.ceil(items.length / itemsPerColumn);
  if (numColumns <= maxColumns) return;

  // Keep exactly enough real items to fill maxColumns minus the last
  // slot, which the "…" trigger itself occupies.
  const visibleCount = itemsPerColumn * maxColumns - 1;
  const overflowItems = items.slice(visibleCount);
  overflowItems.forEach(el => el.remove());

  // Matches whichever sibling spans are .add-styled (l2/l3/r2's
  // smaller reading font), on the wrap itself as well as the button —
  // style.css gives .readingMoreWrap (and its .add variant) an
  // explicit height matching a normal reading row exactly, since a
  // <button> contributes to a line box's height differently than
  // plain text at the same font-size (the same issue .r-top's own
  // fixed height works around — see its comment in style.css) and
  // would otherwise throw off capReadingOverflow's own per-column
  // item count on every OTHER field, not just this one.
  const addClass = items[0].classList.contains('add') ? ' add' : '';
  const trigger = document.createElement('span');
  trigger.className = 'popupWrap readingMoreWrap' + addClass;
  trigger.innerHTML =
    `<button type="button" class="popupTrigger readingMoreTag${addClass}" aria-expanded="false">…</button>` +
    `<span class="popupContent readingMorePopup">` +
    overflowItems.map(el => `<span>${el.dataset.reading || el.textContent}</span>`).join('') +
    `</span>`;
  container.appendChild(trigger);
}

/** Runs capReadingOverflow on l2/l3/r2 only — NOT l1/r1 (on'yomi/
 * kun'yomi), which stay uncapped regardless of how many columns they
 * need; only the secondary fields (onAdd/kunAdd/name) ever get
 * truncated behind a "…" — then markR2Columns (which needs to see the
 * already-capped r2). Both need layout settled first — call from
 * requestAnimationFrame.
 *
 * `density` (a dense card's own 0/1/2/... value, from
 * computeDensityPreview's `densities` — see its own callers) raises
 * the column cap by exactly that much past the normal 3: a dense card
 * already carries extra margin (.densityQueueR0/R1,
 * .densityUnconditionalR0/R1 — style.css), so it has the literal
 * physical room to show a 4th or 5th column before truncating, instead
 * of applying the same flat cap a tightly-packed density-0 card needs. */
function capCardReadingOverflow(card, density = 0) {
  const maxColumns = 3 + Math.max(0, density);
  card.querySelectorAll('.l2, .l3, .r2').forEach(el => capReadingOverflow(el, maxColumns));
  const r2 = card.querySelector('.r2');
  if (r2) markR2Columns(r2);
}


// ── Collision-avoidance row-swap ────────────────────────────────
// See README "Grid ordering & density" for the full design writeup.
// .kc-left/.kc-right (Side columns, style.css) are position:absolute
// and deliberately overflow past their own card's border, so a card
// with a wide reading can visually collide with its actual left-hand
// neighbor's .kc-right content. This reorders WHICH reading sits at
// which row position — only ever within a field's own LAST physical
// column, exactly like the density computation's own scoping (see
// computeDensityPreview) — so a kanji's longer readings preferentially
// line up against whatever row on its real neighbor has the most
// slack. Pure display reordering: never hides/truncates anything (the
// "…" overflow cap above is untouched), never touches appState/
// kanji.json, and never feeds back into position/density — a
// successful rescue means there was no real conflict to move away
// from in the first place. Uses the SAME sequential/joint choice the
// nav toggle drives for density's own tied-arrangement picks (see
// chooseArrangement) — here it's the only thing that toggle actually
// changes visually, since density itself never differs between them.

const ROW_RESCUE_THRESHOLD_PRIMARY = 6;   // l1 <-> r1
const ROW_RESCUE_THRESHOLD_SECONDARY = 10; // l2 <-> r1-overflow, l3 <-> r2

/** How many kun'yomi readings r1 fits in its own first (baseline)
 * column before wrapping — structural/stable regardless of which
 * specific readings are shown, so measuring the live-rendered field is
 * exactly as accurate as (and much simpler than) modelling the CSS box
 * height by hand. Falls back to `list.length` (i.e. "no overflow")
 * when there's nothing to measure yet. */
function measureR1Capacity(r1El, kunList) {
  if (!r1El) return kunList.length || 1;
  const spans = [...r1El.querySelectorAll(':scope > span:not(.fieldPlaceholder)')];
  if (spans.length < 2) return spans.length || kunList.length || 1;
  const edge = el => Math.round(el.getBoundingClientRect().left);
  const firstEdge = edge(spans[0]);
  let n = 0;
  for (const s of spans) { if (Math.abs(edge(s) - firstEdge) > 1) break; n++; }
  return n || spans.length;
}

/** Re-orders `container`'s reading spans to match `order` (an array of
 * reading strings) — appendChild on an already-attached child MOVES
 * it rather than cloning, so this is a pure in-place DOM reorder, not
 * a rebuild. Matches by text rather than touching the underlying data
 * array, so it's safe to call from a pass that only ever reads
 * appState (via getCurrentFieldValue), never writes it. */
function applyRowOrder(container, order) {
  if (!container || !order.length) return;
  const spans = [...container.querySelectorAll(':scope > span:not(.fieldPlaceholder)')];
  const used = new Set();
  order.forEach(text => {
    const idx = spans.findIndex((s, i) => !used.has(i) && (s.dataset.reading || s.textContent) === text);
    if (idx === -1) return;
    used.add(idx);
    container.appendChild(spans[idx]);
  });
}

/** Computes whichever reordering `chooseArrangement` picks (for the
 * current sequential/joint toggle state) for one field-pair — `mine`
 * paired against `theirs` — but ONLY when there's an actual conflict
 * to resolve: natural order's own combined value has to be at/over
 * `threshold` (6 for the l1/r1 pairing, 10 for l2/l3/r2 — the same
 * density-step boundaries), AND reordering has to be able to bring it
 * back under that threshold. If natural order was already fine, or if
 * even the best possible arrangement still can't get under threshold
 * (like 定/政's kun↔on pairing — optimal is 6, which still isn't under
 * 6), reordering wouldn't change anything either way, so it's skipped
 * and natural order is left untouched — no point straying from it for
 * a purely cosmetic width reduction that doesn't avoid anything.
 * Returns both lists unchanged whenever either side is empty. */
function computePairRescue(mine, theirs, threshold) {
  if (!mine.length || !theirs.length) return { minePerm: mine, theirsPerm: theirs };
  const naturalWidth = maxCombinedForPairing(mine, theirs);
  if (naturalWidth < threshold) return { minePerm: mine, theirsPerm: theirs }; // no conflict at all
  const optimalWidth = bestCombinedMaxOptimal(mine, theirs);
  if (optimalWidth >= threshold) return { minePerm: mine, theirsPerm: theirs }; // reordering can't rescue it anyway
  return chooseArrangement(mine, theirs, optimalWidth, appState.settings.densityFitStrategy);
}

/** The whole-grid pass — checks every card against its actual current
 * left-hand neighbor (real DOM adjacency, same grid row only; a card
 * at the start of a row simply has no left neighbor to rescue against)
 * and applies whichever row-swaps help. Recomputes fresh from
 * appState every time it's called (never from whatever order a
 * previous call already left the DOM in), so calling it repeatedly —
 * after every edit, not just once at load — is always safe and
 * idempotent.
 *
 * `prev` is `cards[i + 1]`, not `cards[i - 1]` — #kanji-grid's own
 * flex-direction: row-reverse (style.css, Japanese-style reading
 * order) means DOM order and physical left-to-right order now run
 * OPPOSITE: the card immediately to cur's physical left is the NEXT
 * one in DOM order, not the previous one (confirmed by measurement —
 * cards[i+1] renders flush against cards[i]'s own left edge). `cur`/
 * `prev` are still named for what they MEAN (prev = whatever sits
 * physically to cur's left), so every reference to them by name
 * further down stays correct without any other change. */
function applyRowRescueSwaps() {
  const cards = [...document.querySelectorAll('#kanji-grid .kc:not(.legendCard)')];

  for (let i = 0; i < cards.length - 1; i++) {
    const cur = cards[i], prev = cards[i + 1];
    const curBody = cur.querySelector('.kc-body'), prevBody = prev.querySelector('.kc-body');
    if (!curBody || !prevBody) continue;
    if (Math.abs(curBody.getBoundingClientRect().top - prevBody.getBoundingClientRect().top) > 1) continue; // different grid row — no real neighbor

    const curChar = cur.dataset.kanji, prevChar = prev.dataset.kanji;
    const curOn     = getCurrentFieldValue(curChar, 'on') || [];
    const curOnAdd  = getCurrentFieldValue(curChar, 'onAdd') || [];
    const curKunAdd = getCurrentFieldValue(curChar, 'kunAdd') || [];
    const prevKun   = getCurrentFieldValue(prevChar, 'kun') || [];
    const prevName  = getCurrentFieldValue(prevChar, 'name') || [];

    // l1 only ever sees r1's BASELINE (its own first column) — r1's
    // overflow (once it spills past that) redirects to l2 instead;
    // l1 and r1-overflow never interact, matching r1/l3 never
    // interacting either (see README).
    const prevR1El = prev.querySelector('.r1');
    const r1Capacity = measureR1Capacity(prevR1El, prevKun);
    const prevKunBaseline = prevKun.slice(0, r1Capacity);
    const prevKunOverflow = prevKun.slice(r1Capacity);

    const l1r1 = computePairRescue(curOn, prevKunBaseline, ROW_RESCUE_THRESHOLD_PRIMARY);
    applyRowOrder(cur.querySelector('.l1'), l1r1.minePerm);

    // l2 <-> r1 overflow (only relevant once r1 itself has spilled
    // past its own first column — rare, e.g. 上's 8 kun'yomi readings).
    // Both combine into ONE applyRowOrder call on prevR1El -- applying
    // them as two separate calls would let the second's appendChild
    // shove the first's spans out of their intended column.
    const l2r1 = prevKunOverflow.length ? computePairRescue(curOnAdd, prevKunOverflow, ROW_RESCUE_THRESHOLD_SECONDARY) : { minePerm: curOnAdd, theirsPerm: prevKunOverflow };
    if (prevKunOverflow.length) applyRowOrder(cur.querySelector('.l2'), l2r1.minePerm);
    applyRowOrder(prevR1El, [...l1r1.theirsPerm, ...l2r1.theirsPerm]);

    // l3 <-> r2 (direct pairing — r1/l3 never interact, see README).
    // curKunAdd itself is left in natural order here (rarely has more
    // than one entry to reorder anyway) — only prevName gets touched,
    // and only via the combined l2+l3 rearrangement right below, which
    // supersedes whatever this finds for prevName specifically.
    const l3r2 = computePairRescue(curKunAdd, prevName, ROW_RESCUE_THRESHOLD_SECONDARY);
    applyRowOrder(cur.querySelector('.l3'), l3r2.minePerm);

    // l2+l3 <-> r2 (name's OWN column split against the combined onAdd
    // + kunAdd of the next kanji — see computeDensity's wName comment
    // for why both are real neighbors, not just l3 alone). Unlike
    // l1<->r1/l3<->r2 above, this doesn't just reorder WITHIN whatever
    // column natural reading order happened to produce — it searches
    // which specific name readings should even BE in the overflow
    // column (bestColumnArrangement), since a long entry stranded in
    // the solid column by pure reading-order coincidence is exactly
    // what caused 二/十 to look like a collision that needed 十 to move,
    // when reordering 二's own name list fixes it in place instead (see
    // computeDensity's optimalFieldWidth). Gated on DENSITY_STEP_SECONDARY,
    // not ROW_RESCUE_THRESHOLD_SECONDARY — this is realizing whatever
    // the density tier check already decided was achievable, so it
    // needs to target that same tier, not the older, looser row-rescue
    // threshold tuned for a different (index-paired) formula.
    // Reset r2 to natural order before measuring it — measuring
    // whatever order a PREVIOUS pass left behind made this pass
    // non-idempotent: equal-length readings tie in
    // bestColumnArrangement, so each pass rotated them one more step
    // (生's ふ/み/さ/そ cycled endlessly on repeated passes).
    applyRowOrder(prev.querySelector('.r2'), prevName);
    const prevNameCols = densityColumnsOfElement(prev.querySelector('.r2'));
    if (prevNameCols.length) {
      const namePartner = [...curOnAdd, ...curKunAdd];
      const naturalWidth = fieldWidthFromColumns(prevNameCols, namePartner, true);
      if (naturalWidth >= DENSITY_STEP_SECONDARY) {
        const fullName = prevNameCols.flat();
        const solidCapacity = prevNameCols.length > 1 ? prevNameCols[0].length : fullName.length;
        const arrangement = bestColumnArrangement(fullName, solidCapacity, namePartner, true);
        if (arrangement.width < naturalWidth) {
          applyRowOrder(prev.querySelector('.r2'), [...arrangement.solid, ...arrangement.overflow]);
        }
      }
    }
  }
}


// ── Name-column dividers ───────────────────────────────────────

/**
 * Draw dotted vertical dividers between columns of name readings (r2).
 * Must be called after layout has settled (requestAnimationFrame).
 */
const R2_EXTRA_PULL = 0.5; // px — how much closer than column-gap the overflow column sits; column-gap itself can't go negative (CSS rejects it outright), so this is a margin-left instead

function markR2Columns(r2) {
  r2.querySelectorAll('.r2-divider').forEach(d => d.remove());
  const items = [...r2.querySelectorAll('span.add')];
  if (!items.length) return;

  const firstLeft    = items[0].getBoundingClientRect().left;

  // Pull the overflow column R2_EXTRA_PULL px closer than column-gap
  // alone would place it. Reset first (not just re-applied) so a
  // kanji whose overflow column disappeared on a later re-render
  // doesn't keep a stale negative margin.
  items.forEach(el => {
    const isOverflow = el.getBoundingClientRect().left > firstLeft + 1;
    el.style.marginLeft = isOverflow ? `${-R2_EXTRA_PULL}px` : '';
  });

  const r2Rect = r2.getBoundingClientRect();
  // Half of .r2's own column-gap (style.css), minus the extra pull
  // above — not a fixed px offset — so the line splits whatever gap
  // there currently is 50/50 instead of only the left side shrinking
  // as column-gap shrinks (confirmed at column-gap: 0: the old fixed
  // -2px offset left the line sitting 2px inside the solid column
  // instead of flush at the boundary). Can go negative once the pull
  // exceeds column-gap — the formula still centers the line on
  // whatever (possibly overlapping) distance actually remains.
  const columnGap = (parseFloat(getComputedStyle(r2).columnGap) || 0) - R2_EXTRA_PULL;
  const columns   = new Map();

  items.forEach(el => {
    const rect = el.getBoundingClientRect(); // reflects the margin-left just applied
    if (rect.left > firstLeft + 1) {
      const colLeft = Math.round(rect.left - r2Rect.left);
      if (!columns.has(colLeft)) columns.set(colLeft, []);
      columns.get(colLeft).push(rect);
    }
  });

  columns.forEach((rects, colLeft) => {
    const top    = Math.min(...rects.map(r => r.top))    - r2Rect.top;
    const bottom = Math.max(...rects.map(r => r.bottom)) - r2Rect.top;
    const div = document.createElement('div');
    div.className = 'r2-divider';
    div.style.cssText =
      `position:absolute; left:${colLeft - columnGap / 2}px; top:${top}px;` +
      `height:${bottom - top}px; border-left:1px dotted var(--mora-dot-color);` +
      `pointer-events:none;`;
    r2.appendChild(div);
  });
}


// ── Card initialisation ───────────────────────────────────────

/**
 * Attach per-card state and kick off the KanjiVG fetch.
 * `card._st` holds all mutable animation state for this card.
 */
function initCard(card) {
  const char = card.dataset.kanji;
  const svg  = card.querySelector('svg.kanji');
  const btn  = card.querySelector('.animBtn');
  card._st   = { paths: [], lens: [], cancel: null, timer: null, fb: null };
  btn.addEventListener('click', () => animate(card._st));
  // Every real card is a single character; only the legend's 漢字
  // placeholder ever has more than one, sharing its square between them.
  if ([...char].length > 1) loadKanjiMulti(char, svg, btn, card._st);
  else loadKanji(char, svg, btn, card._st);
}


// ── Popup (variant glyph tag, info button — anything using
//    .popupWrap/.popupTrigger/.popupContent) ─────────────────────

/**
 * Close all open popups (optionally leaving one open).
 * Also resets the trigger's aria-expanded so screen readers stay in sync.
 */
function closePopups(exceptWrap) {
  document.querySelectorAll('.popupWrap.open').forEach(wrap => {
    // exceptWrap's own ancestors (not just exceptWrap itself) are
    // spared too — the phenomenon dictionary popups nest inside the
    // info popup (popupWrap-in-a-popupWrap), and without this,
    // clicking one to lock it open would close its own parent (the
    // info popup it lives inside) in the same breath.
    if (wrap === exceptWrap || (exceptWrap && wrap.contains(exceptWrap))) return;
    wrap.classList.remove('open');
    wrap.querySelector('.popupTrigger').setAttribute('aria-expanded', 'false');
  });
}

/**
 * The info popup opens to whichever side of its button has more room
 * (the variant popup doesn't need this — it's centered above its
 * trigger instead). Measures real space now that .open has made the
 * popup visible and measurable, and toggles .openLeft, which CSS uses
 * to flip it from the open-right default. A phenomenon dictionary
 * popup (reading/category badges) gets different treatment: those
 * live inside the info popup itself, and the user asked for them to
 * stay fully inside that box (edge touching, never spilling past it)
 * rather than floating outside it — so instead of flipping sides,
 * this clamps the popup's horizontal offset so it never extends past
 * its containing .infoPopup's own left/right edges, overriding the
 * CSS default of centering under the trigger only when centering
 * would've overflowed. No-op for any other popup.
 */
function positionInfoPopup(wrap) {
  if (wrap.classList.contains('infoWrap')) {
    const content = wrap.querySelector('.popupContent');
    if (!content) return;
    const wrapRect     = wrap.getBoundingClientRect();
    const contentWidth = content.offsetWidth;
    const spaceRight    = window.innerWidth - wrapRect.right;
    const spaceLeft      = wrapRect.left;
    wrap.classList.toggle('openLeft', spaceRight < contentWidth && spaceLeft > spaceRight);
    // A kun/kunAdd meaning (.infoReadingMeaning rt, CSS) is absolutely
    // positioned and centered on its own reading on purpose, so it's
    // free to spill over a neighboring reading's own box — but centered
    // on a reading near .infoPopup's own left/right edge, a long
    // meaning can extend past that edge too, where overflow-x: hidden
    // (above) just chops it off instead of letting it spill harmlessly.
    // Same clamp-to-container technique as the phenomenonWrap branch
    // below, just centered on each reading's own span instead of the
    // wrap: push it in from the default centered offset only enough to
    // keep it inside .infoPopup, never reserving extra box width for it
    // (that would reintroduce the "pushes neighboring readings apart"
    // behavior this absolute positioning was specifically chosen to
    // avoid — see .infoReadingMeaning, style.css).
    // overflow-x: hidden (above) clips at the padding edge, not the
    // border box getBoundingClientRect() measures — .popupWrap.infoWrap
    // .popupContent's 3px border sits between the two, so the clamp
    // has to account for it too or the margin below silently shrinks
    // by however wide that border is.
    const containerRect  = content.getBoundingClientRect();
    const containerStyle = getComputedStyle(content);
    const borderLeft  = parseFloat(containerStyle.borderLeftWidth)  || 0;
    const borderRight = parseFloat(containerStyle.borderRightWidth) || 0;
    const clipLeft  = containerRect.left  + borderLeft;
    const clipRight = containerRect.right - borderRight;
    const margin = 4;
    // Alternating over/under per reading (rubyUnder, CSS) keeps most
    // immediate neighbors off each other, but with enough readings in
    // a row (e.g. 生's 10 kun), two readings two apart land on the
    // *same* side, and a wide enough pair of meanings between them
    // still collides — alternation alone doesn't know how wide
    // anything actually rendered. Left-to-right sweep per side (over/
    // under separately, each resets whenever flex-wrap starts a new
    // visual row): if this reading's meaning would start before the
    // last same-side meaning's right edge, push this reading's own
    // span rightward by exactly that much (margin-left) — the gap
    // shows up as more distance between these two readings in the row
    // itself, not as another stacked line of text (every meaning stays
    // on its reading's own over/under line, same as the single-reading
    // case) and not as this reading's own kana letter-spacing apart
    // (margin-left moves the whole span, it doesn't stretch what's
    // inside it). The same push is mirrored as margin-right on this
    // span too, so it ends up equally spaced from its left and right
    // neighbors instead of hugging whichever reading comes after it —
    // a flex item's left/right margins don't collapse with anything,
    // so this reliably widens the gap on both sides by the same amount.
    const rowGap = 2;
    const sideLastRight = { over: null, under: null };
    let lastTop = null;
    const spans = content.querySelectorAll('.infoReadingMeaning');
    spans.forEach(span => { span.style.marginLeft = ''; span.style.marginRight = ''; });
    spans.forEach(span => {
      const rt = span.querySelector('rt');
      if (!rt) return;
      let spanRect = span.getBoundingClientRect();
      if (lastTop !== null && Math.abs(spanRect.top - lastTop) > 4) {
        sideLastRight.over  = null;
        sideLastRight.under = null;
      }
      lastTop = spanRect.top;

      const centered = spanRect.width / 2 - rt.offsetWidth / 2;
      const side = span.classList.contains('rubyUnder') ? 'under' : 'over';
      const lastRight = sideLastRight[side];
      let leftAbs = spanRect.left + centered;
      if (lastRight !== null && leftAbs < lastRight + rowGap) {
        const push = `${lastRight + rowGap - leftAbs}px`;
        span.style.marginLeft  = push;
        span.style.marginRight = push;
        spanRect = span.getBoundingClientRect();
        leftAbs  = spanRect.left + centered;
      }
      sideLastRight[side] = leftAbs + rt.offsetWidth;

      const minLeft = clipLeft  - spanRect.left + margin;
      const maxLeft = clipRight - spanRect.left - rt.offsetWidth - margin;
      rt.style.left      = `${Math.max(minLeft, Math.min(centered, maxLeft))}px`;
      rt.style.transform = 'none';
    });
    return;
  }
  if (wrap.classList.contains('phenomenonWrap')) {
    const content   = wrap.querySelector('.popupContent');
    const container = wrap.closest('.infoPopup');
    if (!content || !container) return;
    const margin       = 4; // small breathing room, not a hard 0px touch
    const containerRect = container.getBoundingClientRect();
    const wrapRect       = wrap.getBoundingClientRect();
    const contentWidth   = content.offsetWidth;
    // left is normally 50%/translateX(-50%) (CSS) — centered = the
    // same offset in px, computed relative to the wrap (content's own
    // positioning parent), clamped to stay within the container.
    const centered = wrapRect.width / 2 - contentWidth / 2;
    const minLeft  = containerRect.left  - wrapRect.left + margin;
    const maxLeft  = containerRect.right - wrapRect.left - contentWidth - margin;
    content.style.left      = `${Math.max(minLeft, Math.min(centered, maxLeft))}px`;
    content.style.transform = 'none';
  }
}

/**
 * Click/tap-to-toggle any popup (works on touch, not just hover), and
 * "lock" it open so its content — including a hyperlink, e.g. the info
 * popup's kanshudo links — can be selected or clicked without the
 * popup closing underneath you. A click inside an already-open popup
 * is left alone; a click anywhere else closes whatever is open.
 * Delegated on document, so it needs no per-card wiring and keeps
 * working as cards (and their popups) are added.
 */
function initPopups() {
  document.addEventListener('click', e => {
    const trigger = e.target.closest('.popupTrigger');
    if (trigger) {
      const wrap = trigger.closest('.popupWrap');
      const wasOpen = wrap.classList.contains('open');
      closePopups(wrap);
      if (!wasOpen) {
        wrap.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        positionInfoPopup(wrap);
      }
      return;
    }
    if (!e.target.closest('.popupContent')) closePopups();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePopups();
  });

  // Hover-preview needs the same left/right space check click gets —
  // without this, hovering a right-edge card's info button showed the
  // popup via CSS :hover alone, with no .openLeft check ever run, so
  // it could still open off-screen to the right. Also closes whatever
  // else is currently locked open (.open, from a click) — hovering a
  // different trigger reads as "show me this one instead", not "keep
  // the old one open behind this preview". Every .popupTrigger gets
  // this (not just .infoBtn) so the phenomenon dictionary badges
  // behave identically on hover — positionInfoPopup is a no-op for
  // anything that isn't .infoWrap, so this is safe to call uniformly.
  document.addEventListener('mouseover', e => {
    const trigger = e.target.closest('.popupTrigger');
    if (!trigger) return;
    const wrap = trigger.closest('.popupWrap');
    closePopups(wrap);
    positionInfoPopup(wrap);
  });
}


// ── Editable kanji data (nav menu: edit any field, add a kanji) ─
//
// kanji.json/words.json are hand-curated and there's no backend this
// static site could write to, so an in-page edit can't silently save
// back into them. Instead: edits go into the browser's localStorage
// immediately (every future page load in this browser sees them), and
// the nav menu's "Export additions" button downloads the current full
// state as two JSON files — kanjiOverrides.json and wordOverrides.json,
// each shaped like { overrides, custom } — to drop into data/ and
// commit by hand; after that, every browser sees the edits too, not
// just the one they were made in. Priority when both exist:
// localStorage > the committed file > kanji.json/words.json's own data.
//
// Two kinds of edit:
//  - override an EXISTING kanji's field/word (kanjiOverrides/
//    wordOverrides), gated by a confirm() prompt (toggleable in the
//    nav menu) since it's replacing real, curated data;
//  - add a brand-new kanji (customKanji/customWords) via the nav
//    menu's "+ Add kanji" — no confirm needed, there's nothing real to
//    protect. A custom kanji's fields are mutated directly rather than
//    going through the override layer, since there's no "real" base
//    value to preserve underneath.
// Word-level entries either way are full words.json-shaped objects
// (word, kana, meaning[], pos, jlpt, pitch), marked selfAdded: true —
// reusing words.json's existing convention for hand-typed, not-yet-
// verified-against-kanshudo entries (the info popup already renders
// its "unverified" badge for that, no new code needed).
//
// appState holds the one in-memory copy of all of this (populated in
// init()); every save function updates it AND persists the relevant
// slice to localStorage, and rerenderCard() rebuilds one card's whole
// DOM from appState afterward rather than patching pieces of it —
// simpler, and guarantees the info popup, card face, and anything else
// derived from this kanji's data all stay consistent with each other.

const KANJI_OVERRIDES_KEY = 'kanjiGrid.kanjiOverrides';
const WORD_OVERRIDES_KEY  = 'kanjiGrid.wordOverrides';
const CUSTOM_KANJI_KEY    = 'kanjiGrid.customKanji';
const CUSTOM_WORDS_KEY    = 'kanjiGrid.customWords';
const SETTINGS_KEY        = 'kanjiGrid.settings';
const POSTER_CONFIG_KEY   = 'kanjiGrid.posterConfig';

// Array-valued kanji.json fields a user can override wholesale (always
// the field's full new array, never a partial patch — see
// initFieldEditing). `meaning` is the only overridable string field;
// frequentWord/frequentWordMeaning aren't listed here at all — those
// go through the word-slot mechanism (wordOverrides/customWords)
// instead, since a word needs kana/pitch/pos/jlpt alongside it.
const OVERRIDABLE_ARRAY_FIELDS = new Set(['variants', 'components', 'componentsExtensive', 'on', 'onAdd', 'kun', 'kunMeaning', 'kunAdd', 'kunAddMeaning', 'name']);

const appState = {
  kanji: [], words: {}, moraInfo: null,
  kanjiOverrides: {}, wordOverrides: {},
  customKanji: [], customWords: {},
  settings: { confirmOverwrite: true, editMode: false, extensiveComponents: false, densityFitStrategy: 'sequential', theme: 'dark' },
  // Pure in-memory overlay for the density-fit-strategy toggle (see
  // initNavMenu) -- char -> position, recomputed live via
  // computeDensityPreview() whenever the toggle changes. Never written
  // to kanjiOverrides/localStorage and never exported; null until the
  // toggle is actually touched, so a fresh page load renders from the
  // real stored/committed position data untouched.
  densityPreviewPositions: null,
  // Poster/print layout — see applyPosterConfig/exitPosterMode.
  // `active` is deliberately never persisted/restored on load (a fresh
  // load always starts in the normal view); widthCm/heightCm/forcedChars
  // are, purely so reopening the panel later recalls the last values.
  posterConfig: { active: false, widthCm: null, heightCm: null, forcedChars: [] },
};

function loadLocal(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn(`Could not save ${key} to localStorage:`, e); }
}

/** Merge data/kanjiOverrides.json (optional) with this browser's own
 * localStorage edits — per-char shallow-merge for `overrides` (a char
 * in both is merged field-by-field, not one replacing the other
 * wholesale); `custom` (a char -> record map internally, flattened
 * back to an array) lets a locally-edited custom kanji win over an
 * already-committed version of the same char. */
async function loadKanjiDomain() {
  const file = await fetch('data/kanjiOverrides.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const fileOverrides = file.overrides || {};
  const fileCustom    = file.custom || [];
  const localOverrides = loadLocal(KANJI_OVERRIDES_KEY, {});
  const localCustom    = loadLocal(CUSTOM_KANJI_KEY, []);

  const overrides = {};
  for (const c of new Set([...Object.keys(fileOverrides), ...Object.keys(localOverrides)])) {
    overrides[c] = { ...fileOverrides[c], ...localOverrides[c] };
  }
  const byChar = new Map(fileCustom.map(k => [k.char, k]));
  localCustom.forEach(k => byChar.set(k.char, k));
  return { overrides, custom: [...byChar.values()] };
}

/** Same idea as loadKanjiDomain, for data/wordOverrides.json — `custom`
 * here is char -> that char's whole custom word list; a char present
 * locally wins wholesale (a custom kanji's words are always saved
 * together, so there's no finer-grained conflict to merge). */
async function loadWordDomain() {
  const file = await fetch('data/wordOverrides.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const fileOverrides = file.overrides || {};
  const fileCustom    = file.custom || {};
  const localOverrides = loadLocal(WORD_OVERRIDES_KEY, {});
  const localCustom    = loadLocal(CUSTOM_WORDS_KEY, {});

  const overrides = {};
  for (const c of new Set([...Object.keys(fileOverrides), ...Object.keys(localOverrides)])) {
    overrides[c] = { ...fileOverrides[c], ...localOverrides[c] };
  }
  const custom = {};
  for (const c of new Set([...Object.keys(fileCustom), ...Object.keys(localCustom)])) {
    custom[c] = localCustom[c] || fileCustom[c];
  }
  return { overrides, custom };
}

function isCustomKanji(char) { return appState.customKanji.some(k => k.char === char); }
function findBaseKanji(char) { return appState.kanji.find(k => k.char === char); }

/** Effective grid slot for a kanji — kanjiOverrides (or the custom
 * record itself) if its position has been edited, else the base
 * data's own value. "order" is the same lookup but for the fixed,
 * never-edited field used only as a stable tiebreak (see
 * resortGridCards) — two kanji sharing one position (e.g. right after
 * inserting one) sort by original order instead of jumping around
 * unpredictably. */
function getEffectivePosition(char) {
  if (appState.densityPreviewPositions && char in appState.densityPreviewPositions) {
    return appState.densityPreviewPositions[char];
  }
  const v = getCurrentFieldValue(char, 'position');
  return typeof v === 'number' ? v : Infinity;
}
function getEffectiveOrder(char) {
  const v = getCurrentFieldValue(char, 'order');
  return typeof v === 'number' ? v : Infinity;
}

/** The next free "order" value — every new custom kanji gets one so
 * it has a stable identity/tiebreak like every real kanji.json entry
 * already does, and its "position" starts equal to it (append to the
 * end by default, editable before save if it should go somewhere
 * else). */
function nextOrderValue() {
  const orders = [...appState.kanji, ...appState.customKanji]
    .map(k => k.order)
    .filter(n => typeof n === 'number');
  return orders.length ? Math.max(...orders) + 1 : 0;
}

/** Re-orders the grid's actual DOM to match every card's current
 * effective position, so moving one kanji (editing "position") takes
 * effect immediately without a full reload — called after any card
 * rebuild (rerenderCard), not just position edits, since that's the
 * only place a reorder could be needed and it's cheap even for every
 * edit. The legend card is excluded and always stays first. */
function resortGridCards() {
  const grid = document.getElementById('kanji-grid');
  const cards = [...grid.children].filter(el => el.id !== 'kc-legend' && el.id !== 'kc-counters');
  cards.sort((a, b) => {
    const pa = getEffectivePosition(a.dataset.kanji), pb = getEffectivePosition(b.dataset.kanji);
    if (pa !== pb) return pa - pb;
    return getEffectiveOrder(a.dataset.kanji) - getEffectiveOrder(b.dataset.kanji);
  });
  cards.forEach(el => grid.appendChild(el));
  // #kc-counters (buildCountersPlaceholder) has no dataset.kanji to
  // sort by — excluded above, then explicitly re-appended last here,
  // since leaving it merely untouched would still drift it toward the
  // middle as every real card above gets individually moved-to-end
  // around it.
  const countersBox = document.getElementById('kc-counters');
  if (countersBox) grid.appendChild(countersBox);
}

/** The actual "move" behind every position edit (the quick popup and
 * the edit modal alike) — a real array-reorder, not just "give this
 * one kanji a new number and let ties fall where they may": every
 * kanji currently between the old and new spot shifts by exactly one
 * to make room, the same way dragging an item in any reorderable list
 * does, so `position` always stays a dense 0..N-1 ranking that means
 * exactly "this many kanji come before it" — never a gap, never two
 * kanji tied on the same number. Only kanji whose position actually
 * changes get a new stored value; most of the list, off to either side
 * of the move, is untouched. */
function moveKanjiToPosition(char, targetIndex) {
  const allChars = [...appState.kanji, ...appState.customKanji]
    .map(k => k.char)
    .sort((a, b) => {
      const pa = getEffectivePosition(a), pb = getEffectivePosition(b);
      if (pa !== pb) return pa - pb;
      return getEffectiveOrder(a) - getEffectiveOrder(b);
    });
  const from = allChars.indexOf(char);
  if (from === -1 || !Number.isFinite(targetIndex)) return;
  const to = Math.max(0, Math.min(Math.round(targetIndex), allChars.length - 1));
  if (to === from) return;
  allChars.splice(from, 1);
  allChars.splice(to, 0, char);
  allChars.forEach((c, i) => {
    if (getEffectivePosition(c) === i) return;
    saveFieldEdit(c, 'position', i);
    // Patch any other card's own quick-edit popup in place — its
    // stored position just changed even though its slot only moved by
    // one, and without this its input would keep showing the stale
    // number until that card happens to get rebuilt some other way.
    const otherCard = document.getElementById('kc-' + c);
    const otherInput = otherCard && otherCard.querySelector('.positionQuickInput');
    if (otherInput) otherInput.value = i;
  });
  resortGridCards();
}

// ── Live density-fit-strategy preview (nav toggle) ──────────────────
// Two ways to pick which reordering resolves a threshold-crossing
// reading against its actual neighbor, both minimizing change-count
// (never the raw mathematically-best width, except as a last-resort
// fallback when nothing fits at all): "sequential" tries reordering
// `kun`'s own column alone first, only allowing the neighbor's `on`
// column to change too if kun-alone can't find a fit; "joint" searches
// both columns' reorderings together from the start, minimizing the
// TOTAL changes across both sides with no priority between them. Both
// mirror the offline computation that wrote kanji.json's stored
// `position`, but run live here so the two can be compared via the
// nav toggle. Writes only into appState.densityPreviewPositions (a
// pure in-memory overlay getEffectivePosition checks first) — never
// kanjiOverrides, never localStorage, never exported.

const DENSITY_FIELDS = ['on', 'onAdd', 'kun', 'kunAdd', 'name'];
const DENSITY_CLASS_FOR = { on: 'l1', onAdd: 'l2', kunAdd: 'l3', kun: 'r1', name: 'r2' };
const DENSITY_STEP_PRIMARY = 6, DENSITY_STEP_SECONDARY = 8;

function densityColumnsOfElement(el) {
  const spans = [...el.querySelectorAll(':scope > span:not(.fieldPlaceholder):not(.popupWrap)')];
  if (!spans.length) return [];
  const rightAligned = getComputedStyle(el).alignItems === 'flex-end';
  const edge = s => Math.round(rightAligned ? s.getBoundingClientRect().right : s.getBoundingClientRect().left);
  const groups = new Map();
  const order = [];
  spans.forEach(s => {
    const e = edge(s);
    if (!groups.has(e)) { groups.set(e, []); order.push(e); }
    groups.get(e).push(s.dataset.reading || s.textContent);
  });
  return order.map(e => groups.get(e));
}

/** Measures one kanji's own natural column-wrapping for every reading
 * field, via an isolated off-DOM render. `.kc-left`/`.kc-right` have a
 * fixed height (`var(--kanji-size)`) independent of grid context — see
 * the README's density section — so an isolated card wraps identically
 * to how it would in the real grid, and isolation guarantees no other
 * kanji's row-rescue reordering can contaminate the measurement.
 * initCard() (stroke SVG loading) is skipped entirely — irrelevant to
 * text layout, and would otherwise fire 100 unnecessary network
 * fetches just to preview a toggle. */
function measureNaturalColumns(k, wordsForChar) {
  const html = buildCard(k, wordsForChar, appState.moraInfo, {}, {});
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.innerHTML = html.trim();
  document.body.appendChild(wrapper);
  const card = wrapper.firstElementChild;
  const result = {};
  DENSITY_FIELDS.forEach(field => {
    const el = card.querySelector('.' + DENSITY_CLASS_FOR[field]);
    result[field] = el ? densityColumnsOfElement(el) : [];
  });
  wrapper.remove();
  return result;
}

// A cheap snapshot of every input computeDensityPreview()'s result
// actually depends on — base kanji/word data, custom kanji/words, and
// the extensive-components setting (measureNaturalColumns is called
// with {} overrides inside measureAllColumnsLive below, so
// kanjiOverrides/wordOverrides were never part of this to begin with).
// densityFitStrategy is deliberately NOT included: grepping its only
// real (non-wiring) use confirms it's read solely inside
// computePairRescue(), called only from applyRowRescueSwaps() — a
// different function entirely, never from computeDensityPreview() or
// anything it calls. See computeDensityPreview's own cache, below.
function measurementFingerprint() {
  return JSON.stringify([
    appState.kanji, appState.customKanji, appState.words, appState.customWords,
    appState.settings.extensiveComponents,
  ]);
}
function measureAllColumnsLive() {
  const measurements = {};
  appState.kanji.forEach(k => { measurements[k.char] = measureNaturalColumns(k, appState.words); });
  appState.customKanji.forEach(k => {
    measurements[k.char] = measureNaturalColumns(k, { [k.char]: appState.customWords[k.char] || [] });
  });
  return measurements;
}

function inversionCount(seq) {
  let count = 0;
  for (let i = 0; i < seq.length; i++)
    for (let j = i + 1; j < seq.length; j++)
      if (seq[i] > seq[j]) count++;
  return count;
}

function permutationsOf(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  arr.forEach((item, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    permutationsOf(rest).forEach(p => result.push([item, ...p]));
  });
  return result;
}

function maxCombinedForPairing(minePerm, theirsPerm) {
  let max = 0;
  const n = Math.max(minePerm.length, theirsPerm.length);
  for (let i = 0; i < n; i++) {
    const mine = minePerm[i] ? minePerm[i].length : 0;
    const theirs = theirsPerm[i] ? theirsPerm[i].length : 0;
    max = Math.max(max, mine + theirs);
  }
  return max;
}

/** Shared last resort for both strategies below, when NO arrangement
 * of either column can be made to fit within budget at all: the
 * mathematically best (max-minimizing) arrangement, regardless of how
 * far it strays from natural order — longest-of-mine to the
 * empty/nonexistent partner slots first, then longest-mine vs
 * shortest-theirs for the rest (provably minimizes the worst pairing
 * for this kind of 1:1 matching). There's nothing left to preserve
 * order for once nothing actually fits, so this ignores change-count
 * entirely and just minimizes the resulting width. */
function bestCombinedMaxOptimal(mine, theirs) {
  if (!mine.length) return 0;
  const N = mine.length, K = theirs.length;
  const numEmpty = Math.max(0, N - K);
  const mineDesc = [...mine].sort((a, b) => b.length - a.length);
  const toEmpty = mineDesc.slice(0, numEmpty);
  const toReal = mineDesc.slice(numEmpty);
  const theirsAsc = [...theirs].sort((a, b) => a.length - b.length);
  let max = 0;
  toEmpty.forEach(r => { max = Math.max(max, r.length); });
  toReal.forEach((r, i) => { max = Math.max(max, r.length + (theirsAsc[i] ? theirsAsc[i].length : 0)); });
  return max;
}

function densityDistance(perm, natIdx) { return inversionCount(perm.map(s => natIdx.get(s))); }

/** Every size-k subset of indices 0..n-1 — cheap for the overflow
 * counts actually seen here (a handful out of at most ~13 name
 * readings), unlike a full permutation search (which chooseArrangement
 * explicitly guards against past 7 items). */
function combinationsOfIndices(n, k) {
  if (k === 0) return [[]];
  if (n < k) return [];
  const result = [];
  (function go(start, combo) {
    if (combo.length === k) { result.push(combo.slice()); return; }
    for (let i = start; i < n; i++) { combo.push(i); go(i + 1, combo); combo.pop(); }
  })(0, []);
  return result;
}

/** Same formula fieldWidth (computeDensityPreview) uses — solid
 * columns' own max (+bonus) summed, plus the last column's best
 * pairing against the partner — but taking already-measured `cols`
 * directly rather than looking them up via char/field, so a live-DOM
 * caller (applyRowRescueSwaps) can use it without needing
 * computeDensityPreview's batch measurement pass. */
function fieldWidthFromColumns(cols, partnerLast, bonus) {
  let w = 0;
  for (let i = 0; i < cols.length - 1; i++) w += Math.max(...cols[i].map(s => s.length)) + (bonus ? 1 : 0);
  const last = cols.length ? cols[cols.length - 1] : [];
  return w + bestCombinedMaxOptimal(last, partnerLast);
}

/** Finds which specific readings should land in a field's overflow
 * column — not just how to best PAIR whatever natural order already
 * put there (bestCombinedMaxOptimal), but which ones belong there in
 * the first place. Natural reading order can strand a long entry in
 * the solid column purely because it came first, while the overflow
 * column (the one that actually touches the neighboring card) gets off
 * easy — moving that long entry into overflow instead can lower the
 * combined width even though overflow's own pairing gets a little
 * worse (see optimalFieldWidth's density-time counterpart for the
 * worked 二/十 example). Searches every possible choice of overflow
 * membership (cheap — see combinationsOfIndices), keeping whichever
 * minimizes solid-width + best-pairing; ties broken toward whatever
 * stays closest to natural order (sum of chosen indices, preferring
 * the naturally-last entries, i.e. least rearrangement) since multiple
 * splits achieving the same width are otherwise an arbitrary choice.
 * Returns the winning solid/overflow reading lists, each in the
 * ACTUAL order needed to realize that minimum (solid keeps natural
 * relative order — its own width only depends on membership, not
 * order; overflow uses the same desc/asc construction
 * bestCombinedMaxOptimal's own math relies on, since a different order
 * of the same overflow set might not actually achieve the width this
 * found). `bonus` matches fieldWidth's own non-last-column bonus. */
const COLUMN_REASSIGN_MAX_SWAPS = 2; // keeps the result a clean, minimal swap rather than a wholesale reshuffle — see bestColumnArrangement

function bestColumnArrangement(fullList, solidCapacity, partnerLast, bonus) {
  const overflowCount = fullList.length - solidCapacity;
  if (overflowCount <= 0) return { solid: fullList, overflow: [], width: 0 };
  let best = null;
  combinationsOfIndices(fullList.length, overflowCount).forEach(comboIdx => {
    // How many entries this candidate pulls OUT of the solid column —
    // since both columns keep their fixed sizes, that's also exactly
    // how many entries get pushed the other way, i.e. how many actual
    // swaps this arrangement represents. Capped at
    // COLUMN_REASSIGN_MAX_SWAPS: moving 1-2 outlier entries to the
    // column that actually touches the neighbor reads as a deliberate,
    // minimal fix (what happened with 二's ふたつ); moving half the
    // field around to shave the width further would just look like the
    // reading order got shuffled for no visible reason. A candidate
    // needing more swaps than that is skipped outright, even if its
    // own width would otherwise win — natural order (0 swaps) is
    // always itself a candidate, so this never leaves nothing to pick.
    const swapsNeeded = comboIdx.filter(i => i < solidCapacity).length;
    if (swapsNeeded > COLUMN_REASSIGN_MAX_SWAPS) return;
    const inOverflow = new Set(comboIdx);
    const overflow = comboIdx.map(i => fullList[i]);
    const solid = fullList.filter((_, i) => !inOverflow.has(i));
    const solidW = solid.length ? Math.max(...solid.map(s => s.length)) + (bonus ? 1 : 0) : 0;
    const width = solidW + bestCombinedMaxOptimal(overflow, partnerLast);
    const indexSum = comboIdx.reduce((a, b) => a + b, 0);
    if (!best || width < best.width || (width === best.width && indexSum > best.indexSum)) {
      best = { width, indexSum, solid, overflow };
    }
  });
  // The overflow column fills top-to-bottom, same as the partner's own
  // column — row 0 of one sits at the same height as row 0 of the
  // other, so row 0 is the only row that's actually adjacent to real
  // partner content; any row past the partner's own row count has
  // nothing there to collide with regardless of how long it is.
  // bestCombinedMaxOptimal's own derivation already assumes this: the
  // numEmpty LONGEST entries ("toEmpty") get no partner at all, the
  // remaining (shortest-of-the-rest) "toReal" entries are the ones
  // actually paired against the partner's own rows — so toReal has to
  // come FIRST (the rows with a real neighbor) and toEmpty LAST (the
  // rows with nothing there), not sorted by length on its own. Getting
  // this backwards (longest first) would put the longest entry
  // directly across from the partner's own content — worse than
  // natural order, not better.
  const mineDesc = [...best.overflow].sort((a, b) => b.length - a.length);
  const numEmpty = Math.max(0, mineDesc.length - partnerLast.length);
  const toEmpty = mineDesc.slice(0, numEmpty);
  const toReal = mineDesc.slice(numEmpty);
  const overflowOrder = [...toReal, ...toEmpty];
  return { solid: best.solid, overflow: overflowOrder, width: best.width };
}

/** Density is driven ONLY by the true best-achievable width — whether
 * that optimum happens to need touching just `kun` or both `kun` and
 * `on`, the resulting number (and therefore which kanji end up dense)
 * is exactly the same either way. "Sequential" vs "joint" never
 * changes this value; they only choose DIFFERENTLY between arrangements
 * that tie at this same optimal width, which is a display/arrangement
 * concern (see chooseArrangement below), not a density one. */
function densityBestCombinedMax(mine, theirs) {
  return bestCombinedMaxOptimal(mine, theirs);
}

/** Chooses which specific arrangement to use for DISPLAY, among every
 * (kun, on) permutation pair that ties for the true optimal width
 * (computed separately, always the same regardless of strategy) —
 * "sequential" prefers keeping `on` completely untouched if any
 * optimal-width arrangement allows that (only reordering `kun`'s own
 * column), falling back to whichever optimal-width pair needs the
 * fewest total changes across both sides if not; "joint" always picks
 * by fewest total changes with no side preference from the start. Not
 * currently wired into anything rendered — density (the only thing
 * this preview's toggle visibly affects today) is strategy-independent
 * by design; this exists for a possible future display use. */
function chooseArrangement(mine, theirs, optimalWidth, strategy) {
  if (!mine.length) return { minePerm: mine, theirsPerm: theirs };
  if (mine.length > 7 || theirs.length > 7) return { minePerm: mine, theirsPerm: theirs }; // pathological guard, unreached in this dataset

  const mineNatIdx = new Map(mine.map((s, i) => [s, i]));
  const theirsNatIdx = new Map(theirs.map((s, i) => [s, i]));

  if (strategy !== 'joint') {
    let best = null;
    permutationsOf(mine).forEach(perm => {
      if (maxCombinedForPairing(perm, theirs) !== optimalWidth) return;
      const dist = densityDistance(perm, mineNatIdx);
      if (!best || dist < best.dist) best = { minePerm: perm, theirsPerm: theirs, dist };
    });
    if (best) return best;
  }

  let best = null;
  permutationsOf(mine).forEach(minePerm => {
    permutationsOf(theirs).forEach(theirsPerm => {
      if (maxCombinedForPairing(minePerm, theirsPerm) !== optimalWidth) return;
      const dist = densityDistance(minePerm, mineNatIdx) + densityDistance(theirsPerm, theirsNatIdx);
      if (!best || dist < best.dist) best = { minePerm, theirsPerm, dist };
    });
  });
  return best || { minePerm: mine, theirsPerm: theirs };
}

/** Full density/position recompute — mirrors the offline script that
 * wrote kanji.json's stored `position` (see README's "Grid ordering &
 * density"): raw per-column width (own columns except the last always
 * count in full), the last column checked against a neighbor's own
 * last column, density stepped at 6/12/18 (`on`/`kun`) or 10/20/30
 * (`onAdd`/`kunAdd`/`name`, and `kun`'s `l2`-redirect when it spans 2+
 * columns).
 *
 * Resolution happens in ordered ROUNDS, one per tier boundary. Round 0
 * decides dense-vs-not; round 1 decides stay-dense-1-vs-escalate-to-2
 * (today only 生 is ever a candidate for it). Each round is built from
 * three passes:
 *
 * **The forward pass.** Walk the round's candidates in order (round 0:
 * every kanji by `order`; round 1: the round-0 dense tail, by density
 * then `order`, after the queue-block resolution below has repositioned
 * whatever needed it). A kanji that fits against its immediate
 * neighbor settles within-tier right away. A kanji that doesn't, but
 * could in principle with a BETTER neighbor (`computeDensity(char,
 * null, null)` — the best case, using an empty partner on every
 * rescue-eligible side — is still within tier), is HELD rather than
 * settled, and the pass moves on without it. Every later kanji that
 * settles checks the held queue (earliest-held first); the first held
 * kanji that now fits — against the newly-settled kanji as a
 * prospective new neighbor — is resolved and PHYSICALLY SPLICED in
 * right after it (both kanji, and the rest of the queue against the
 * freshly-spliced one, are re-verified in turn). A kanji whose best
 * case already exceeds the tier is never held — no neighbor could
 * possibly save it, ever, regardless of who it ends up next to; it's
 * genuinely, unconditionally dense. A kanji still held when the
 * forward pass ends never makes it into this round's sequence.
 *
 * Splicing is real repositioning, not just a width check: once a held
 * kanji is placed, the actual render order for this round's kanji IS
 * this splice-built sequence — density 0 no longer means "keeps its
 * original relative position," it means "ends up wherever the search
 * actually placed it." A rescued kanji can end up several positions
 * away from where it started.
 *
 * **The internal stabilization pass.** Because splicing can move kanji
 * INTO a neighbor's way, a kanji that settled cleanly on the forward
 * pass can still end up next to something different than what
 * justified its density, when a later splice lands between it and the
 * neighbor its own check actually used. This re-verifies every
 * non-last entry against its REAL current neighbor and removes any
 * that no longer holds up, repeating since a removal can expose a
 * fresh gap next to it — monotonic (shrink-only, nothing ever
 * re-added), so unlike a sweep that lets kanji flip both ways, this is
 * guaranteed to terminate and can't oscillate.
 *
 * **The queue-block resolution.** The round's own last entry never had
 * a real next during the forward pass — the forward pass only ever
 * guesses at `next` one candidate ahead, and the sequence's true final
 * entry has nothing after it to guess with at all. This is checked
 * against the FIRST genuinely, unconditionally dense candidate (best
 * case still past tier, no possible rescue by anyone — the "tier
 * above" group) as its real eventual right-side neighbor; if that
 * fails, it's peeled off the sequence and prepended to a QUEUE BLOCK,
 * repeating since peeling exposes a new last entry with the same gap
 * (so genuinely-close boundary kanji — 所, 政, 現 in the current
 * dataset, none of them unconditionally dense — all end up in this
 * block together, not just whichever one happens to sit at the exact
 * edge). Combined with anything still sitting in the forward pass's
 * own leftover queue (never rescued by a real front-section
 * settlement), this whole block is resolved by SEARCHING EVERY
 * ARRANGEMENT of its members (a plain permutation search, same
 * technique already used elsewhere for finding the best-fitting row
 * order) — never spliced into or mixed with the unconditionally-dense
 * group. The search picks whichever arrangement resolves the most
 * members to true density 0, tie-broken by the lowest worst remaining
 * density, tie-broken again by staying closest to natural `order`.
 * Densities from the winning arrangement are applied directly (a
 * member checked against its real block-neighbors, or the true
 * boundary on either side). This is why 所, 政, and 現 all end up
 * grouped together immediately after the front section, with 所
 * genuinely resolving to density 0 there and 現 — last in the block —
 * bordering 上 (the first unconditionally-dense kanji) on its right
 * side: none of them are spliced into the middle of 上/下/明, since
 * none of those three could ever have been rescued by anyone in the
 * first place. */
function computeDensityPreviewUncached() {
  const measurements = measureAllColumnsLive();
  const sorted = [...appState.kanji, ...appState.customKanji].sort((a, b) => a.order - b.order);
  const orderOf = Object.fromEntries(sorted.map(k => [k.char, k.order]));
  const allChars = sorted.map(k => k.char);

  function columns(char, field) { return measurements[char][field] || []; }
  function lastColumn(char, field) { const c = columns(char, field); return c.length ? c[c.length - 1] : []; }
  function solidWidth(char, field, bonus) {
    const cols = columns(char, field);
    let w = 0;
    for (let i = 0; i < cols.length - 1; i++) w += Math.max(...cols[i].map(s => s.length)) + (bonus ? 1 : 0);
    return w;
  }
  function fieldWidth(char, field, partnerChar, partnerField, bonus) {
    const partnerLast = partnerChar ? lastColumn(partnerChar, partnerField) : [];
    return solidWidth(char, field, bonus) + densityBestCombinedMax(lastColumn(char, field), partnerLast);
  }
  /** Like fieldWidth, but doesn't take the column split for granted.
   * fieldWidth/solidWidth/lastColumn treat `columns(char,field)` — the
   * natural, as-rendered split — as fixed, then only optimize the
   * PAIRING of whatever happens to already be in the last column
   * against the partner. That can miss a cheaper arrangement entirely:
   * on 二, "ふたつ" (3 chars) sits in the SOLID column purely because it
   * came first in reading order, while the overflow column (the one
   * that actually touches the next kanji) got two short entries — if
   * "ふたつ" had landed in the overflow column instead, the solid
   * column's own max would DROP (it's not dragging that 3-char entry
   * along anymore), at the cost of one overflow slot being a little
   * longer. bestColumnArrangement searches every possible choice of
   * which entries end up in the overflow column — cheap, since overflow
   * counts here are small — and keeps whichever minimizes solid-width +
   * best-pairing together, same metric fieldWidth uses, just actually
   * searched instead of assumed. Only worth the search once a field has
   * spilled into exactly 2 columns in the first place (the vast
   * majority of fields never do); 3+ columns falls back to plain
   * fieldWidth — optimally packing entries across MULTIPLE fixed-
   * capacity bins, each contributing its own max to a summed total, is
   * a fussier problem than this dataset has ever needed. */
  function optimalFieldWidth(char, field, partnerLast, bonus) {
    const cols = columns(char, field);
    if (cols.length !== 2) return solidWidth(char, field, bonus) + densityBestCombinedMax(lastColumn(char, field), partnerLast);
    return bestColumnArrangement(cols[0].concat(cols[1]), cols[0].length, partnerLast, bonus).width;
  }
  function fieldWidthRaw(char, field, bonus) {
    return solidWidth(char, field, bonus) + (lastColumn(char, field).length
      ? Math.max(...lastColumn(char, field).map(s => s.length)) + (bonus ? 1 : 0) : 0);
  }
  function levelFor(w, step) { let n = 0; while (w >= step * (n + 1)) n++; return n; }

  function computeDensity(char, prev, next) {
    // #kanji-grid's flex-direction: row-reverse (style.css, Japanese-
    // style reading order) means sequence order no longer matches
    // physical left-to-right order — the kanji one EARLIER in sequence
    // ("prev", as every caller below computes it: candidates[i-1] or
    // equivalent) now renders physically to char's RIGHT, and the one
    // LATER in sequence ("next") renders to its LEFT — same flip
    // applyRowRescueSwaps needed, confirmed the same way (measurement).
    // Every field below pairs with whichever argument plays the correct
    // PHYSICAL side (l1/l3 face left, r1/r2 face right) — swapping the
    // two names once, right here, is enough: every caller throughout
    // resolveRound/stabilizeInternal/resolveQueueBlock keeps computing
    // "sequence-before" and "sequence-after" exactly as before, this is
    // the only place that decides which physical side each one maps to.
    // densityBestCase's own (null, null) call is unaffected either way.
    [prev, next] = [next, prev];
    const kunMulti = columns(char, 'kun').length >= 2;
    const wOn = fieldWidth(char, 'on', prev, 'kun', true);
    const wKun = kunMulti
      ? fieldWidth(char, 'kun', next, 'onAdd', true)
      : fieldWidth(char, 'kun', next, 'on', true);
    const wOnAdd = fieldWidthRaw(char, 'onAdd', true);
    const wKunAdd = fieldWidth(char, 'kunAdd', prev, 'name', true);
    // name's own box always starts flush with l2's top edge regardless
    // of length (align-content: flex-start, CSS .r2) and only reaches
    // l3 once it's tall enough to need an overflow column at all (.r2's
    // max-height: 50% means by the time that happens, name is already
    // using its full height — see README) — so both of next's l2
    // (onAdd) and l3 (kunAdd) are real neighbors for name's overflow
    // column, combined into one partner list rather than checked
    // separately (checking only l3, as before, could completely miss a
    // real collision whenever l3 happens to be empty on an otherwise-
    // crowded neighbor — confirmed on 二/十: 十's onAdd ("ジュッ") sits
    // right where 二's overflow name column lands, while 十's kunAdd is
    // empty). optimalFieldWidth (not plain fieldWidth) because name
    // commonly has enough readings to need real column-assignment
    // freedom, not just reordering within whatever column natural
    // order happened to split it into — see its own comment.
    const namePartner = next ? [...lastColumn(next, 'onAdd'), ...lastColumn(next, 'kunAdd')] : [];
    const wName = optimalFieldWidth(char, 'name', namePartner, true);
    return Math.max(
      levelFor(wOn, DENSITY_STEP_PRIMARY), levelFor(wKun, DENSITY_STEP_PRIMARY),
      levelFor(wOnAdd, DENSITY_STEP_SECONDARY), levelFor(wKunAdd, DENSITY_STEP_SECONDARY), levelFor(wName, DENSITY_STEP_SECONDARY),
    );
  }
  // Best case for a tier check: an empty/absent partner on every
  // rescue-eligible side is the most favorable neighbor a kanji could
  // ever get, so this is the floor `computeDensity` can produce — used
  // only to decide whether holding is even worth attempting.
  function densityBestCase(char) { return computeDensity(char, null, null); }

  /** One forward pass over `candidates` (already in the order they'll
   * be tried), targeting `tier`. `floor` clamps how low a result this
   * round can settle at (round 1 passes 1, so a kanji round 0
   * genuinely confirmed dense can't be pulled back down here) — except
   * for any char in `exempt`, which skips the floor entirely, since it
   * arrived as part of a resolved queue block and was never actually
   * confirmed at that tier, only provisionally marked pending this
   * round's real check. `seedPrev`, when given, seeds the walk with
   * the real boundary neighbor immediately before `candidates[0]` in
   * the eventual render order. Returns the (unseeded) splice-built
   * sequence for everyone who settled within tier, plus whatever's
   * still held in the queue when the pass ends — a kanji settled dense
   * (immediately, or left in the queue) is never added to the
   * sequence, so later candidates' `prev` correctly skips past it. */
  function resolveRound(densities, candidates, tier, floor, seedPrev, exempt) {
    const placedOrder = seedPrev ? [seedPrev] : [];
    const seedOffset = placedOrder.length;
    const queue = [];
    const resolvedNext = {};
    const clamp = (d, char) => (exempt && exempt.has(char)) ? d : Math.max(floor, d);

    function tryResolveQueueAgainst(newChar, newCharPrev) {
      for (let qi = 0; qi < queue.length; qi++) {
        const heldChar = queue[qi];
        // heldChar's true next, if spliced in right after newChar, is
        // whatever newChar's own next already was — NOT heldChar's own
        // stale original next (frozen from before it was ever held).
        const heldCharNewNext = resolvedNext[newChar];
        const d = computeDensity(heldChar, newChar, heldCharNewNext);
        if (d <= tier) {
          densities[heldChar] = clamp(d, heldChar);
          queue.splice(qi, 1);
          placedOrder.push(heldChar);
          resolvedNext[newChar] = heldChar;
          resolvedNext[heldChar] = heldCharNewNext;
          // newChar's own density is re-verified too: its true next is
          // now heldChar, not whatever it was originally paired
          // against. Its prev is unchanged — passed in explicitly
          // rather than re-derived from placedOrder positions (which,
          // after two pushes, no longer point at newChar's actual
          // predecessor).
          densities[newChar] = clamp(computeDensity(newChar, newCharPrev, heldChar), newChar);
          // heldChar is now itself a fresh placement — give the rest of
          // the queue a shot at fitting next to IT too.
          tryResolveQueueAgainst(heldChar, newChar);
          return true;
        }
      }
      return false;
    }

    const unconditionalChars = [];
    for (let i = 0; i < candidates.length; i++) {
      const char = candidates[i];
      const prev = placedOrder.length ? placedOrder[placedOrder.length - 1] : null;
      const next = i < candidates.length - 1 ? candidates[i + 1] : null;
      resolvedNext[char] = next;
      const dNatural = computeDensity(char, prev, next);
      if (dNatural <= tier) {
        densities[char] = clamp(dNatural, char);
        placedOrder.push(char);
        tryResolveQueueAgainst(char, prev);
      } else if (densityBestCase(char) <= tier) {
        queue.push(char);
        densities[char] = (exempt && exempt.has(char)) ? dNatural : tier + 1; // provisional fallback; overwritten if a later neighbor rescues it
      } else {
        densities[char] = clamp(densityBestCase(char), char); // no neighbor could ever help — settle immediately, never placed
        unconditionalChars.push(char);
      }
    }
    return { placedOrder: placedOrder.slice(seedOffset), leftoverQueue: queue.slice(), unconditionalChars };
  }

  // Internal stabilization: any entry whose true seq-neighbor differs
  // from what the forward pass had to guess (a later splice landed
  // between it and its assumed partner) gets removed. The sequence's
  // own last entry is skipped here — it has no seq-internal next to
  // check at all — and handled separately by resolveQueueBlock below.
  function stabilizeInternal(densities, seq, tier, seedPrev) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < seq.length; i++) {
        const char = seq[i];
        if (i === seq.length - 1) continue;
        const prev = i > 0 ? seq[i - 1] : seedPrev;
        const next = seq[i + 1];
        const d = computeDensity(char, prev, next);
        if (d > tier) {
          densities[char] = d;
          seq.splice(i, 1);
          changed = true;
          break; // restart against the now-shorter sequence
        }
      }
    }
    return seq;
  }

  /** The round's own last entry never had a real next during the
   * forward pass. It's checked against the true first UNCONDITIONALLY
   * dense candidate (`densityBestCase(c) > tier` — no possible rescue
   * by anyone, ever) as its real eventual right-side neighbor; if that
   * fails, it's peeled off `seq` and prepended to a queue block,
   * repeating since peeling exposes a new last entry with the same
   * gap. This block never gets spliced into or mixed with the
   * unconditionally-dense group — a kanji that's merely stuck at the
   * edge (like 所, 政, 現 today, none of them unconditionally dense)
   * gets a genuine chance to fit among ITS OWN kind, not among kanji
   * that could never have been rescued by anyone regardless. Combined
   * with the forward pass's own leftover queue (never rescued by a
   * real front-section settlement), the whole block is resolved by
   * SEARCHING EVERY ARRANGEMENT of its members — the same permutation
   * search already used elsewhere for row ordering — picking whichever
   * resolves the most members to true density 0, tie-broken by the
   * lowest worst remaining density, tie-broken again by staying
   * closest to natural `order`. Only the block's LAST member borders
   * the unconditionally-dense group, on its right side. */
  function resolveQueueBlock(densities, seq, tier, seedPrev, roundChars, leftoverQueue) {
    const queueBlock = leftoverQueue.slice();
    let changed = true;
    while (changed && seq.length) {
      changed = false;
      const lastEntry = seq[seq.length - 1];
      const prevForLast = seq.length > 1 ? seq[seq.length - 2] : seedPrev;
      const unconditionallyDense = roundChars.filter(c => !seq.includes(c) && !queueBlock.includes(c) && densityBestCase(c) > tier)
        .sort((a, b) => orderOf[a] - orderOf[b]);
      const rightCandidate = unconditionallyDense.length ? unconditionallyDense[0] : null;
      const d = rightCandidate ? computeDensity(lastEntry, prevForLast, rightCandidate) : densityBestCase(lastEntry);
      if (d > tier) {
        seq.pop();
        queueBlock.unshift(lastEntry);
        changed = true;
      }
    }
    if (queueBlock.length === 0) return { seq, queueOrder: [] };
    if (queueBlock.length === 1) {
      const char = queueBlock[0];
      const prev = seq.length ? seq[seq.length - 1] : seedPrev;
      const unconditionallyDense = roundChars.filter(c => !seq.includes(c) && c !== char && densityBestCase(c) > tier)
        .sort((a, b) => orderOf[a] - orderOf[b]);
      const next = unconditionallyDense.length ? unconditionallyDense[0] : null;
      densities[char] = computeDensity(char, prev, next);
      return { seq, queueOrder: queueBlock };
    }

    const leftBorder = seq.length ? seq[seq.length - 1] : seedPrev;
    const unconditionallyDense = roundChars.filter(c => !seq.includes(c) && !queueBlock.includes(c))
      .sort((a, b) => orderOf[a] - orderOf[b]);
    const rightBorder = unconditionallyDense.length ? unconditionallyDense[0] : null;

    function densitiesFor(perm) {
      const chain = [leftBorder, ...perm, rightBorder].filter(x => x !== null);
      const rightOffset = rightBorder !== null ? 1 : 0;
      const ds = [];
      for (let i = 1; i < chain.length - rightOffset; i++) ds.push(computeDensity(chain[i], chain[i - 1], chain[i + 1]));
      return ds;
    }
    const naturalSorted = queueBlock.slice().sort((a, b) => orderOf[a] - orderOf[b]);
    const naturalIdx = new Map(naturalSorted.map((c, i) => [c, i]));
    // Pathological guard, unreached in this dataset: fall back to
    // natural order rather than a factorial-sized search.
    const permCandidates = queueBlock.length <= 7 ? permutationsOf(queueBlock) : [naturalSorted];
    let best = null;
    for (const perm of permCandidates) {
      const ds = densitiesFor(perm);
      const cand = { perm, zeroCount: ds.filter(d => d <= tier).length, maxD: Math.max(...ds), dist: inversionCount(perm.map(c => naturalIdx.get(c))) };
      if (!best || cand.zeroCount > best.zeroCount ||
          (cand.zeroCount === best.zeroCount && cand.maxD < best.maxD) ||
          (cand.zeroCount === best.zeroCount && cand.maxD === best.maxD && cand.dist < best.dist)) best = cand;
    }
    const chain = [leftBorder, ...best.perm, rightBorder].filter(x => x !== null);
    const rightOffset = rightBorder !== null ? 1 : 0;
    for (let i = 1; i < chain.length - rightOffset; i++) densities[chain[i]] = computeDensity(chain[i], chain[i - 1], chain[i + 1]);
    return { seq, queueOrder: best.perm };
  }

  function resolveOneRound(densities, candidates, tier, floor, seedPrev, exempt) {
    const forward = resolveRound(densities, candidates, tier, floor, seedPrev, exempt);
    const seq = stabilizeInternal(densities, forward.placedOrder, tier, seedPrev);
    const { seq: seqFinal, queueOrder } = resolveQueueBlock(densities, seq, tier, seedPrev, candidates, forward.leftoverQueue);
    return { order: [...seqFinal, ...queueOrder], queueOrder, unconditionalChars: forward.unconditionalChars };
  }

  const densities = {};

  // Round 0: dense vs. not, over every kanji in `order`.
  const round0 = resolveOneRound(densities, allChars, 0, 0, null, null);
  const round0Order = round0.order;

  // Round 1: stay dense-1 vs. escalate to dense-2, over everyone round
  // 0 didn't place, in (density, order) order. Floor 1 protects kanji
  // round 0 genuinely confirmed dense (they can't be pulled back to
  // dense-0 here just because tail neighbors happen to be short), but
  // exempts round 0's own resolved queue-block members — their real
  // density was already settled by that block's own search, not by
  // round 0's tier-0 forward pass, so it's not "confirmed dense-1" in
  // the sense the floor is protecting. Seeded with round 0's real last
  // front-section kanji.
  const tailChars = allChars.filter(c => !round0Order.includes(c))
    .sort((a, b) => densities[a] - densities[b] || orderOf[a] - orderOf[b]);
  const round0QueueExempt = new Set(round0.queueOrder);
  const frontLast = round0Order.length ? round0Order[round0Order.length - 1] : null;
  let round1Order = [], round1 = null;
  if (tailChars.length > 1) {
    round1 = resolveOneRound(densities, tailChars, 1, 1, frontLast, round0QueueExempt);
    round1Order = round1.order;
  }

  // Anyone round 1 didn't place is past dense-1 (today, only 生) — no
  // further round exists to reposition them, so they just sort by
  // (density, order), same as the dense tail always has.
  const beyond = sorted.filter(k => densities[k.char] > 1 && !round1Order.includes(k.char))
    .sort((a, b) => densities[a.char] - densities[b.char] || a.order - b.order).map(k => k.char);

  const finalOrder = [...round0Order, ...round1Order, ...beyond];
  const positions = Object.fromEntries(finalOrder.map((c, i) => [c, i]));

  // Classification, for debug/dev styling (see markDensityResolutionClasses):
  // a kanji that ended up dense (density > 0) either got there through a
  // queue block's own search (genuinely rescuable in principle, resolved
  // among its own kind — round 0's block, or round 1's if one ever forms)
  // or was unconditionally dense. Queue membership can't repeat across
  // rounds — a char resolved by round 0's queue block is placed into
  // round0Order, which excludes it from round 1's tailChars entirely —
  // so earliest-match is fine there. Unconditional is different:
  // unconditionalChars is NEVER added to placedOrder/round0Order, so an
  // unconditional-at-round-0 char (densityBestCase already past tier 0)
  // still flows into round 1's tailChars and gets RE-CHECKED against
  // round 1's own, more lenient tier — most such kanji (上/下/明/理) have
  // a best case of exactly 1, which now fits (tier 1), so round 1
  // reclassifies them as queue instead. 生 is the one exception (its kun
  // alone — 3 columns, levelFor hits 2 before any neighbor is even
  // considered — already exceeds tier 1 too), so it lands in BOTH
  // round0.unconditionalChars and round1.unconditionalChars. The
  // classification this reports is meant to be "how far did this kanji
  // actually get bumped," so for unconditional specifically this has to
  // be the LAST round it appears in, not the first — iterated in
  // reverse, rather than forward-with-early-return like the queue loop
  // above it.
  const rounds = [round0, round1].filter(Boolean);
  const classification = {};
  sorted.forEach(k => {
    const char = k.char;
    if (densities[char] <= 0) return;
    for (let r = 0; r < rounds.length; r++) {
      if (rounds[r].queueOrder.includes(char)) { classification[char] = { type: 'queue', round: r }; return; }
    }
    for (let r = rounds.length - 1; r >= 0; r--) {
      if (rounds[r].unconditionalChars.includes(char)) { classification[char] = { type: 'unconditional', round: r }; return; }
    }
  });

  return { positions, classification, densities };
}

// Cached wrapper — computeDensityPreviewUncached()'s entire output
// (measurement AND the round-based density/position resolution that
// follows it) depends only on measurementFingerprint()'s inputs, never
// on densityFitStrategy (see that function's own comment), so a toggle
// flip can reuse this wholesale instead of redoing any of it. A stale
// read is only possible if the fingerprint is byte-identical to a real
// change, which it structurally can't be. forceRecalculateDensity()
// (wired to the nav's "Recalculate" button) clears this explicitly, for
// whenever you want a guaranteed-fresh recomputation regardless.
let densityPreviewCache = { fingerprint: null, result: null };
function computeDensityPreview() {
  const fingerprint = measurementFingerprint();
  if (densityPreviewCache.fingerprint === fingerprint) return densityPreviewCache.result;
  const result = computeDensityPreviewUncached();
  densityPreviewCache = { fingerprint, result };
  return result;
}
function forceRecalculateDensity() {
  densityPreviewCache = { fingerprint: null, result: null };
  return computeDensityPreview();
}

/** Debug/dev aid: marks each dense card with which resolution path
 * produced it, per `computeDensityPreview()`'s `classification` —
 * `densityQueueR{N}` for a kanji resolved through round N's queue
 * block (genuinely rescuable in principle, like 政/現, resolved among
 * its own kind), `densityUnconditionalR{N}` for one that was dense the
 * moment its best case was first checked, no neighbor ever a
 * possibility (like 上/下/明/生). A card gets at most one of these;
 * density-0 kanji get neither. Re-run on every full render and after
 * every edit, same as the other post-render passes, since editing a
 * kanji's readings can change which class (or round) applies to it or
 * its neighbors.
 *
 * Takes `classification` as a parameter rather than calling
 * computeDensityPreview() itself — every caller also needs that same
 * function's `densities` for capCardReadingOverflow's own column-cap
 * sizing, and computeDensityPreview is an expensive full-grid
 * measurement pass (isolated off-DOM rendering for every kanji); each
 * caller computes it once and shares the result between both. */
function markDensityResolutionClasses(classification) {
  document.querySelectorAll('#kanji-grid .kc:not(.legendCard)').forEach(card => {
    [...card.classList].filter(c => /^density(Queue|Unconditional)R\d+$/.test(c)).forEach(c => card.classList.remove(c));
  });
  Object.entries(classification).forEach(([char, { type, round }]) => {
    const card = document.getElementById('kc-' + char);
    if (card) card.classList.add(`density${type === 'queue' ? 'Queue' : 'Unconditional'}R${round}`);
  });
}

/** Rebuilds every card — used by the "Extensive components" toggle,
 * since which of a kanji's two components fields shows is decided at
 * buildCard() time, not by a pure-CSS class switch. */
function rerenderAllCards() {
  appState.kanji.forEach(k => rerenderCard(k.char));
  appState.customKanji.forEach(k => rerenderCard(k.char));
}

/** Rebuild one card's whole DOM from appState — the single "apply an
 * edit" step every save function below ends with, appending a brand-
 * new custom kanji's card (no existing #kc-<char> yet) the same way it
 * replaces an edited real one. Also re-runs initCard() (real stroke
 * data, same as any card — see loadKanji/loadKanjiMulti) and
 * markR2Columns, since both need to happen on fresh DOM. */
function rerenderCard(char) {
  const grid   = document.getElementById('kanji-grid');
  const custom = isCustomKanji(char);
  const k = custom ? appState.customKanji.find(c => c.char === char) : findBaseKanji(char);
  if (!k) return;
  const id = 'kc-' + char;
  const wordsForChar = custom ? { [char]: appState.customWords[char] || [] } : appState.words;
  const html = buildCard(k, wordsForChar, appState.moraInfo, appState.kanjiOverrides, appState.wordOverrides);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html.trim();
  const newCard = wrapper.firstElementChild;
  const old = document.getElementById(id);
  if (old) old.replaceWith(newCard); else grid.appendChild(newCard);
  initCard(newCard);
  resortGridCards();
  // Whole-grid pass, not just newCard: editing this card's content (or
  // moving it) can change what's on either side of ANY of its
  // neighbors too, and resortGridCards may have changed who's actually
  // adjacent to whom. See the matching comment in init() for why
  // applyRowRescueSwaps must run before capCardReadingOverflow, and why
  // setTimeout rather than requestAnimationFrame (rAF doesn't fire at
  // all in a background/inactive tab). Coalesced: rerenderAllCards
  // calls this ~120 times in one go, and each whole-grid pass is slow
  // (computeDensityPreview), so only the first call schedules one.
  if (gridPassPending) return;
  gridPassPending = true;
  setTimeout(() => {
    gridPassPending = false;
    applyRowRescueSwaps();
    const { classification, densities } = computeDensityPreview();
    document.querySelectorAll('#kanji-grid .kc:not(.legendCard)').forEach(card =>
      capCardReadingOverflow(card, densities[card.dataset.kanji] || 0));
    markDensityResolutionClasses(classification);
    SheetExplorer.refresh();
  }, 0);
}
let gridPassPending = false;

/** Both "Export additions" and "Reset all changes" only make sense
 * once there's actually something local to act on — same emptiness
 * check drives both buttons' disabled state. */
function updateDataButtonsVisibility() {
  const isEmpty = Object.keys(appState.kanjiOverrides).length === 0
    && Object.keys(appState.wordOverrides).length === 0
    && appState.customKanji.length === 0
    && Object.keys(appState.customWords).length === 0;
  const exportBtn = document.getElementById('exportAdditionsBtn');
  const resetBtn  = document.getElementById('resetDataBtn');
  if (exportBtn) exportBtn.disabled = isEmpty;
  if (resetBtn)  resetBtn.disabled  = isEmpty;
}

/** "Reset all changes" — wipes every edit/addition this browser has
 * made (kanjiOverrides, wordOverrides, customKanji, customWords) back
 * to whatever's committed in data/*.json, across every tab on this
 * origin, not just this one — localStorage is origin-scoped, not
 * tab-scoped, which is exactly the surprise this button exists to let
 * someone undo. Confirmed first since it's unrecoverable (no undo
 * once these keys are gone); settings (confirmOverwrite/editMode
 * toggles) are left alone, since those are UI preferences, not kanji
 * data. Reloads afterward rather than patching the DOM — simplest way
 * to guarantee every card (including any custom ones that need to
 * disappear entirely) ends up rebuilt from the same source of truth
 * init() already uses. */
function resetAllData() {
  if (!confirm('Reset all local changes and additions? This clears every edit and custom kanji saved in this browser and cannot be undone.')) return;
  localStorage.removeItem(KANJI_OVERRIDES_KEY);
  localStorage.removeItem(WORD_OVERRIDES_KEY);
  localStorage.removeItem(CUSTOM_KANJI_KEY);
  localStorage.removeItem(CUSTOM_WORDS_KEY);
  location.reload();
}

/** A custom kanji's fields never prompt (nothing real to overwrite);
 * an existing one's does, unless the nav menu's toggle turned it off. */
function confirmFieldEdit(char, label) {
  if (isCustomKanji(char)) return true;
  if (!appState.settings.confirmOverwrite) return true;
  return window.confirm(`Save this change to ${char}'s ${label}? (Stays only in your browser until exported from the nav menu.)`);
}

function getCurrentFieldValue(char, field) {
  const custom = isCustomKanji(char);
  const rec = custom ? appState.customKanji.find(k => k.char === char) : findBaseKanji(char);
  if (!rec) return OVERRIDABLE_ARRAY_FIELDS.has(field) ? [] : '';
  if (custom) return rec[field];
  const ov = appState.kanjiOverrides[char];
  return (ov && ov[field] !== undefined) ? ov[field] : rec[field];
}

function saveFieldEdit(char, field, value) {
  if (isCustomKanji(char)) {
    const rec = appState.customKanji.find(k => k.char === char);
    rec[field] = value;
    saveLocal(CUSTOM_KANJI_KEY, appState.customKanji);
  } else {
    appState.kanjiOverrides[char] = appState.kanjiOverrides[char] || {};
    appState.kanjiOverrides[char][field] = value;
    saveLocal(KANJI_OVERRIDES_KEY, appState.kanjiOverrides);
  }
  updateDataButtonsVisibility();
}

function selectAllText(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Click any [data-field] element (variants, components, on, onAdd,
 * kun, kunAdd, name, meaning — buildCard) to edit it in place. Array
 * fields become a contenteditable filled with the current values
 * comma-joined; save re-splits on comma and trims into an array.
 * Enter or blur saves, Escape cancels — either way ends in
 * rerenderCard(), which both applies a save and (since it rebuilds
 * from unchanged appState) cleanly discards a cancel, no separate
 * revert logic needed. No-op entirely while edit mode (#editModeToggle,
 * initNavMenu) is off.
 */
function initFieldEditing() {
  document.addEventListener('click', e => {
    if (!appState.settings.editMode) return;
    const el = e.target.closest('[data-field]');
    if (!el || el.isContentEditable) return;
    const { char, field } = el.dataset;
    const isArray = OVERRIDABLE_ARRAY_FIELDS.has(field);
    const current = getCurrentFieldValue(char, field);
    const originalText = isArray ? (current || []).join(', ') : (current || '');
    el.textContent = originalText;
    el.contentEditable = 'true';
    el.classList.add('editing');
    el.focus();
    selectAllText(el);

    const finish = commit => {
      el.removeEventListener('keydown', onKeydown);
      el.removeEventListener('blur', onBlur);
      // Leaving the field with its text unchanged from what it started
      // with isn't an edit — skip both the save and (more importantly)
      // the confirm-before-overwrite prompt, so merely clicking into a
      // field and clicking away again never interrupts you.
      if (commit && el.textContent.trim() !== originalText.trim()) {
        const raw = el.textContent.trim();
        const value = isArray ? raw.split(',').map(s => s.trim()).filter(Boolean) : raw;
        if (confirmFieldEdit(char, field)) saveFieldEdit(char, field, value);
      }
      rerenderCard(char);
    };
    const onKeydown = ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); }
      else if (ev.key === 'Escape') { finish(false); }
    };
    const onBlur = () => finish(true);
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('blur', onBlur);
  });
}

/** This kanji's full word list — words.json/customWords with any
 * wordOverrides folded in (by matching .word text, same as buildCard's
 * own merge) — NOT just the 3 featured in frequentWord. Shared by
 * getWordSlotsForEdit (which slot shows what) and the "existing word"
 * picker (initAddKanjiModal), which lets an edit reach any of a real
 * kanji's words, not only the ones already featured on the card. */
function getMergedWordEntries(char) {
  const custom = isCustomKanji(char);
  const wOvForChar = (appState.wordOverrides && appState.wordOverrides[char]) || {};
  const wordsForChar = custom ? (appState.customWords[char] || []) : ((appState.words && appState.words[char]) || []);
  const merged = [...wordsForChar];
  Object.keys(wOvForChar).forEach(idxStr => {
    const ov = wOvForChar[idxStr];
    const pos = merged.findIndex(e => e.word === ov.word);
    if (pos >= 0) merged[pos] = ov; else merged.push(ov);
  });
  return merged;
}

function saveWordSlot(char, idx, wordObj) {
  const full = { ...wordObj, selfAdded: true };
  if (isCustomKanji(char)) {
    appState.customWords[char] = appState.customWords[char] || [];
    appState.customWords[char][idx] = full;
    saveLocal(CUSTOM_WORDS_KEY, appState.customWords);
  } else {
    appState.wordOverrides[char] = appState.wordOverrides[char] || {};
    appState.wordOverrides[char][idx] = full;
    saveLocal(WORD_OVERRIDES_KEY, appState.wordOverrides);
  }
  updateDataButtonsVisibility();
}

/**
 * The small "pos" popup under the edit button (buildCard) — the quick
 * path to reposition one kanji without opening the full edit modal.
 * Document-delegated (cards get rebuilt/replaced by rerenderCard, so a
 * per-element listener would be lost the moment this exact input is
 * edited). Commits on 'change' (fires on blur when the value actually
 * moved) — Enter forces that blur immediately rather than waiting for
 * the user to click elsewhere. Deliberately skips the confirm-before-
 * overwrite prompt every other field edit goes through: position is
 * this app's own display arrangement, not verified dictionary data
 * that prompt exists to protect, and the entire point of a hover-and-
 * type popup instead of the modal is that it's immediate.
 */
function initPositionQuickEdit() {
  const commit = input => {
    const char = input.closest('.positionQuickPopup').dataset.char;
    moveKanjiToPosition(char, Number(input.value));
  };
  document.addEventListener('change', e => {
    if (e.target.matches('.positionQuickInput')) commit(e.target);
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches('.positionQuickInput') && e.key === 'Enter') e.target.blur();
  });
}

/**
 * Three things live here, all document-delegated: a .wordKanji chip
 * (r-top) forwarding its click to the matching .wordMeaning trigger
 * (r-bot) rather than opening a popup of its own; that trigger's own
 * popup (opened by initPopups() generically, since it's a real
 * .popupTrigger) getting its Save/Cancel wired up; and .addWordBtn
 * (custom kanji only) appending a new blank slot and immediately
 * opening its editor.
 */
function initWordSlotEditing() {
  // .wordMeaning is a generic .popupTrigger (see initPopups) — while
  // edit mode is off, its popup (the word-slot editor form) needs to
  // stay closed too, so this runs in the capture phase, ahead of
  // initPopups' own bubble-phase listener, and stops the click from
  // ever reaching it. The .wordKanji chip's click-forward (below) goes
  // through .wordMeaning's own click() and so is covered by this too.
  document.addEventListener('click', e => {
    if (!appState.settings.editMode && e.target.closest('.wordMeaning')) e.stopPropagation();
  }, true);

  document.addEventListener('click', e => {
    const addBtn = e.target.closest('.addWordBtn');
    if (addBtn) {
      if (!appState.settings.editMode) return;
      const { char } = addBtn.dataset;
      const rec = appState.customKanji.find(k => k.char === char);
      if (!rec) return;
      const idx = rec.frequentWord.length;
      rec.frequentWord.push(idx);
      rec.frequentWordMeaning.push('');
      saveLocal(CUSTOM_KANJI_KEY, appState.customKanji);
      appState.customWords[char] = appState.customWords[char] || [];
      appState.customWords[char][idx] = { word: '', kana: '', meaning: [''], pos: null, jlpt: null, pitch: null, selfAdded: true };
      saveLocal(CUSTOM_WORDS_KEY, appState.customWords);
      rerenderCard(char);
      return;
    }

    const chip = e.target.closest('.wordKanji[data-idx]');
    if (chip) {
      const { char, idx } = chip.dataset;
      const trigger = document.querySelector(`.wordMeaning[data-char="${CSS.escape(char)}"][data-idx="${CSS.escape(idx)}"]`);
      if (trigger) trigger.click();
      return;
    }

    const saveBtn   = e.target.closest('.wsSave');
    const cancelBtn = e.target.closest('.wsCancel');
    if (!saveBtn && !cancelBtn) return;
    const popup   = e.target.closest('.wordSlotPopup');
    const trigger = popup.parentElement.querySelector('.wordMeaning');
    const { char, idx } = trigger.dataset;
    if (saveBtn) {
      const word = popup.querySelector('.wsWord').value.trim();
      if (!word) { alert('Word text is required.'); return; }
      const wordObj = {
        word,
        kana: popup.querySelector('.wsKana').value.trim(),
        pitch: popup.querySelector('.wsPitch').value === '' ? null : Number(popup.querySelector('.wsPitch').value),
        pos: popup.querySelector('.wsPos').value.trim() || null,
        jlpt: popup.querySelector('.wsJlpt').value.trim() || null,
        meaning: [popup.querySelector('.wsMeaning').value.trim()],
      };
      if (confirmFieldEdit(char, `word #${Number(idx) + 1}`)) saveWordSlot(char, idx, wordObj);
    }
    closePopups();
    rerenderCard(char);
  });
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAdditions() {
  downloadJSON('kanjiOverrides.json', { overrides: appState.kanjiOverrides, custom: appState.customKanji });
  downloadJSON('wordOverrides.json', { overrides: appState.wordOverrides, custom: appState.customWords });
}

/** Array-valued modal fields -> the <input> holding each, comma-
 * separated (same split/trim/filter every other array field's
 * click-to-edit already uses — see initFieldEditing). */
const ADD_KANJI_FIELD_INPUTS = {
  variants: 'akVariants', components: 'akComponents', componentsExtensive: 'akComponentsExtensive',
  on: 'akOn', onAdd: 'akOnAdd', kun: 'akKun', kunAdd: 'akKunAdd', name: 'akName',
};

/** kunMeaning/kunAddMeaning are parallel-indexed to kun/kunAdd (index i
 * is reading i's gloss) — one labeled input per CURRENT reading,
 * exactly the same idea as "All words" giving each word its own
 * fields rather than one bulk field for all of them (see
 * buildWordEntryHTML, initAddKanjiModal below), just regenerated live
 * from the matching kun'yomi/kun'yomi (extra) textarea instead of a
 * "+ Add" button, since the reading list itself already lives there.
 * `container` holds the generated inputs. kunAddMeaning's `fieldWrapper`
 * is its whole row (reading-label-plus-inputs), kept hidden by default
 * (most kanji don't have any kunAdd meanings filled in yet, unlike
 * kunMeaning, which almost always does) and revealed in openForEdit
 * (there's already at least one filled in) or the moment akKunAdd gets
 * focused (see revealKunAddMeaningField below) — giving a kanji with
 * no kunAddMeaning yet a way to get its first one without a
 * permanently-visible, almost-always-empty row for every other kanji. */
const KUN_MEANING_FIELDS = {
  kunMeaning:    { readingField: 'kun',    readingInput: 'akKun',    container: 'akKunMeanings' },
  kunAddMeaning: { readingField: 'kunAdd', readingInput: 'akKunAdd', container: 'akKunAddMeanings', fieldWrapper: 'akKunAddMeaningField' },
};

/**
 * "+ Add kanji" opens a full-screen modal with every field for a
 * brand-new custom kanji at once, or every field for an EXISTING kanji
 * (opened via the per-card edit button) — same form either way, just
 * pre-filled and re-titled for edit, with the character locked
 * (changing it would mean creating a different kanji entirely, not
 * editing this one). Two separate word sections: "Frequent words" is
 * just 3 pickers (which word — by real position in this kanji's full
 * word list — fills each of the 3 slots shown on the card, plus that
 * slot's own short gloss); "All words" lists and edits every word this
 * kanji actually has, dynamically (however many there are, not capped
 * at 3), completely decoupled from which ones happen to be featured.
 * Adding reuses the exact same append/render path the old flow did
 * (rerenderCard appends when there's no existing #kc-<char> yet);
 * editing reuses saveFieldEdit/saveWordSlot, the same functions
 * click-to-edit uses field-by-field, just called once per field here
 * instead of from a click handler — and, since that's a lot of fields
 * to overwrite at once, asks once (not once per field) before doing it
 * to an existing real kanji.
 */

// ── Poster / print layout ───────────────────────────────────────
// Card size (--card-size, 280px) never changes; the grid's own WIDTH
// does, via a temporary inline style layered on top of the base 7300px
// CSS rule (removed again by exitPosterMode). Everything downstream —
// how many cards land per row, how tall a row is, where row 2 starts —
// is measured live off the real rendered DOM rather than computed from
// hardcoded pixel constants, so this keeps working if --card-size or
// the base grid width ever changes.

/** Real kanji chars (base + custom), in effective position order —
 * same ordering `measureAllColumnsLive`/`moveKanjiToPosition` already
 * use, pulled out here since both the poster math and the panel's live
 * summary need it. */
function allCharsByPosition() {
  return [...appState.kanji, ...appState.customKanji]
    .map(k => k.char)
    .sort((a, b) => {
      const pa = getEffectivePosition(a), pb = getEffectivePosition(b);
      if (pa !== pb) return pa - pb;
      return getEffectiveOrder(a) - getEffectiveOrder(b);
    });
}

/** How many real CSS pixels one centimeter renders as right now — a
 * live probe rather than a hardcoded 96px/2.54cm constant, so this
 * stays correct regardless of zoom or any future unit-handling change. */
function pxPerCm() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute; visibility:hidden; height:1cm; width:0;';
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

/** Narrows #kanji-grid to `widthCm` x `heightCm` and hides whichever
 * kanji don't fit, dropping the least-frequent (highest effective
 * position) first — except `forcedChars`, which are always kept even if
 * that pushes the total past the nominal capacity (see the poster
 * panel's own warning for that case). Returns a summary for the panel's
 * live readout. */
function applyPosterConfig(widthCm, heightCm, forcedChars) {
  const grid = document.getElementById('kanji-grid');
  const allChars = allCharsByPosition();

  // Clear any previous poster filter first so the measurement below
  // reflects ONLY the new width, not a previous configuration's leftovers.
  grid.style.width = '';
  document.querySelectorAll('#kanji-grid .kc.posterOmitted').forEach(el => el.classList.remove('posterOmitted'));
  grid.style.width = widthCm + 'cm';

  // The legend card (first in DOM, excluded from `rects` by :not(.legendCard)
  // but still a real flex item taking up its own — much wider — room in
  // row 1) can make row 1 hold noticeably fewer real cards than every
  // later row. Measuring columns/row-height from row 2 onward sidesteps
  // that skew entirely; row 1 alone is used only if there's nothing else
  // (everything fit in one row).
  const cardEls = [...grid.querySelectorAll('.kc:not(.legendCard)')];
  const rects = cardEls.map(el => ({ el, char: el.dataset.kanji, top: el.getBoundingClientRect().top }));
  const firstTop = rects[0].top;
  const secondTop = rects.find(r => r.top !== firstTop)?.top;
  const referenceTop = secondTop != null ? secondTop : firstTop;
  const columns = rects.filter(r => r.top === referenceTop).length;
  const thirdTop = rects.find(r => r.top !== firstTop && r.top !== secondTop)?.top;
  const rowHeightPx = thirdTop != null ? thirdTop - secondTop
    : (secondTop != null ? secondTop - firstTop : rects[0].el.getBoundingClientRect().height);
  const maxRows = Math.max(1, Math.floor((heightCm * pxPerCm()) / rowHeightPx));
  // Row 1 itself holds fewer real cards than `columns` (the legend card
  // sits there too, ahead of every real one) — capacity has to account
  // for that, or a purely-capacity-filled set would silently overflow
  // row 1's shortfall into an extra row beyond heightCm.
  const row1Count = rects.filter(r => r.top === firstTop).length;
  const capacity = maxRows === 1 ? row1Count : row1Count + columns * (maxRows - 1);

  const forcedSet = new Set(forcedChars.filter(c => allChars.includes(c)));
  const included = new Set(forcedSet);
  for (const c of allChars) {
    if (included.size >= capacity) break;
    included.add(c);
  }
  const warning = forcedSet.size > capacity;

  const visibleEls = [];
  for (const r of rects) {
    const show = included.has(r.char);
    r.el.classList.toggle('posterOmitted', !show);
    if (show) visibleEls.push(r.el);
  }

  appState.posterConfig = { active: true, widthCm, heightCm, forcedChars: [...forcedSet] };
  saveLocal(POSTER_CONFIG_KEY, { widthCm, heightCm, forcedChars: [...forcedSet] });
  document.body.classList.add('posterMode');

  // Same post-render pipeline init()/rerenderCard() already use — both
  // applyRowRescueSwaps and computeDensityPreview are content-agnostic
  // (they read whatever's actually in appState/the live DOM), so they
  // resolve collisions correctly for this narrower set with no changes
  // of their own. capCardReadingOverflow only runs on the visible cards
  // — a hidden (display:none) card has no real rendered size to cap.
  setTimeout(() => {
    applyRowRescueSwaps();
    const { classification, densities } = computeDensityPreview();
    visibleEls.forEach(card => capCardReadingOverflow(card, densities[card.dataset.kanji] || 0));
    markDensityResolutionClasses(classification);
    SheetExplorer.refresh();
  }, 0);

  return { includedCount: included.size, omittedCount: allChars.length - included.size, columns, maxRows, capacity, warning };
}

/** Inverse of applyPosterConfig — back to the normal, full, default-width view. */
function exitPosterMode() {
  const grid = document.getElementById('kanji-grid');
  grid.style.width = '';
  document.querySelectorAll('#kanji-grid .kc.posterOmitted').forEach(el => el.classList.remove('posterOmitted'));
  document.body.classList.remove('posterMode');
  appState.posterConfig.active = false;

  setTimeout(() => {
    applyRowRescueSwaps();
    const { classification, densities } = computeDensityPreview();
    document.querySelectorAll('#kanji-grid .kc:not(.legendCard)').forEach(card =>
      capCardReadingOverflow(card, densities[card.dataset.kanji] || 0));
    markDensityResolutionClasses(classification);
    SheetExplorer.refresh();
  }, 0);
}

function initPosterPanel() {
  const overlay      = document.getElementById('posterModal');
  const openBtn       = document.getElementById('posterBtn');
  const widthInput    = document.getElementById('posterWidthCm');
  const heightInput   = document.getElementById('posterHeightCm');
  const forcedInput   = document.getElementById('posterForcedChars');
  const summaryEl     = document.getElementById('posterSummary');
  const previewBtn    = document.getElementById('posterPreviewBtn');
  const printBtn      = document.getElementById('posterPrintBtn');
  const exitBtn       = document.getElementById('posterExitBtn');
  const closeBtn      = document.getElementById('posterCloseBtn');

  function close() { overlay.hidden = true; }
  function open() {
    const cfg = appState.posterConfig;
    if (cfg.widthCm != null) widthInput.value = cfg.widthCm;
    if (cfg.heightCm != null) heightInput.value = cfg.heightCm;
    forcedInput.value = (cfg.forcedChars || []).join(' ');
    printBtn.disabled = !cfg.active;
    exitBtn.disabled = !cfg.active;
    summaryEl.textContent = '';
    overlay.hidden = false;
  }
  function parseForcedChars() {
    return [...new Set([...forcedInput.value].filter(c => /\S/.test(c)))];
  }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) close(); });

  previewBtn.addEventListener('click', () => {
    const widthCm = Number(widthInput.value), heightCm = Number(heightInput.value);
    if (!(widthCm > 0) || !(heightCm > 0)) { summaryEl.textContent = 'Enter a width and height greater than 0.'; summaryEl.classList.add('posterWarning'); return; }
    const result = applyPosterConfig(widthCm, heightCm, parseForcedChars());
    summaryEl.classList.toggle('posterWarning', result.warning);
    summaryEl.textContent = result.warning
      ? `Your "always include" list alone (${result.includedCount}) is larger than this size's capacity of ${result.capacity} (${result.columns} columns x ${result.maxRows} rows). Every forced kanji is shown anyway — nothing else fits, so ${result.omittedCount} kanji are omitted.`
      : `${result.columns} columns x ${result.maxRows} rows (${result.capacity} capacity) — ${result.includedCount} of ${result.includedCount + result.omittedCount} shown, ${result.omittedCount} omitted.`;
    printBtn.disabled = false;
    exitBtn.disabled = false;
  });

  printBtn.addEventListener('click', () => window.print());

  exitBtn.addEventListener('click', () => {
    exitPosterMode();
    printBtn.disabled = true;
    exitBtn.disabled = true;
    summaryEl.classList.remove('posterWarning');
    summaryEl.textContent = 'Exited poster mode — showing the full sheet again.';
  });
}

function initAddKanjiModal() {
  const overlay     = document.getElementById('addKanjiModal');
  const openBtn     = document.getElementById('addKanjiBtn');
  const saveBtn     = document.getElementById('addKanjiSaveBtn');
  const cancelBtn   = document.getElementById('addKanjiCancelBtn');
  const deleteBtn   = document.getElementById('addKanjiDeleteBtn');
  const charInput   = document.getElementById('akChar');
  const positionInput = document.getElementById('akPosition');
  const titleEl     = document.getElementById('addKanjiModalTitle');
  const allWordsEl  = document.getElementById('akAllWords');
  const addWordBtn  = document.getElementById('akAddWordBtn');
  const freqPickers = [0, 1, 2].map(slot => document.querySelector(`.akFreqWordPicker[data-slot="${slot}"]`));
  const glossInputs = [0, 1, 2].map(slot => document.querySelector(`.akCardGloss[data-slot="${slot}"]`));

  // null while adding a brand-new kanji; the locked character while
  // editing an existing one — save() branches on this.
  let editingChar = null;
  // Snapshot of every field's pre-filled value, taken in openForEdit,
  // so saveEdit can tell which ones the user actually touched — every
  // field/word entry gets re-populated on open otherwise (that's the
  // whole point), which would mark real, already-verified word data as
  // a selfAdded override just from opening and re-saving the form
  // without changing anything. null while adding.
  let editOriginal = null;

  function clearForm() {
    overlay.querySelectorAll('input, textarea').forEach(el => { el.value = ''; });
  }
  function close() { overlay.hidden = true; }

  function splitList(value) {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }

  function buildKunMeaningEntryHTML(reading, value) {
    return `<label class="modalKunMeaningEntry"><span class="modalKunMeaningReading">${reading}</span>` +
      `<input class="akKunMeaningInput" value="${value ? value.replace(/"/g, '&quot;') : ''}" autocomplete="off"></label>`;
  }

  /** (Re)builds one meaning container's inputs to match `readings`,
   * pre-filled from `values` (parallel-indexed; shorter than
   * `readings`, or missing, just leaves the rest blank). */
  function renderKunMeaningInputs(containerEl, readings, values) {
    containerEl.innerHTML = readings.map((r, i) => buildKunMeaningEntryHTML(r, (values || [])[i])).join('');
  }

  function currentKunMeaningValues(containerEl) {
    return [...containerEl.querySelectorAll('.akKunMeaningInput')].map(el => el.value.trim());
  }

  // One-way: once shown (existing data, or the user started typing a
  // kunAdd reading), stays visible for the rest of this modal session
  // rather than hiding again if the reading list empties back out
  // mid-edit -- flickering a row closed while someone's actively using
  // it would be worse than leaving an empty one open.
  function revealKunAddMeaningField() {
    document.getElementById(KUN_MEANING_FIELDS.kunAddMeaning.fieldWrapper).hidden = false;
  }

  /** Wired to the reading textarea's own `input` event: re-derives the
   * reading list live and regenerates the meaning container to match —
   * preserving whatever's already typed in the EXISTING meaning inputs
   * by position (not reset to the original saved data), so editing the
   * reading list mid-typing doesn't discard in-progress meaning edits. */
  function refreshKunMeaningInputs(readingInputEl, containerEl) {
    const readings = splitList(readingInputEl.value);
    const existingValues = currentKunMeaningValues(containerEl);
    renderKunMeaningInputs(containerEl, readings, existingValues);
  }

  // One row in the "All words" section: word/kana/pitch/pos/JLPT plus
  // up to 4 dictionary senses — same field shape as the old fixed word
  // slots, just generated per entry rather than 3 static copies, since
  // a kanji's real word count varies (生 has 6; a brand-new custom
  // kanji starts with 0).
  function buildWordEntryHTML() {
    return `
      <div class="modalWordEntry">
        <div class="modalWordEntryFields">
          <label class="modalWordEntryWord">word <input class="awWord" autocomplete="off"></label>
          <label class="modalWordEntryWord">pos <input class="awPos" autocomplete="off"></label>
          <label class="modalWordEntryNarrow">pitch <input class="awPitch" type="number" min="0" autocomplete="off"></label>
          <label class="modalWordEntryNarrow">JLPT
            <span class="modalJlptField"><span class="modalJlptN">N</span><input class="awJlpt" type="number" min="1" max="5" autocomplete="off"></span>
          </label>
          <label class="modalWordEntryFull">kana <input class="awKana" autocomplete="off"></label>
        </div>
        <div class="modalMeaningGroup">
          <span class="modalMeaningLabel">meaning</span>
          <textarea class="awMeaning" placeholder="sense 1" rows="1" autocomplete="off"></textarea>
          <textarea class="awMeaning" placeholder="sense 2" rows="1" autocomplete="off"></textarea>
          <textarea class="awMeaning" placeholder="sense 3" rows="1" autocomplete="off"></textarea>
          <textarea class="awMeaning" placeholder="sense 4" rows="1" autocomplete="off"></textarea>
        </div>
      </div>`;
  }

  // jlpt is stored as "N5"/"N3"/etc (a letter prefix, not a bare
  // number — words.json never has one without the N), but the field
  // itself is a number input for the digit alone, with a fixed "N"
  // shown beside it (see buildWordEntryHTML) — these two convert
  // between the two shapes.
  function jlptToDigit(jlpt) {
    const m = jlpt ? String(jlpt).match(/\d/) : null;
    return m ? m[0] : '';
  }
  function digitToJlpt(digit) {
    return digit ? 'N' + digit : null;
  }

  function fillWordEntry(entryEl, entry) {
    entryEl.querySelector('.awWord').value  = entry ? entry.word || '' : '';
    entryEl.querySelector('.awKana').value  = entry ? entry.kana || '' : '';
    entryEl.querySelector('.awPitch').value = entry && entry.pitch != null ? entry.pitch : '';
    entryEl.querySelector('.awPos').value   = entry ? entry.pos || '' : '';
    entryEl.querySelector('.awJlpt').value  = entry ? jlptToDigit(entry.jlpt) : '';
    const meaningInputs = entryEl.querySelectorAll('.awMeaning');
    const meanings = entry ? (entry.meaning || []) : [];
    meaningInputs.forEach((el, mi) => { el.value = meanings[mi] || ''; });
  }

  function entryToWordObj(entryEl) {
    const word = entryEl.querySelector('.awWord').value.trim();
    if (!word) return null;
    const pitchRaw = entryEl.querySelector('.awPitch').value;
    return {
      word,
      kana: entryEl.querySelector('.awKana').value.trim(),
      pitch: pitchRaw === '' ? null : Number(pitchRaw),
      pos: entryEl.querySelector('.awPos').value.trim() || null,
      jlpt: digitToJlpt(entryEl.querySelector('.awJlpt').value.trim()),
      meaning: [...entryEl.querySelectorAll('.awMeaning')].map(el => el.value.trim()).filter(Boolean),
      selfAdded: true,
    };
  }

  // Rebuilds every "All words" entry from this kanji's full word list
  // (getMergedWordEntries) — one block per word it actually has, not
  // capped at 3. Empty (no char yet, i.e. adding) just clears it.
  function renderAllWords(char) {
    const list = char ? getMergedWordEntries(char) : [];
    allWordsEl.innerHTML = list.map(buildWordEntryHTML).join('');
    [...allWordsEl.children].forEach((el, i) => fillWordEntry(el, list[i]));
  }

  // The 3 "Frequent words" pickers' options are every entry currently
  // in "All words" (live — including one just added via akAddWordBtn,
  // or mid-typed text in an existing entry's own word field), so a
  // slot can point at a brand-new word the moment it's typed, not only
  // ones that existed when the modal opened. Re-selecting each
  // picker's previous value only if that position still has a word;
  // otherwise it falls back to "— none —" rather than silently
  // pointing at something else.
  function refreshFreqPickerOptions() {
    const words = [...allWordsEl.children].map(el => el.querySelector('.awWord').value.trim() || '(blank)');
    const optionsHTML = words.map((w, i) => `<option value="${i}">${w}</option>`).join('');
    freqPickers.forEach(picker => {
      const prev = picker.value;
      picker.innerHTML = '<option value="">— none —</option>' + optionsHTML;
      picker.value = prev;
      if (picker.value !== prev) picker.value = '';
    });
  }

  function openForAdd() {
    editingChar = null;
    clearForm();
    charInput.disabled = false;
    deleteBtn.hidden = true;
    // Defaults to "append at the end", same as every add always has —
    // editable before saving if it should go somewhere else instead.
    positionInput.value = nextOrderValue();
    renderAllWords(null);
    refreshFreqPickerOptions();
    Object.values(KUN_MEANING_FIELDS).forEach(({ container }) => {
      document.getElementById(container).innerHTML = '';
    });
    document.getElementById(KUN_MEANING_FIELDS.kunAddMeaning.fieldWrapper).hidden = true;
    titleEl.textContent = 'Add a new kanji';
    overlay.hidden = false;
    charInput.focus();
  }

  function openForEdit(char) {
    const custom = isCustomKanji(char);
    if (!custom && !findBaseKanji(char)) return;
    editingChar = char;
    clearForm();
    charInput.value = char;
    charInput.disabled = true;
    deleteBtn.hidden = !custom;
    positionInput.value = getCurrentFieldValue(char, 'position');
    document.getElementById('akMeaning').value = getCurrentFieldValue(char, 'meaning') || '';
    Object.entries(ADD_KANJI_FIELD_INPUTS).forEach(([field, id]) => {
      document.getElementById(id).value = (getCurrentFieldValue(char, field) || []).join(', ');
    });
    Object.entries(KUN_MEANING_FIELDS).forEach(([field, { readingField, container }]) => {
      const readings = getCurrentFieldValue(char, readingField) || [];
      renderKunMeaningInputs(document.getElementById(container), readings, getCurrentFieldValue(char, field) || []);
    });
    const hasKunAddMeaning = (getCurrentFieldValue(char, 'kunAddMeaning') || []).some(Boolean);
    document.getElementById(KUN_MEANING_FIELDS.kunAddMeaning.fieldWrapper).hidden = !hasKunAddMeaning;

    renderAllWords(char);
    refreshFreqPickerOptions();
    const mergedList = getMergedWordEntries(char);
    const freqWord = getCurrentFieldValue(char, 'frequentWord') || [];
    const glosses = getCurrentFieldValue(char, 'frequentWordMeaning') || [];
    freqPickers.forEach((picker, slot) => {
      const w = freqWord[slot];
      const idx = typeof w === 'number' ? w : mergedList.findIndex(e => e.word === w);
      picker.value = idx >= 0 ? String(idx) : '';
    });
    glossInputs.forEach((input, slot) => { input.value = glosses[slot] || ''; });

    titleEl.textContent = `Edit ${char}`;
    overlay.hidden = false;

    editOriginal = {
      meaning: document.getElementById('akMeaning').value,
      position: positionInput.value,
      fields: {},
      kunMeanings: {},
      frequentWord: [...freqWord],
      glosses: [...glosses],
      // One raw-data snapshot per "All words" entry, in the SAME shape
      // saveEdit recomputes at save time — an entry added later (past
      // this original length) always reads as changed, which is
      // correct: it didn't exist when the form opened.
      allWords: mergedList.map(e => JSON.stringify({
        word: e.word, kana: e.kana || '', pitch: e.pitch != null ? e.pitch : null,
        pos: e.pos || null, jlpt: e.jlpt || null, meaning: e.meaning || [],
      })),
    };
    Object.entries(ADD_KANJI_FIELD_INPUTS).forEach(([field, id]) => {
      editOriginal.fields[field] = document.getElementById(id).value;
    });
    // Snapshot right after rendering above, by POSITION (not reading
    // text) — same reasoning as "All words": an entry added later (the
    // reading list grew since the form opened) has no original to
    // compare against, so it always reads as changed once it has text.
    Object.entries(KUN_MEANING_FIELDS).forEach(([field, { container }]) => {
      editOriginal.kunMeanings[field] = currentKunMeaningValues(document.getElementById(container));
    });
  }

  function saveNew() {
    const char = [...charInput.value.trim()][0];
    if (!char) { alert('A character is required.'); charInput.focus(); return; }
    if (findBaseKanji(char) || isCustomKanji(char)) {
      alert(`${char} is already on this page.`);
      return;
    }

    // Always starts appended at the very end (order/position both the
    // next free slot — always valid, never collides with anything) —
    // if the form's position field asks for somewhere else, that's
    // applied afterward as a real cascading move (moveKanjiToPosition),
    // once this record actually exists to be moved.
    const order = nextOrderValue();
    const desiredPosition = Number(positionInput.value);
    const rec = {
      char, order, position: order,
      meaning: document.getElementById('akMeaning').value.trim(),
    };
    Object.entries(ADD_KANJI_FIELD_INPUTS).forEach(([field, id]) => {
      rec[field] = splitList(document.getElementById(id).value);
    });
    Object.entries(KUN_MEANING_FIELDS).forEach(([field, { container }]) => {
      rec[field] = currentKunMeaningValues(document.getElementById(container));
    });

    // Blank "All words" entries are dropped entirely here (unlike
    // editing an existing kanji, there's nothing real to preserve),
    // which can shift positions — oldToNewIndex remaps each picker's
    // choice (made against the pre-drop list) to where that word
    // actually ends up.
    const oldToNewIndex = {};
    const words = [];
    [...allWordsEl.children].forEach((el, oldIdx) => {
      const w = entryToWordObj(el);
      if (!w) return;
      oldToNewIndex[oldIdx] = words.length;
      words.push(w);
    });

    rec.frequentWord = [];
    rec.frequentWordMeaning = [];
    freqPickers.forEach((picker, slot) => {
      if (picker.value === '' || !(Number(picker.value) in oldToNewIndex)) return;
      rec.frequentWord.push(oldToNewIndex[Number(picker.value)]);
      rec.frequentWordMeaning.push(glossInputs[slot].value.trim());
    });

    appState.customKanji.push(rec);
    saveLocal(CUSTOM_KANJI_KEY, appState.customKanji);
    if (words.length) {
      appState.customWords[char] = words;
      saveLocal(CUSTOM_WORDS_KEY, appState.customWords);
    }
    updateDataButtonsVisibility();
    close();
    rerenderCard(char);
    if (Number.isFinite(desiredPosition) && desiredPosition !== order) moveKanjiToPosition(char, desiredPosition);
    const el = document.getElementById('kc-' + char);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function saveEdit() {
    const char = editingChar;

    const meaningNow = document.getElementById('akMeaning').value.trim();
    const meaningChanged = meaningNow !== editOriginal.meaning.trim();
    const positionNow = Number(positionInput.value);
    const positionChanged = Number.isFinite(positionNow) && positionNow !== Number(editOriginal.position);
    const changedFields = Object.keys(ADD_KANJI_FIELD_INPUTS).filter(field => {
      const id = ADD_KANJI_FIELD_INPUTS[field];
      return document.getElementById(id).value.trim() !== editOriginal.fields[field].trim();
    });
    // Per-reading, by position (not reading text) — same reasoning as
    // "All words": compare the whole current array against the
    // snapshot taken when the form opened.
    const changedKunMeaningFields = Object.keys(KUN_MEANING_FIELDS).filter(field => {
      const container = document.getElementById(KUN_MEANING_FIELDS[field].container);
      return JSON.stringify(currentKunMeaningValues(container)) !== JSON.stringify(editOriginal.kunMeanings[field]);
    });

    // "All words" — each entry (by its position in the list, stable
    // for the lifetime of this open modal) compared against the raw
    // data it had when the form opened. An entry added afterward via
    // akAddWordBtn has no original snapshot, so it always reads as
    // changed once it has a word typed in.
    const wordChanges = [];
    [...allWordsEl.children].forEach((el, i) => {
      const obj = entryToWordObj(el);
      if (!obj) return;
      const nowRaw = JSON.stringify({
        word: obj.word, kana: obj.kana, pitch: obj.pitch, pos: obj.pos, jlpt: obj.jlpt, meaning: obj.meaning,
      });
      if (nowRaw !== editOriginal.allWords[i]) wordChanges.push(obj);
    });

    // Frequent-word slots: does frequentWord[slot] need to point
    // somewhere new (a picker was switched), and/or does that slot's
    // own short gloss need updating? Both independent of whether the
    // word's own content changed above.
    const updatedFreqWord = [...editOriginal.frequentWord];
    let freqWordChanged = false;
    freqPickers.forEach((picker, slot) => {
      if (picker.value === '') return;
      const idx = Number(picker.value);
      if (editOriginal.frequentWord[slot] !== idx) { updatedFreqWord[slot] = idx; freqWordChanged = true; }
    });
    const changedGlossIdx = glossInputs
      .map((input, slot) => (input.value.trim() !== (editOriginal.glosses[slot] || '') ? slot : -1))
      .filter(i => i >= 0);

    if (!meaningChanged && !positionChanged && !changedFields.length && !changedKunMeaningFields.length && !wordChanges.length && !freqWordChanged && !changedGlossIdx.length) {
      close();
      return;
    }

    if (!isCustomKanji(char) && appState.settings.confirmOverwrite) {
      const ok = confirm(`Save these changes to ${char}? (Stays only in your browser until exported from the nav menu.)`);
      if (!ok) return;
    }

    if (meaningChanged) saveFieldEdit(char, 'meaning', meaningNow);
    if (positionChanged) moveKanjiToPosition(char, positionNow);
    changedFields.forEach(field => {
      saveFieldEdit(char, field, splitList(document.getElementById(ADD_KANJI_FIELD_INPUTS[field]).value));
    });
    changedKunMeaningFields.forEach(field => {
      const container = document.getElementById(KUN_MEANING_FIELDS[field].container);
      saveFieldEdit(char, field, currentKunMeaningValues(container));
    });
    // Keyed by the word's own text, not its position — getMergedWordEntries
    // matches overrides by .word text regardless of what key they're
    // stored under, so this correctly replaces an existing word's data
    // (same text) or adds a brand-new one (text not seen before) alike.
    wordChanges.forEach(obj => saveWordSlot(char, obj.word, obj));
    if (freqWordChanged) saveFieldEdit(char, 'frequentWord', updatedFreqWord);
    if (changedGlossIdx.length) {
      const currentGlosses = [...(getCurrentFieldValue(char, 'frequentWordMeaning') || [])];
      changedGlossIdx.forEach(slot => { currentGlosses[slot] = glossInputs[slot].value.trim(); });
      saveFieldEdit(char, 'frequentWordMeaning', currentGlosses);
    }
    close();
    rerenderCard(char);
  }

  function deleteEditingKanji() {
    const char = editingChar;
    if (!char || !isCustomKanji(char)) return;
    if (!confirm(`Delete ${char} and everything added for it (readings, words)? This cannot be undone.`)) return;
    appState.customKanji = appState.customKanji.filter(k => k.char !== char);
    delete appState.customWords[char];
    saveLocal(CUSTOM_KANJI_KEY, appState.customKanji);
    saveLocal(CUSTOM_WORDS_KEY, appState.customWords);
    const card = document.getElementById('kc-' + char);
    if (card) card.remove();
    updateDataButtonsVisibility();
    close();
  }

  openBtn.addEventListener('click', openForAdd);
  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', () => (editingChar ? saveEdit() : saveNew()));
  deleteBtn.addEventListener('click', deleteEditingKanji);
  // Backdrop click closes, same as clicking outside any other popup —
  // only when the click target is the overlay itself, not something
  // inside .modalBox bubbling up to it.
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) close(); });
  // .editKanjiBtn is per-card (buildCard) and cards get rebuilt
  // wholesale on every edit (rerenderCard), so this is delegated on
  // document rather than bound per-button.
  document.addEventListener('click', e => {
    const btn = e.target.closest('.editKanjiBtn');
    if (btn) openForEdit(btn.dataset.char);
  });
  addWordBtn.addEventListener('click', () => {
    allWordsEl.insertAdjacentHTML('beforeend', buildWordEntryHTML());
    refreshFreqPickerOptions();
  });
  // Live — the meaning inputs regenerate to match the reading list as
  // it's typed, same as "All words" reacting to a word being typed.
  // kunAdd's reading field also reveals its (otherwise hidden-when-
  // empty) meaning row the moment it's touched — see
  // revealKunAddMeaningField's comment.
  Object.entries(KUN_MEANING_FIELDS).forEach(([field, { readingInput, container }]) => {
    const inputEl = document.getElementById(readingInput);
    inputEl.addEventListener('input', () => {
      refreshKunMeaningInputs(inputEl, document.getElementById(container));
    });
    if (field === 'kunAddMeaning') inputEl.addEventListener('focus', revealKunAddMeaningField);
  });
  // Live — a picker can point at a word the moment it's typed, not
  // only once the form is reopened.
  allWordsEl.addEventListener('input', e => {
    if (e.target.classList.contains('awWord')) refreshFreqPickerOptions();
  });
  // The card's own short gloss almost certainly doesn't describe
  // whatever word a slot was just switched to — leaving it would show
  // the NEW word paired with the OLD gloss (e.g. 生地 labelled "birth",
  // left over from 誕生). Cleared, not carried over; type a fresh one
  // for the new word if one should show.
  freqPickers.forEach((picker, slot) => {
    picker.addEventListener('change', () => { glossInputs[slot].value = ''; });
  });
}

/**
 * #navMenu is position: fixed (style.css) so it stays pinned on both
 * axes while the page scrolls sideways — position: sticky can't do
 * that here, since its containing block (body) never actually widens
 * to match #kanji-grid's own overflow (a child's overflow doesn't
 * enlarge its parent's box), leaving sticky's horizontal positioning
 * nowhere to go. fixed removes #navMenu from flow entirely though, so
 * nothing pushes #kanji-grid down by its height automatically anymore
 * — this measures the real rendered height and reserves that much
 * space at the top of the page instead, via a ResizeObserver rather
 * than a one-time measurement, since #navMenu's own height isn't a
 * fixed constant (its toggle labels can wrap at narrow widths, for
 * instance) and a stale reservation would either clip it or leave an
 * ugly gap. Also sets the height synchronously up front, rather than
 * relying solely on the observer's own first callback — a background/
 * not-yet-visible tab can have its paint timing throttled, delaying
 * that first callback indefinitely, which would otherwise leave
 * body's padding at 0 (and #kanji-grid hidden under #navMenu) for
 * however long the tab stays unfocused.
 */
function syncNavMenuSpacing() {
  const nav = document.getElementById('navMenu');
  if (!nav) return;
  document.body.style.paddingTop = `${nav.getBoundingClientRect().height}px`;
  const ro = new ResizeObserver(entries => {
    const height = entries[0].borderBoxSize
      ? entries[0].borderBoxSize[0].blockSize
      : nav.getBoundingClientRect().height;
    document.body.style.paddingTop = `${height}px`;
  });
  ro.observe(nav);
}

/** Light/dark theme widget (nav, replacing "Reset all changes"'s old
 * slot — see index.html). Every theme is just [data-theme] on <html>
 * selecting a block of CSS custom-property reassignments (style.css,
 * "Themes" section) — nothing here ever touches individual elements'
 * styling directly. The two row toggles (Light/Dark) are a manually
 * kept mutually-exclusive pair, not real radios, so they can sit side
 * by side with a label each rather than one ambiguous shared switch;
 * picking either one always lands on that side's NON-alt variant, same
 * as clicking a radio resets which option is chosen regardless of
 * what was previously active. The swatch buttons (in the dropdown
 * panel: the Alt pair, then washi/urushi under them) set their theme
 * directly and sync the row's checked
 * state to match which side they belong to, so the row never looks
 * out of sync with which family (light vs dark) is actually active. */
function initThemeToggle() {
  const lightToggle = document.getElementById('lightThemeToggle');
  const darkToggle = document.getElementById('darkThemeToggle');
  const lightAltBtn = document.getElementById('lightAltThemeBtn');
  const darkAltBtn = document.getElementById('darkAltThemeBtn');

  function applyTheme(theme) {
    appState.settings.theme = theme;
    saveLocal(SETTINGS_KEY, appState.settings);
    if (theme === 'dark') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    const isLight = theme === 'light' || theme === 'light-alt' || theme === 'washi';
    lightToggle.checked = isLight;
    darkToggle.checked = !isLight;
    // Whichever control triggered this (a toggle or an Alt button) keeps
    // keyboard focus after being clicked, and .navDropdownPanel's show
    // condition includes :focus-within (so keyboard users can tab into
    // it) — without this, the panel stays open indefinitely after any
    // click, long after the mouse has moved away, since :focus-within
    // doesn't care where the cursor is, only where focus is.
    document.activeElement.blur();
  }

  applyTheme(appState.settings.theme);
  // checked reflects whichever way THIS click just flipped it — toggling
  // either one off has to land on the other side, not stay stuck "off"
  // with neither family active, so both branches read the live state
  // rather than assuming the click always meant "turn mine on".
  lightToggle.addEventListener('change', () => applyTheme(lightToggle.checked ? 'light' : 'dark'));
  darkToggle.addEventListener('change', () => applyTheme(darkToggle.checked ? 'dark' : 'light'));
  lightAltBtn.addEventListener('click', () => applyTheme('light-alt'));
  darkAltBtn.addEventListener('click', () => applyTheme('dark-alt'));
  document.getElementById('washiThemeBtn').addEventListener('click', () => applyTheme('washi'));
  document.getElementById('urushiThemeBtn').addEventListener('click', () => applyTheme('urushi'));
}

function initNavMenu() {
  const addBtn      = document.getElementById('addKanjiBtn');
  const editToggle  = document.getElementById('editModeToggle');
  const toggle      = document.getElementById('confirmOverwriteToggle');
  const extensiveToggle = document.getElementById('extensiveComponentsToggle');
  const exportBtn   = document.getElementById('exportAdditionsBtn');
  const resetBtn    = document.getElementById('resetDataBtn');

  // Which of a kanji's two components fields (compact vs. extensive)
  // shows is decided inside buildCard() itself, so toggling this just
  // rebuilds every card rather than flipping a CSS class.
  extensiveToggle.checked = appState.settings.extensiveComponents;
  extensiveToggle.addEventListener('change', () => {
    appState.settings.extensiveComponents = extensiveToggle.checked;
    saveLocal(SETTINGS_KEY, appState.settings);
    rerenderAllCards();
  });

  // Edit mode gates every editing affordance (initFieldEditing,
  // initWordSlotEditing, "+ Add kanji") off by default — a click-to-
  // edit outline or a "+" placeholder on every field would be noisy
  // for someone just browsing the grid. body.editMode is CSS's hook
  // for the same gate (styles near [data-field]/.wordMeaning/
  // .addWordBtn/.fieldPlaceholder in style.css).
  editToggle.checked = appState.settings.editMode;
  document.body.classList.toggle('editMode', appState.settings.editMode);
  addBtn.disabled = !appState.settings.editMode;
  editToggle.addEventListener('change', () => {
    appState.settings.editMode = editToggle.checked;
    saveLocal(SETTINGS_KEY, appState.settings);
    document.body.classList.toggle('editMode', appState.settings.editMode);
    addBtn.disabled = !appState.settings.editMode;
  });

  toggle.checked = appState.settings.confirmOverwrite;
  toggle.addEventListener('change', () => {
    appState.settings.confirmOverwrite = toggle.checked;
    saveLocal(SETTINGS_KEY, appState.settings);
  });

  // Density fit-strategy toggle — checked (default) is "sequential"
  // (kun's own order tried first); unchecked is "joint" (both sides
  // searched together from the start). This never touches grid
  // order/position at all (kanjiOverrides, kanji.json, or otherwise) —
  // density is always identical between the two strategies (see
  // chooseArrangement's doc comment), so the only thing flipping this
  // changes is which tied arrangement applyRowRescueSwaps picks for
  // display, live on every card pair currently in the grid.
  const densityToggle = document.getElementById('densityFitStrategyToggle');
  densityToggle.checked = appState.settings.densityFitStrategy === 'sequential';
  densityToggle.addEventListener('change', () => {
    appState.settings.densityFitStrategy = densityToggle.checked ? 'sequential' : 'joint';
    saveLocal(SETTINGS_KEY, appState.settings);
    applyRowRescueSwaps();
    const { densities } = computeDensityPreview();
    document.querySelectorAll('#kanji-grid .kc:not(.legendCard)').forEach(card =>
      capCardReadingOverflow(card, densities[card.dataset.kanji] || 0));
  });

  // Forces a fresh computeDensityPreview() (bypassing its cache) and
  // re-runs the full post-render pipeline from it — an explicit escape
  // hatch for whenever you want a guaranteed-from-scratch recomputation,
  // independent of whether the cache's fingerprint logic agrees anything
  // actually changed.
  document.getElementById('recalculateDensityBtn').addEventListener('click', () => {
    applyRowRescueSwaps();
    const { classification, densities } = forceRecalculateDensity();
    document.querySelectorAll('#kanji-grid .kc:not(.legendCard)').forEach(card =>
      capCardReadingOverflow(card, densities[card.dataset.kanji] || 0));
    markDensityResolutionClasses(classification);
    SheetExplorer.refresh();
  });

  exportBtn.addEventListener('click', exportAdditions);
  resetBtn.addEventListener('click', resetAllData);
  updateDataButtonsVisibility();
}


// ── Bootstrap ─────────────────────────────────────────────────

async function init() {
  const grid = document.getElementById('kanji-grid');
  try {
    const res = await fetch('data/kanji.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const kanji = await res.json();

    // Words, pitch info, and the editable-data domains are all
    // supplementary — missing/failing any of them just means cards
    // render without that extra (pitch-accent lines, edits/additions).
    const [words, moraInfo, kanjiDomain, wordDomain] = await Promise.all([
      fetch('data/words.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      PitchAccent.loadInfo().catch(() => null),
      loadKanjiDomain().catch(() => ({ overrides: {}, custom: [] })),
      loadWordDomain().catch(() => ({ overrides: {}, custom: {} })),
    ]);
    Object.assign(appState, {
      kanji, words, moraInfo,
      kanjiOverrides: kanjiDomain.overrides,
      customKanji: kanjiDomain.custom,
      wordOverrides: wordDomain.overrides,
      customWords: wordDomain.custom,
      settings: { confirmOverwrite: true, editMode: false, extensiveComponents: false, densityFitStrategy: 'sequential', theme: 'dark', ...loadLocal(SETTINGS_KEY, {}) },
      posterConfig: { widthCm: null, heightCm: null, forcedChars: [], ...loadLocal(POSTER_CONFIG_KEY, {}), active: false },
    });
    initFieldEditing();
    initPositionQuickEdit();
    initWordSlotEditing();
    initThemeToggle();
    initNavMenu();
    syncNavMenuSpacing();
    initAddKanjiModal();
    initPosterPanel();

    grid.insertAdjacentHTML('beforeend', buildLegendCard());
    initCard(document.getElementById('kc-legend'));

    // capCardReadingOverflow needs each card's real layout, so it's
    // queued per-card (rAF, same as rerenderCard does for one card)
    // rather than batched behind window's 'load' event — by the time
    // this async init() gets here, 'load' (which only waits on the
    // page's own initial resources, not these in-JS data fetches) has
    // near-always already fired, so a listener added this late would
    // simply never run.
    // Real + custom kanji rendered together in one pass, sorted by
    // each card's effective position (kanjiOverrides > base data,
    // falling back to "order" as a tiebreak — see getEffectivePosition/
    // getEffectiveOrder) rather than by array/append order, so a
    // custom kanji can be positioned anywhere among the real ones, and
    // a real kanji whose position was edited renders in its new slot
    // from the very first load, not just after resortGridCards() runs
    // on a later edit.
    const allCardRecs = [
      ...kanji.map(k => ({ k, wordsForChar: words })),
      ...appState.customKanji.map(k => ({ k, wordsForChar: { [k.char]: appState.customWords[k.char] || [] } })),
    ];
    allCardRecs.sort((a, b) => {
      const pa = getEffectivePosition(a.k.char), pb = getEffectivePosition(b.k.char);
      if (pa !== pb) return pa - pb;
      return getEffectiveOrder(a.k.char) - getEffectiveOrder(b.k.char);
    });
    const allCards = [];
    allCardRecs.forEach(({ k, wordsForChar }) => {
      grid.insertAdjacentHTML('beforeend', buildCard(k, wordsForChar, moraInfo, appState.kanjiOverrides, appState.wordOverrides));
      const card = document.getElementById('kc-' + k.char);
      initCard(card);
      allCards.push(card);
    });
    grid.insertAdjacentHTML('beforeend', buildCountersPlaceholder());
    syncCountersBoxHeight();
    SheetExplorer.init();
    // applyRowRescueSwaps needs every card's real adjacency (who's
    // actually next to whom at the current viewport width) settled
    // first, and must run before capCardReadingOverflow — the overflow
    // cap decides what's visible vs hidden behind "…" from whatever
    // order it finds each field in, so it needs to see the post-swap
    // order, not the original data order. Double rAF, not single —
    // applyRowRescueSwaps compares .kc-body's rendered top position
    // ACROSS cards to detect same-row adjacency, which (unlike
    // capCardReadingOverflow's own per-card-only measurements) needs
    // the whole grid's flex-wrap layout to have actually settled, not
    // just this card's own children — one frame after inserting all
    // 100 cards wasn't reliably enough in testing — and requestAnimation-
    // Frame doesn't fire at all in a background/inactive tab (verified
    // directly), so setTimeout is used here instead of a second rAF:
    // it's not tied to painting, so it's not subject to that throttling,
    // and a macrotask delay is more than enough for the synchronous DOM
    // insertion above to have already reflowed by the time this runs.
    setTimeout(() => {
      applyRowRescueSwaps();
      const { classification, densities } = computeDensityPreview();
      allCards.forEach(card => capCardReadingOverflow(card, densities[card.dataset.kanji] || 0));
      markDensityResolutionClasses(classification);
      SheetExplorer.refresh();
      SheetExplorer.start(false);
    }, 0);
  } catch (e) {
    console.error('Failed to load kanji data:', e);
    grid.classList.add('error');
    grid.textContent =
      'Could not load kanji data. ' +
      'Open this project through a local server — see README.md for instructions.';
  }
}

initPopups();
document.addEventListener('DOMContentLoaded', init);
