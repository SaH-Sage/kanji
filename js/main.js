const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const kataToHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96));

function getKanjiInfoWeight(k) {
  const fields = [ "on", "onAdd", "kun", "kunAdd", "name", "components", "variants" ];
  return Math.max(...fields.map(f => (k[f] || []).length));
}

function buildVariants(variants, char, info) {
  if (!variants.length) return "";
  const variantTypes = info && info.variantTypes || {};
  const standardLabel = variantTypes.standard || "standard kanji";
  const fallbackLabel = variantTypes.fallback || "variant form";
  const glyphTypes = variantTypes.types || {};
  const inner = variants.map(v => v.replace(/\s*\(([^)]+)\)/, (_, label) => {
    const glyph = v.replace(/\s*\([^)]+\)/, "").trim();
    const glyphLabel = glyphTypes[glyph] || fallbackLabel;
    return ` <span class="popupWrap variantWrap">\n        <button type="button" class="popupTrigger variantTag" aria-expanded="false">(${label})</button>\n        <span class="popupContent variantTooltip">\n          <span class="variantCol">\n            <span class="variantGlyphBig">${glyph}</span>\n            <span class="variantSubLabel">${glyphLabel}</span>\n          </span>\n          <span class="variantVs">↔</span>\n          <span class="variantCol">\n            <span class="variantGlyphBig">${char}</span>\n            <span class="variantSubLabel">${standardLabel}</span>\n          </span>\n        </span>\n      </span>`;
  })).join(" ");
  return `<span class="variantsKanji">${inner}</span>`;
}

function buildInfoButton(char, words, moraInfo, kanji) {
  const rawEntries = words && words[char] || [];
  if (!rawEntries.length) return "";
  const weight = e => e.word.length + e.kana.length + (e.meaning || []).join("").length + (e.pos || "").length + (e.jlpt || "").length + (e.pronunciationSplit || []).reduce((n, v) => n + v.kana.length + 6, 0);
  const entries = [ ...rawEntries ].sort((a, b) => weight(a) - weight(b));
  const rows = entries.map(e => {
    const rt = PitchAccent.buildPitchRT(e.kana, e.pitch, moraInfo);
    const meaning = (e.meaning || []).join("; ");
    const query = encodeURIComponent(`${e.word}:${e.kana}`);
    const link = `https://www.kanshudo.com/searchq?q=${query}`;
    const grow = Math.max(1, Math.round(weight(e) / 15));
    const pronunciation = e.pronunciationSplit ? `<div class="infoPronunciation">${e.pronunciationSplit.map(v => `<span${v.kana === e.kana ? ' class="infoPronunciationActive"' : ""}>${v.kana} ${v.pct}%</span>`).join('<span class="infoPronunciationSep">・</span>')}</div>` : "";
    return `<div class="infoWordRow" style="flex-grow: ${grow}">\n      <span class="wordKanji"><ruby>${e.word}<rt>${rt}</rt></ruby></span>\n      ${pronunciation}\n      <div class="infoWordMeta">\n        <span class="infoWordMeaning">${meaning}</span>\n        ${e.pos ? `<span>${e.pos}</span>` : ""}\n        ${e.jlpt ? `<span class="infoJlpt">${e.jlpt}</span>` : ""}\n        ${e.selfAdded ? `<span class="infoSelfAdded" title="Hand-added, not yet verified against kanshudo">unverified</span>` : ""}\n        <a class="infoWordLink" href="${link}" target="_blank" rel="noopener noreferrer">kanshudo ↗</a>\n      </div>\n    </div>`;
  }).join("");
  const kanjiLink = `https://www.kanshudo.com/kanji/${encodeURIComponent(char)}`;
  const kanjiLinkJapandict = `https://www.japandict.com/kanji/${encodeURIComponent(char)}`;
  const kanjiLinkWanikani = `https://www.wanikani.com/kanji/${encodeURIComponent(char)}`;
  const phenomenaTypes = moraInfo && moraInfo.readingPhenomena && moraInfo.readingPhenomena.types || {};
  const ownReadings = [ ...kanji && kanji.on || [], ...kanji && kanji.onAdd || [], ...kanji && kanji.kun || [], ...kanji && kanji.kunAdd || [] ];
  const knownReadings = new Set(ownReadings.map(r => kataToHira(r.replace(/^-|-$/g, ""))));
  const extraReadings = [];
  rawEntries.forEach(e => {
    if (e.word !== char || !e.pronunciationSplit) return;
    e.pronunciationSplit.forEach(v => {
      if (knownReadings.has(v.kana) || extraReadings.some(x => x.kana === v.kana)) return;
      extraReadings.push({
        kana: v.kana,
        causes: v.cause || []
      });
    });
  });
  let meaningfulReadingCount = 0;
  const buildReadingSpan = (r, meaning, extraClass) => {
    if (!meaning) return `<span${extraClass ? ` class="${extraClass}"` : ""}>${r}</span>`;
    const under = meaningfulReadingCount % 2 === 1;
    meaningfulReadingCount++;
    const cls = [ "infoReadingMeaning", extraClass, under ? "rubyUnder" : "" ].filter(Boolean).join(" ");
    return `<span class="${cls}"><ruby>${r}<rt>${meaning}</rt></ruby></span>`;
  };
  const ownReadingSpans = [ ...(kanji && kanji.on || []).map(r => buildReadingSpan(r, null, "")), ...(kanji && kanji.onAdd || []).map(r => buildReadingSpan(r, null, "")), ...(kanji && kanji.kun || []).map((r, i) => buildReadingSpan(r, (kanji.kunMeaning || [])[i], "")), ...(kanji && kanji.kunAdd || []).map((r, i) => buildReadingSpan(r, (kanji.kunAddMeaning || [])[i], "")) ].join("");
  const extraReadingSpans = extraReadings.map(ex => {
    const defs = ex.causes.map(c => phenomenaTypes[c]).filter(Boolean);
    if (!defs.length) return `<span class="infoReadingExtra">${ex.kana}</span>`;
    const note = defs.map(d => `<div>${d.note}</div>`).join("");
    return `<span class="popupWrap phenomenonWrap">\n      <button type="button" class="popupTrigger infoReadingExtra" aria-expanded="false">${ex.kana}</button>\n      <div class="popupContent phenomenonPopup">${note}</div>\n    </span>`;
  }).join("");
  const causesPresent = new Set;
  rawEntries.forEach(e => (e.pronunciationSplit || []).forEach(v => (v.cause || []).forEach(c => causesPresent.add(c))));
  const categorySpans = Object.keys(phenomenaTypes).map(c => {
    const type = phenomenaTypes[c];
    const active = causesPresent.has(c);
    return `<span class="popupWrap phenomenonWrap">\n      <button type="button" class="popupTrigger infoCategory${active ? "" : " infoCategoryInactive"}" aria-expanded="false">${type.label}</button>\n      <div class="popupContent phenomenonPopup"><div>${type.note}</div></div>\n    </span>`;
  }).join("");
  const phenomenaRow = `<div class="infoPhenomena">\n    <div class="infoReadings">${ownReadingSpans}${extraReadingSpans}</div>\n    <div class="infoCategoryList">${categorySpans}</div>\n  </div>`;
  return `<span class="popupWrap infoWrap">\n    <button type="button" class="popupTrigger infoBtn" aria-expanded="false" aria-label="Word list and info for this kanji">i</button>\n    <div class="popupContent infoPopup">\n      ${phenomenaRow}\n      <div class="infoWordList">${rows}</div>\n      <div class="infoFooter">\n        <a class="infoFooterLink" href="${kanjiLink}" target="_blank" rel="noopener noreferrer">${char} on kanshudo ↗</a>\n        <a class="infoFooterLink" href="${kanjiLinkJapandict}" target="_blank" rel="noopener noreferrer">${char} on japandict ↗</a>\n        <a class="infoFooterLink" href="${kanjiLinkWanikani}" target="_blank" rel="noopener noreferrer">${char} on wanikani ↗</a>\n      </div>\n    </div>\n  </span>`;
}

function buildComponents(components) {
  if (!components.length) return "";
  return `<span class="componentKanji">${components.join(" ")}</span>`;
}

function buildCard(k, words, moraInfo, kanjiOverrides, wordOverrides) {
  const char = k.char;
  const kOv = kanjiOverrides && kanjiOverrides[char] || {};
  const mergedK = {
    ...k,
    ...kOv
  };
  const wOvForChar = wordOverrides && wordOverrides[char] || {};
  const mergedWordEntries = [ ...words && words[char] || [] ];
  Object.keys(wOvForChar).forEach(idxStr => {
    const ov = wOvForChar[idxStr];
    const pos = mergedWordEntries.findIndex(e => e.word === ov.word);
    if (pos >= 0) mergedWordEntries[pos] = ov; else mergedWordEntries.push(ov);
  });
  const mergedWords = {
    ...words,
    [char]: mergedWordEntries
  };
  const variantsHtml = buildVariants(mergedK.variants, char, moraInfo);
  const showExtensive = appState.settings.extensiveComponents && mergedK.componentsExtensive && mergedK.componentsExtensive.length > 0;
  const componentsField = showExtensive ? "componentsExtensive" : "components";
  const componentsHtml = buildComponents(showExtensive ? mergedK.componentsExtensive : mergedK.components);
  const infoButton = buildInfoButton(char, mergedWords, moraInfo, mergedK);
  const displayWords = mergedK.frequentWord.map((w, i) => {
    const slotOv = wOvForChar[i];
    if (slotOv) {
      return {
        word: slotOv.word,
        kana: slotOv.kana,
        pitch: slotOv.pitch,
        meaning: (slotOv.meaning || []).join("; "),
        pos: slotOv.pos,
        jlpt: slotOv.jlpt,
        overridden: true
      };
    }
    const entry = typeof w === "number" ? mergedWordEntries[w] : mergedWordEntries.find(e => e.word === w);
    const meaning = mergedK.frequentWordMeaning[i] || entry && (entry.meaning || []).join("; ") || "";
    return {
      word: typeof w === "number" ? entry ? entry.word : "" : w,
      kana: entry ? entry.kana : "",
      pitch: entry ? entry.pitch : null,
      meaning: meaning,
      pos: null,
      jlpt: null,
      overridden: false
    };
  });
  const wordKanji = displayWords.map(({word: word, kana: kana, pitch: pitch}, i) => {
    const rt = PitchAccent.buildPitchRT(kana, pitch, moraInfo);
    return `<span class="wordKanji" data-char="${char}" data-idx="${i}"><ruby>${word}<rt>${rt}</rt></ruby></span>`;
  }).join("");
  const wordMeaning = displayWords.map(({meaning: meaning, overridden: overridden, word: word, kana: kana, pitch: pitch, pos: pos, jlpt: jlpt}, i) => `<span class="popupWrap wordSlotWrap">\n      <button type="button" class="popupTrigger wordMeaning${overridden ? " overridden" : ""}" data-char="${char}" data-idx="${i}" aria-expanded="false" title="Click to edit">${meaning}</button>\n      <div class="popupContent wordSlotPopup">\n        <label>word <input class="wsWord" value="${word || ""}"></label>\n        <label>kana <input class="wsKana" value="${kana || ""}"></label>\n        <label>pitch <input class="wsPitch" type="number" min="0" value="${pitch != null ? pitch : ""}"></label>\n        <label>pos <input class="wsPos" value="${pos || ""}"></label>\n        <label>JLPT <input class="wsJlpt" value="${jlpt || ""}"></label>\n        <label>meaning <input class="wsMeaning" value="${meaning || ""}"></label>\n        <div class="wordSlotActions">\n          <button type="button" class="wsSave">Save</button>\n          <button type="button" class="wsCancel">Cancel</button>\n        </div>\n      </div>\n    </span>`).join("");
  const addWordBtn = isCustomKanji(char) && displayWords.length < 3 ? `<button type="button" class="addWordBtn" data-char="${char}" title="Add a frequent word">+ word</button>` : "";
  const on = mergedK.on.map(r => `<span>${r}</span>`).join("");
  const onAdd = mergedK.onAdd.map(r => `<span class="add">${r}</span>`).join("");
  const kunAdd = mergedK.kunAdd.map((r, i) => {
    const meaning = (mergedK.kunAddMeaning || [])[i];
    return meaning ? `<span class="add" data-reading="${r}"><ruby>${r}<rt>${meaning}</rt></ruby></span>` : `<span class="add">${r}</span>`;
  }).join("");
  const kun = mergedK.kun.map((r, i) => {
    const meaning = (mergedK.kunMeaning || [])[i];
    return meaning ? `<span data-reading="${r}"><ruby>${r}<rt>${meaning}</rt></ruby></span>` : `<span>${r}</span>`;
  }).join("");
  const name = mergedK.name.map(r => `<span class="add">${r}</span>`).join("");
  const ph = extra => isCustomKanji(char) ? `<span class="fieldPlaceholder${extra ? " " + extra : ""}">+</span>` : "";
  return `\n    <div class="kc" id="kc-${char}" data-kanji="${char}">\n      <div class="r-top">\n        <span class="fieldWrap" data-char="${char}" data-field="variants" title="Click to edit">${variantsHtml || ph()}</span>\n        <span class="fieldWrap" data-char="${char}" data-field="${componentsField}" title="Click to edit">${componentsHtml || ph()}</span>\n        ${wordKanji}${addWordBtn}\n      </div>\n      <div class="kc-body"><div class="ctr">\n        <div class="kc-left">\n          <div class="l1 on" data-char="${char}" data-field="on" title="Click to edit">${on || ph()}</div>\n          <div class="l2 on" data-char="${char}" data-field="onAdd" title="Click to edit">${onAdd || ph("add")}</div>\n          <div class="l3 kun" data-char="${char}" data-field="kunAdd" title="Click to edit">${kunAdd || ph("add")}</div>\n        </div>\n        <svg class="kanji" viewBox="0 0 109 109"></svg>\n        <button class="animBtn" disabled>Animate</button>\n        <span class="editPositionGroup">\n          <button type="button" class="editKanjiBtn" data-char="${char}" title="Edit all fields for this kanji" aria-label="Edit all fields for this kanji">e</button>\n          <span class="positionQuickPopup" data-char="${char}">\n            <label>pos <input type="number" step="1" class="positionQuickInput" value="${mergedK.position}" title="Grid position — Enter or click away to apply. Every other kanji between the old and new spot shifts to make room."></label>\n          </span>\n        </span>\n        <button type="button" class="placeholderBtn" title="Placeholder for Kanji Test" aria-label="Placeholder for Kanji Test">t</button>\n        ${infoButton}\n        <div class="kc-right">\n          <div class="r1 kun" data-char="${char}" data-field="kun" title="Click to edit">${kun || ph()}</div>\n          <div class="r2 name" data-char="${char}" data-field="name" title="Click to edit">${name || ph("add")}</div>\n        </div>\n      </div></div>\n      <div class="r-bot">\n        <span class="meaningKanji" data-char="${char}" data-field="meaning" title="Click to edit">${mergedK.meaning || ph()}</span>${wordMeaning}\n      </div>\n    </div>`;
}

function buildLegendCard() {
  return `\n    <div class="kc legendCard" id="kc-legend" data-kanji="漢字">\n      <span class="legendTitle">key</span>\n      <div class="r-top">\n        <span class="legendLabel">\n          <span>versions</span>\n          <span class="componentKanji">components</span>\n        </span>\n        <span class="legendLabel">· words with pitch accent</span>\n      </div>\n      <div class="kc-body"><div class="ctr">\n        <div class="kc-left">\n          <div class="l1 on"><span class="legendLabel">on'yomi</span></div>\n          <div class="l2 on"><span class="legendLabel">other<br/>on'yomi</span></div>\n          <div class="l3 kun"><span class="legendLabel">kun<br/>okurigana</span></div>\n        </div>\n        <svg class="kanji" viewBox="0 0 109 109"></svg>\n        <button class="animBtn" disabled>Animate</button>\n        <span class="popupWrap infoWrap">\n          <button type="button" class="popupTrigger infoBtn" aria-expanded="false" aria-label="Example info button">i</button>\n          <div class="popupContent infoPopup">\n            <span class="legendLabel legendInfoText">\n              Opens this kanji's full word list — each word's reading\n              (with pitch accent), meaning, part of speech, JLPT level,\n              and any alternate pronunciations — plus a link to look it\n              up on kanshudo.\n            </span>\n          </div>\n        </span>\n        <div class="kc-right">\n          <div class="r1 kun"><span class="legendLabel">kun'yomi</span></div>\n          <div class="r2 name"><span class="legendLabel">name<br/>reading</span></div>\n        </div>\n      </div></div>\n      <div class="r-bot">\n        <span class="legendLabel meaningKanji">kanji meaning</span><span class="legendLabel wordMeaning">word meaning</span>\n      </div>\n    </div>`;
}

function buildCountersPlaceholder() {
  return `<div class="counterBox" id="kc-counters">counters</div>`;
}

function syncCountersBoxHeight() {
  const box = document.getElementById("kc-counters");
  const referenceCard = document.querySelector("#kanji-grid .kc:not(.legendCard)");
  if (!box || !referenceCard) return;
  box.style.height = `${referenceCard.getBoundingClientRect().height}px`;
  const ro = new ResizeObserver(entries => {
    const height = entries[0].borderBoxSize ? entries[0].borderBoxSize[0].blockSize : referenceCard.getBoundingClientRect().height;
    box.style.height = `${height}px`;
  });
  ro.observe(referenceCard);
}

function svgEl(tag, attrs, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text !== undefined) el.textContent = text;
  return el;
}

function resetSVG(char, svg, btn, st) {
  if (st.cancel) {
    st.cancel();
    st.cancel = null;
  }
  if (st.timer) {
    clearTimeout(st.timer);
    st.timer = null;
  }
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  st.paths = [];
  st.lens = [];
  btn.disabled = true;
  st.fb = svgEl("text", {
    x: "54.5",
    y: "54.5",
    "text-anchor": "middle",
    "dominant-baseline": "central",
    "font-size": [ ...char ].length > 1 ? 42 : 82,
    fill: "#ffffff",
    "font-family": "serif"
  }, char);
  st.fb.style.userSelect = "none";
  svg.appendChild(st.fb);
}

async function fetchStrokeSVG(code) {
  const local = await fetch(`data/strokes/${code}.svg`).catch(() => null);
  if (local && local.ok) return local.text();
  const remote = await fetch(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${code}.svg`);
  if (!remote.ok) throw new Error(`HTTP ${remote.status}`);
  return remote.text();
}

function appendStrokes(svgSource, target, st, numColor) {
  const doc = (new DOMParser).parseFromString(svgSource, "image/svg+xml");
  doc.querySelectorAll("path").forEach((p, i) => {
    const d = p.getAttribute("d");
    const el = svgEl("path", {
      d: d,
      fill: "none",
      stroke: "#fff",
      "stroke-width": "3.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    target.appendChild(el);
    st.paths.push(el);
    const m = d.match(/M\s*([\d.]+)[,\s]+([\d.]+)/);
    if (m) {
      const t = svgEl("text", {
        x: +m[1],
        y: +m[2] - 3,
        fill: numColor,
        "font-size": "7",
        "font-weight": "bold",
        "text-anchor": "middle"
      }, i + 1);
      t.style.userSelect = "none";
      target.appendChild(t);
    }
  });
}

function finishLoad(st, btn) {
  if (st.fb) {
    st.fb.remove();
    st.fb = null;
  }
  requestAnimationFrame(() => {
    st.lens = st.paths.map(p => {
      try {
        return p.getTotalLength();
      } catch {
        return 300;
      }
    });
    btn.disabled = false;
  });
}

async function loadKanji(char, svg, btn, st) {
  resetSVG(char, svg, btn, st);
  const code = char.codePointAt(0).toString(16).padStart(5, "0");
  try {
    const svgSource = await fetchStrokeSVG(code);
    appendStrokes(svgSource, svg, st, cssVar("--color-num"));
    finishLoad(st, btn);
  } catch (e) {
    console.warn(`Failed to load stroke data for ${char}:`, e);
  }
}

async function loadKanjiMulti(chars, svg, btn, st) {
  resetSVG(chars, svg, btn, st);
  const list = [ ...chars ];
  const scale = .62;
  const spacing = 50;
  const size = scale * 109;
  const yOffset = (109 - size) / 2;
  const startX = 109 / 2 - spacing * (list.length - 1) / 2;
  try {
    const numColor = cssVar("--color-num");
    const sources = await Promise.all(list.map(c => fetchStrokeSVG(c.codePointAt(0).toString(16).padStart(5, "0"))));
    sources.forEach((svgSource, i) => {
      const centerX = startX + i * spacing;
      const g = svgEl("g", {
        transform: `translate(${centerX - size / 2}, ${yOffset}) scale(${scale})`
      });
      svg.appendChild(g);
      appendStrokes(svgSource, g, st, numColor);
    });
    finishLoad(st, btn);
  } catch (e) {
    console.warn(`Failed to load stroke data for ${chars}:`, e);
  }
}

function ease(t) {
  return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function animatePath(el, length, duration, onDone) {
  el.setAttribute("stroke-dasharray", length);
  el.setAttribute("stroke-dashoffset", length);
  const start = performance.now();
  let raf;
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    el.setAttribute("stroke-dashoffset", length * (1 - ease(t)));
    if (t < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      el.setAttribute("stroke-dashoffset", 0);
      if (onDone) onDone();
    }
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

function animate(st) {
  if (st.cancel) st.cancel();
  if (st.timer) clearTimeout(st.timer);
  st.paths.forEach((p, i) => {
    p.setAttribute("stroke-dasharray", st.lens[i] || 300);
    p.setAttribute("stroke-dashoffset", st.lens[i] || 300);
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

function capReadingOverflow(container) {
  const items = [ ...container.querySelectorAll(":scope > span:not(.fieldPlaceholder)") ];
  if (items.length < 2) return;
  const rightAligned = getComputedStyle(container).alignItems === "flex-end";
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
  if (numColumns <= 3) return;
  const visibleCount = itemsPerColumn * 3 - 1;
  const overflowItems = items.slice(visibleCount);
  overflowItems.forEach(el => el.remove());
  const addClass = items[0].classList.contains("add") ? " add" : "";
  const trigger = document.createElement("span");
  trigger.className = "popupWrap readingMoreWrap" + addClass;
  trigger.innerHTML = `<button type="button" class="popupTrigger readingMoreTag${addClass}" aria-expanded="false">…</button>` + `<span class="popupContent readingMorePopup">` + overflowItems.map(el => `<span>${el.dataset.reading || el.textContent}</span>`).join("") + `</span>`;
  container.appendChild(trigger);
}

function capCardReadingOverflow(card) {
  card.querySelectorAll(".l1, .l2, .l3, .r1, .r2").forEach(capReadingOverflow);
  const r2 = card.querySelector(".r2");
  if (r2) markR2Columns(r2);
}

const ROW_RESCUE_THRESHOLD_PRIMARY = 6;

const ROW_RESCUE_THRESHOLD_SECONDARY = 10;

function measureR1Capacity(r1El, kunList) {
  if (!r1El) return kunList.length || 1;
  const spans = [ ...r1El.querySelectorAll(":scope > span:not(.fieldPlaceholder)") ];
  if (spans.length < 2) return spans.length || kunList.length || 1;
  const edge = el => Math.round(el.getBoundingClientRect().left);
  const firstEdge = edge(spans[0]);
  let n = 0;
  for (const s of spans) {
    if (Math.abs(edge(s) - firstEdge) > 1) break;
    n++;
  }
  return n || spans.length;
}

function applyRowOrder(container, order) {
  if (!container || !order.length) return;
  const spans = [ ...container.querySelectorAll(":scope > span:not(.fieldPlaceholder)") ];
  const used = new Set;
  order.forEach(text => {
    const idx = spans.findIndex((s, i) => !used.has(i) && (s.dataset.reading || s.textContent) === text);
    if (idx === -1) return;
    used.add(idx);
    container.appendChild(spans[idx]);
  });
}

function computePairRescue(mine, theirs, threshold) {
  if (!mine.length || !theirs.length) return {
    minePerm: mine,
    theirsPerm: theirs
  };
  const naturalWidth = maxCombinedForPairing(mine, theirs);
  if (naturalWidth < threshold) return {
    minePerm: mine,
    theirsPerm: theirs
  };
  const optimalWidth = bestCombinedMaxOptimal(mine, theirs);
  if (optimalWidth >= threshold) return {
    minePerm: mine,
    theirsPerm: theirs
  };
  return chooseArrangement(mine, theirs, optimalWidth, appState.settings.densityFitStrategy);
}

function applyRowRescueSwaps() {
  const cards = [ ...document.querySelectorAll("#kanji-grid .kc:not(.legendCard)") ];
  for (let i = 0; i < cards.length - 1; i++) {
    const cur = cards[i], prev = cards[i + 1];
    const curBody = cur.querySelector(".kc-body"), prevBody = prev.querySelector(".kc-body");
    if (!curBody || !prevBody) continue;
    if (Math.abs(curBody.getBoundingClientRect().top - prevBody.getBoundingClientRect().top) > 1) continue;
    const curChar = cur.dataset.kanji, prevChar = prev.dataset.kanji;
    const curOn = getCurrentFieldValue(curChar, "on") || [];
    const curOnAdd = getCurrentFieldValue(curChar, "onAdd") || [];
    const curKunAdd = getCurrentFieldValue(curChar, "kunAdd") || [];
    const prevKun = getCurrentFieldValue(prevChar, "kun") || [];
    const prevName = getCurrentFieldValue(prevChar, "name") || [];
    const prevR1El = prev.querySelector(".r1");
    const r1Capacity = measureR1Capacity(prevR1El, prevKun);
    const prevKunBaseline = prevKun.slice(0, r1Capacity);
    const prevKunOverflow = prevKun.slice(r1Capacity);
    const l1r1 = computePairRescue(curOn, prevKunBaseline, ROW_RESCUE_THRESHOLD_PRIMARY);
    applyRowOrder(cur.querySelector(".l1"), l1r1.minePerm);
    const l2r1 = prevKunOverflow.length ? computePairRescue(curOnAdd, prevKunOverflow, ROW_RESCUE_THRESHOLD_SECONDARY) : {
      minePerm: curOnAdd,
      theirsPerm: prevKunOverflow
    };
    if (prevKunOverflow.length) applyRowOrder(cur.querySelector(".l2"), l2r1.minePerm);
    applyRowOrder(prevR1El, [ ...l1r1.theirsPerm, ...l2r1.theirsPerm ]);
    const l3r2 = computePairRescue(curKunAdd, prevName, ROW_RESCUE_THRESHOLD_SECONDARY);
    applyRowOrder(cur.querySelector(".l3"), l3r2.minePerm);
    const prevNameCols = densityColumnsOfElement(prev.querySelector(".r2"));
    if (prevNameCols.length) {
      const namePartner = [ ...curOnAdd, ...curKunAdd ];
      const naturalWidth = fieldWidthFromColumns(prevNameCols, namePartner, true);
      if (naturalWidth >= DENSITY_STEP_SECONDARY) {
        const fullName = prevNameCols.flat();
        const solidCapacity = prevNameCols.length > 1 ? prevNameCols[0].length : fullName.length;
        const arrangement = bestColumnArrangement(fullName, solidCapacity, namePartner, true);
        if (arrangement.width < naturalWidth) {
          applyRowOrder(prev.querySelector(".r2"), [ ...arrangement.solid, ...arrangement.overflow ]);
        }
      }
    }
  }
}

const R2_EXTRA_PULL = .5;

function markR2Columns(r2) {
  r2.querySelectorAll(".r2-divider").forEach(d => d.remove());
  const items = [ ...r2.querySelectorAll("span.add") ];
  if (!items.length) return;
  const borderColor = cssVar("--color-border");
  const firstLeft = items[0].getBoundingClientRect().left;
  items.forEach(el => {
    const isOverflow = el.getBoundingClientRect().left > firstLeft + 1;
    el.style.marginLeft = isOverflow ? `${-R2_EXTRA_PULL}px` : "";
  });
  const r2Rect = r2.getBoundingClientRect();
  const columnGap = (parseFloat(getComputedStyle(r2).columnGap) || 0) - R2_EXTRA_PULL;
  const columns = new Map;
  items.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.left > firstLeft + 1) {
      const colLeft = Math.round(rect.left - r2Rect.left);
      if (!columns.has(colLeft)) columns.set(colLeft, []);
      columns.get(colLeft).push(rect);
    }
  });
  columns.forEach((rects, colLeft) => {
    const top = Math.min(...rects.map(r => r.top)) - r2Rect.top;
    const bottom = Math.max(...rects.map(r => r.bottom)) - r2Rect.top;
    const div = document.createElement("div");
    div.className = "r2-divider";
    div.style.cssText = `position:absolute; left:${colLeft - columnGap / 2}px; top:${top}px;` + `height:${bottom - top}px; border-left:1px dotted ${borderColor};` + `pointer-events:none;`;
    r2.appendChild(div);
  });
}

function initCard(card) {
  const char = card.dataset.kanji;
  const svg = card.querySelector("svg.kanji");
  const btn = card.querySelector(".animBtn");
  card._st = {
    paths: [],
    lens: [],
    cancel: null,
    timer: null,
    fb: null
  };
  btn.addEventListener("click", () => animate(card._st));
  if ([ ...char ].length > 1) loadKanjiMulti(char, svg, btn, card._st); else loadKanji(char, svg, btn, card._st);
}

function closePopups(exceptWrap) {
  document.querySelectorAll(".popupWrap.open").forEach(wrap => {
    if (wrap === exceptWrap || exceptWrap && wrap.contains(exceptWrap)) return;
    wrap.classList.remove("open");
    wrap.querySelector(".popupTrigger").setAttribute("aria-expanded", "false");
  });
}

function positionInfoPopup(wrap) {
  if (wrap.classList.contains("infoWrap")) {
    const content = wrap.querySelector(".popupContent");
    if (!content) return;
    const wrapRect = wrap.getBoundingClientRect();
    const contentWidth = content.offsetWidth;
    const spaceRight = window.innerWidth - wrapRect.right;
    const spaceLeft = wrapRect.left;
    wrap.classList.toggle("openLeft", spaceRight < contentWidth && spaceLeft > spaceRight);
    const containerRect = content.getBoundingClientRect();
    const containerStyle = getComputedStyle(content);
    const borderLeft = parseFloat(containerStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(containerStyle.borderRightWidth) || 0;
    const clipLeft = containerRect.left + borderLeft;
    const clipRight = containerRect.right - borderRight;
    const margin = 4;
    const rowGap = 2;
    const sideLastRight = {
      over: null,
      under: null
    };
    let lastTop = null;
    const spans = content.querySelectorAll(".infoReadingMeaning");
    spans.forEach(span => {
      span.style.marginLeft = "";
      span.style.marginRight = "";
    });
    spans.forEach(span => {
      const rt = span.querySelector("rt");
      if (!rt) return;
      let spanRect = span.getBoundingClientRect();
      if (lastTop !== null && Math.abs(spanRect.top - lastTop) > 4) {
        sideLastRight.over = null;
        sideLastRight.under = null;
      }
      lastTop = spanRect.top;
      const centered = spanRect.width / 2 - rt.offsetWidth / 2;
      const side = span.classList.contains("rubyUnder") ? "under" : "over";
      const lastRight = sideLastRight[side];
      let leftAbs = spanRect.left + centered;
      if (lastRight !== null && leftAbs < lastRight + rowGap) {
        const push = `${lastRight + rowGap - leftAbs}px`;
        span.style.marginLeft = push;
        span.style.marginRight = push;
        spanRect = span.getBoundingClientRect();
        leftAbs = spanRect.left + centered;
      }
      sideLastRight[side] = leftAbs + rt.offsetWidth;
      const minLeft = clipLeft - spanRect.left + margin;
      const maxLeft = clipRight - spanRect.left - rt.offsetWidth - margin;
      rt.style.left = `${Math.max(minLeft, Math.min(centered, maxLeft))}px`;
      rt.style.transform = "none";
    });
    return;
  }
  if (wrap.classList.contains("phenomenonWrap")) {
    const content = wrap.querySelector(".popupContent");
    const container = wrap.closest(".infoPopup");
    if (!content || !container) return;
    const margin = 4;
    const containerRect = container.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const contentWidth = content.offsetWidth;
    const centered = wrapRect.width / 2 - contentWidth / 2;
    const minLeft = containerRect.left - wrapRect.left + margin;
    const maxLeft = containerRect.right - wrapRect.left - contentWidth - margin;
    content.style.left = `${Math.max(minLeft, Math.min(centered, maxLeft))}px`;
    content.style.transform = "none";
  }
}

function initPopups() {
  document.addEventListener("click", e => {
    const trigger = e.target.closest(".popupTrigger");
    if (trigger) {
      const wrap = trigger.closest(".popupWrap");
      const wasOpen = wrap.classList.contains("open");
      closePopups(wrap);
      if (!wasOpen) {
        wrap.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
        positionInfoPopup(wrap);
      }
      return;
    }
    if (!e.target.closest(".popupContent")) closePopups();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closePopups();
  });
  document.addEventListener("mouseover", e => {
    const trigger = e.target.closest(".popupTrigger");
    if (!trigger) return;
    const wrap = trigger.closest(".popupWrap");
    closePopups(wrap);
    positionInfoPopup(wrap);
  });
}

const KANJI_OVERRIDES_KEY = "kanjiGrid.kanjiOverrides";

const WORD_OVERRIDES_KEY = "kanjiGrid.wordOverrides";

const CUSTOM_KANJI_KEY = "kanjiGrid.customKanji";

const CUSTOM_WORDS_KEY = "kanjiGrid.customWords";

const SETTINGS_KEY = "kanjiGrid.settings";

const OVERRIDABLE_ARRAY_FIELDS = new Set([ "variants", "components", "componentsExtensive", "on", "onAdd", "kun", "kunMeaning", "kunAdd", "kunAddMeaning", "name" ]);

const appState = {
  kanji: [],
  words: {},
  moraInfo: null,
  kanjiOverrides: {},
  wordOverrides: {},
  customKanji: [],
  customWords: {},
  settings: {
    confirmOverwrite: true,
    editMode: false,
    extensiveComponents: false,
    densityFitStrategy: "sequential"
  },
  densityPreviewPositions: null
};

function loadLocal(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Could not save ${key} to localStorage:`, e);
  }
}

async function loadKanjiDomain() {
  const file = await fetch("data/kanjiOverrides.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const fileOverrides = file.overrides || {};
  const fileCustom = file.custom || [];
  const localOverrides = loadLocal(KANJI_OVERRIDES_KEY, {});
  const localCustom = loadLocal(CUSTOM_KANJI_KEY, []);
  const overrides = {};
  for (const c of new Set([ ...Object.keys(fileOverrides), ...Object.keys(localOverrides) ])) {
    overrides[c] = {
      ...fileOverrides[c],
      ...localOverrides[c]
    };
  }
  const byChar = new Map(fileCustom.map(k => [ k.char, k ]));
  localCustom.forEach(k => byChar.set(k.char, k));
  return {
    overrides: overrides,
    custom: [ ...byChar.values() ]
  };
}

async function loadWordDomain() {
  const file = await fetch("data/wordOverrides.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const fileOverrides = file.overrides || {};
  const fileCustom = file.custom || {};
  const localOverrides = loadLocal(WORD_OVERRIDES_KEY, {});
  const localCustom = loadLocal(CUSTOM_WORDS_KEY, {});
  const overrides = {};
  for (const c of new Set([ ...Object.keys(fileOverrides), ...Object.keys(localOverrides) ])) {
    overrides[c] = {
      ...fileOverrides[c],
      ...localOverrides[c]
    };
  }
  const custom = {};
  for (const c of new Set([ ...Object.keys(fileCustom), ...Object.keys(localCustom) ])) {
    custom[c] = localCustom[c] || fileCustom[c];
  }
  return {
    overrides: overrides,
    custom: custom
  };
}

function isCustomKanji(char) {
  return appState.customKanji.some(k => k.char === char);
}

function findBaseKanji(char) {
  return appState.kanji.find(k => k.char === char);
}

function getEffectivePosition(char) {
  if (appState.densityPreviewPositions && char in appState.densityPreviewPositions) {
    return appState.densityPreviewPositions[char];
  }
  const v = getCurrentFieldValue(char, "position");
  return typeof v === "number" ? v : Infinity;
}

function getEffectiveOrder(char) {
  const v = getCurrentFieldValue(char, "order");
  return typeof v === "number" ? v : Infinity;
}

function nextOrderValue() {
  const orders = [ ...appState.kanji, ...appState.customKanji ].map(k => k.order).filter(n => typeof n === "number");
  return orders.length ? Math.max(...orders) + 1 : 0;
}

function resortGridCards() {
  const grid = document.getElementById("kanji-grid");
  const cards = [ ...grid.children ].filter(el => el.id !== "kc-legend" && el.id !== "kc-counters");
  cards.sort((a, b) => {
    const pa = getEffectivePosition(a.dataset.kanji), pb = getEffectivePosition(b.dataset.kanji);
    if (pa !== pb) return pa - pb;
    return getEffectiveOrder(a.dataset.kanji) - getEffectiveOrder(b.dataset.kanji);
  });
  cards.forEach(el => grid.appendChild(el));
  const countersBox = document.getElementById("kc-counters");
  if (countersBox) grid.appendChild(countersBox);
}

function moveKanjiToPosition(char, targetIndex) {
  const allChars = [ ...appState.kanji, ...appState.customKanji ].map(k => k.char).sort((a, b) => {
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
    saveFieldEdit(c, "position", i);
    const otherCard = document.getElementById("kc-" + c);
    const otherInput = otherCard && otherCard.querySelector(".positionQuickInput");
    if (otherInput) otherInput.value = i;
  });
  resortGridCards();
}

const DENSITY_FIELDS = [ "on", "onAdd", "kun", "kunAdd", "name" ];

const DENSITY_CLASS_FOR = {
  on: "l1",
  onAdd: "l2",
  kunAdd: "l3",
  kun: "r1",
  name: "r2"
};

const DENSITY_STEP_PRIMARY = 6, DENSITY_STEP_SECONDARY = 8;

function densityColumnsOfElement(el) {
  const spans = [ ...el.querySelectorAll(":scope > span:not(.fieldPlaceholder):not(.popupWrap)") ];
  if (!spans.length) return [];
  const rightAligned = getComputedStyle(el).alignItems === "flex-end";
  const edge = s => Math.round(rightAligned ? s.getBoundingClientRect().right : s.getBoundingClientRect().left);
  const groups = new Map;
  const order = [];
  spans.forEach(s => {
    const e = edge(s);
    if (!groups.has(e)) {
      groups.set(e, []);
      order.push(e);
    }
    groups.get(e).push(s.dataset.reading || s.textContent);
  });
  return order.map(e => groups.get(e));
}

function measureNaturalColumns(k, wordsForChar) {
  const html = buildCard(k, wordsForChar, appState.moraInfo, {}, {});
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.left = "-9999px";
  wrapper.style.top = "0";
  wrapper.innerHTML = html.trim();
  document.body.appendChild(wrapper);
  const card = wrapper.firstElementChild;
  const result = {};
  DENSITY_FIELDS.forEach(field => {
    const el = card.querySelector("." + DENSITY_CLASS_FOR[field]);
    result[field] = el ? densityColumnsOfElement(el) : [];
  });
  wrapper.remove();
  return result;
}

function measureAllColumnsLive() {
  const measurements = {};
  appState.kanji.forEach(k => {
    measurements[k.char] = measureNaturalColumns(k, appState.words);
  });
  appState.customKanji.forEach(k => {
    measurements[k.char] = measureNaturalColumns(k, {
      [k.char]: appState.customWords[k.char] || []
    });
  });
  return measurements;
}

function inversionCount(seq) {
  let count = 0;
  for (let i = 0; i < seq.length; i++) for (let j = i + 1; j < seq.length; j++) if (seq[i] > seq[j]) count++;
  return count;
}

function permutationsOf(arr) {
  if (arr.length <= 1) return [ arr ];
  const result = [];
  arr.forEach((item, i) => {
    const rest = [ ...arr.slice(0, i), ...arr.slice(i + 1) ];
    permutationsOf(rest).forEach(p => result.push([ item, ...p ]));
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

function bestCombinedMaxOptimal(mine, theirs) {
  if (!mine.length) return 0;
  const N = mine.length, K = theirs.length;
  const numEmpty = Math.max(0, N - K);
  const mineDesc = [ ...mine ].sort((a, b) => b.length - a.length);
  const toEmpty = mineDesc.slice(0, numEmpty);
  const toReal = mineDesc.slice(numEmpty);
  const theirsAsc = [ ...theirs ].sort((a, b) => a.length - b.length);
  let max = 0;
  toEmpty.forEach(r => {
    max = Math.max(max, r.length);
  });
  toReal.forEach((r, i) => {
    max = Math.max(max, r.length + (theirsAsc[i] ? theirsAsc[i].length : 0));
  });
  return max;
}

function densityDistance(perm, natIdx) {
  return inversionCount(perm.map(s => natIdx.get(s)));
}

function combinationsOfIndices(n, k) {
  if (k === 0) return [ [] ];
  if (n < k) return [];
  const result = [];
  (function go(start, combo) {
    if (combo.length === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      go(i + 1, combo);
      combo.pop();
    }
  })(0, []);
  return result;
}

function fieldWidthFromColumns(cols, partnerLast, bonus) {
  let w = 0;
  for (let i = 0; i < cols.length - 1; i++) w += Math.max(...cols[i].map(s => s.length)) + (bonus ? 1 : 0);
  const last = cols.length ? cols[cols.length - 1] : [];
  return w + bestCombinedMaxOptimal(last, partnerLast);
}

const COLUMN_REASSIGN_MAX_SWAPS = 2;

function bestColumnArrangement(fullList, solidCapacity, partnerLast, bonus) {
  const overflowCount = fullList.length - solidCapacity;
  if (overflowCount <= 0) return {
    solid: fullList,
    overflow: [],
    width: 0
  };
  let best = null;
  combinationsOfIndices(fullList.length, overflowCount).forEach(comboIdx => {
    const swapsNeeded = comboIdx.filter(i => i < solidCapacity).length;
    if (swapsNeeded > COLUMN_REASSIGN_MAX_SWAPS) return;
    const inOverflow = new Set(comboIdx);
    const overflow = comboIdx.map(i => fullList[i]);
    const solid = fullList.filter((_, i) => !inOverflow.has(i));
    const solidW = solid.length ? Math.max(...solid.map(s => s.length)) + (bonus ? 1 : 0) : 0;
    const width = solidW + bestCombinedMaxOptimal(overflow, partnerLast);
    const indexSum = comboIdx.reduce((a, b) => a + b, 0);
    if (!best || width < best.width || width === best.width && indexSum > best.indexSum) {
      best = {
        width: width,
        indexSum: indexSum,
        solid: solid,
        overflow: overflow
      };
    }
  });
  const mineDesc = [ ...best.overflow ].sort((a, b) => b.length - a.length);
  const numEmpty = Math.max(0, mineDesc.length - partnerLast.length);
  const toEmpty = mineDesc.slice(0, numEmpty);
  const toReal = mineDesc.slice(numEmpty);
  const overflowOrder = [ ...toReal, ...toEmpty ];
  return {
    solid: best.solid,
    overflow: overflowOrder,
    width: best.width
  };
}

function densityBestCombinedMax(mine, theirs) {
  return bestCombinedMaxOptimal(mine, theirs);
}

function chooseArrangement(mine, theirs, optimalWidth, strategy) {
  if (!mine.length) return {
    minePerm: mine,
    theirsPerm: theirs
  };
  if (mine.length > 7 || theirs.length > 7) return {
    minePerm: mine,
    theirsPerm: theirs
  };
  const mineNatIdx = new Map(mine.map((s, i) => [ s, i ]));
  const theirsNatIdx = new Map(theirs.map((s, i) => [ s, i ]));
  if (strategy !== "joint") {
    let best = null;
    permutationsOf(mine).forEach(perm => {
      if (maxCombinedForPairing(perm, theirs) !== optimalWidth) return;
      const dist = densityDistance(perm, mineNatIdx);
      if (!best || dist < best.dist) best = {
        minePerm: perm,
        theirsPerm: theirs,
        dist: dist
      };
    });
    if (best) return best;
  }
  let best = null;
  permutationsOf(mine).forEach(minePerm => {
    permutationsOf(theirs).forEach(theirsPerm => {
      if (maxCombinedForPairing(minePerm, theirsPerm) !== optimalWidth) return;
      const dist = densityDistance(minePerm, mineNatIdx) + densityDistance(theirsPerm, theirsNatIdx);
      if (!best || dist < best.dist) best = {
        minePerm: minePerm,
        theirsPerm: theirsPerm,
        dist: dist
      };
    });
  });
  return best || {
    minePerm: mine,
    theirsPerm: theirs
  };
}

function computeDensityPreview() {
  const measurements = measureAllColumnsLive();
  const sorted = [ ...appState.kanji, ...appState.customKanji ].sort((a, b) => a.order - b.order);
  const orderOf = Object.fromEntries(sorted.map(k => [ k.char, k.order ]));
  const allChars = sorted.map(k => k.char);
  function columns(char, field) {
    return measurements[char][field] || [];
  }
  function lastColumn(char, field) {
    const c = columns(char, field);
    return c.length ? c[c.length - 1] : [];
  }
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
  function optimalFieldWidth(char, field, partnerLast, bonus) {
    const cols = columns(char, field);
    if (cols.length !== 2) return solidWidth(char, field, bonus) + densityBestCombinedMax(lastColumn(char, field), partnerLast);
    return bestColumnArrangement(cols[0].concat(cols[1]), cols[0].length, partnerLast, bonus).width;
  }
  function fieldWidthRaw(char, field, bonus) {
    return solidWidth(char, field, bonus) + (lastColumn(char, field).length ? Math.max(...lastColumn(char, field).map(s => s.length)) + (bonus ? 1 : 0) : 0);
  }
  function levelFor(w, step) {
    let n = 0;
    while (w >= step * (n + 1)) n++;
    return n;
  }
  function computeDensity(char, prev, next) {
    [prev, next] = [ next, prev ];
    const kunMulti = columns(char, "kun").length >= 2;
    const wOn = fieldWidth(char, "on", prev, "kun", true);
    const wKun = kunMulti ? fieldWidth(char, "kun", next, "onAdd", true) : fieldWidth(char, "kun", next, "on", true);
    const wOnAdd = fieldWidthRaw(char, "onAdd", true);
    const wKunAdd = fieldWidth(char, "kunAdd", prev, "name", true);
    const namePartner = next ? [ ...lastColumn(next, "onAdd"), ...lastColumn(next, "kunAdd") ] : [];
    const wName = optimalFieldWidth(char, "name", namePartner, true);
    return Math.max(levelFor(wOn, DENSITY_STEP_PRIMARY), levelFor(wKun, DENSITY_STEP_PRIMARY), levelFor(wOnAdd, DENSITY_STEP_SECONDARY), levelFor(wKunAdd, DENSITY_STEP_SECONDARY), levelFor(wName, DENSITY_STEP_SECONDARY));
  }
  function densityBestCase(char) {
    return computeDensity(char, null, null);
  }
  function resolveRound(densities, candidates, tier, floor, seedPrev, exempt) {
    const placedOrder = seedPrev ? [ seedPrev ] : [];
    const seedOffset = placedOrder.length;
    const queue = [];
    const resolvedNext = {};
    const clamp = (d, char) => exempt && exempt.has(char) ? d : Math.max(floor, d);
    function tryResolveQueueAgainst(newChar, newCharPrev) {
      for (let qi = 0; qi < queue.length; qi++) {
        const heldChar = queue[qi];
        const heldCharNewNext = resolvedNext[newChar];
        const d = computeDensity(heldChar, newChar, heldCharNewNext);
        if (d <= tier) {
          densities[heldChar] = clamp(d, heldChar);
          queue.splice(qi, 1);
          placedOrder.push(heldChar);
          resolvedNext[newChar] = heldChar;
          resolvedNext[heldChar] = heldCharNewNext;
          densities[newChar] = clamp(computeDensity(newChar, newCharPrev, heldChar), newChar);
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
        densities[char] = exempt && exempt.has(char) ? dNatural : tier + 1;
      } else {
        densities[char] = clamp(densityBestCase(char), char);
        unconditionalChars.push(char);
      }
    }
    return {
      placedOrder: placedOrder.slice(seedOffset),
      leftoverQueue: queue.slice(),
      unconditionalChars: unconditionalChars
    };
  }
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
          break;
        }
      }
    }
    return seq;
  }
  function resolveQueueBlock(densities, seq, tier, seedPrev, roundChars, leftoverQueue) {
    const queueBlock = leftoverQueue.slice();
    let changed = true;
    while (changed && seq.length) {
      changed = false;
      const lastEntry = seq[seq.length - 1];
      const prevForLast = seq.length > 1 ? seq[seq.length - 2] : seedPrev;
      const unconditionallyDense = roundChars.filter(c => !seq.includes(c) && !queueBlock.includes(c) && densityBestCase(c) > tier).sort((a, b) => orderOf[a] - orderOf[b]);
      const rightCandidate = unconditionallyDense.length ? unconditionallyDense[0] : null;
      const d = rightCandidate ? computeDensity(lastEntry, prevForLast, rightCandidate) : densityBestCase(lastEntry);
      if (d > tier) {
        seq.pop();
        queueBlock.unshift(lastEntry);
        changed = true;
      }
    }
    if (queueBlock.length === 0) return {
      seq: seq,
      queueOrder: []
    };
    if (queueBlock.length === 1) {
      const char = queueBlock[0];
      const prev = seq.length ? seq[seq.length - 1] : seedPrev;
      const unconditionallyDense = roundChars.filter(c => !seq.includes(c) && c !== char && densityBestCase(c) > tier).sort((a, b) => orderOf[a] - orderOf[b]);
      const next = unconditionallyDense.length ? unconditionallyDense[0] : null;
      densities[char] = computeDensity(char, prev, next);
      return {
        seq: seq,
        queueOrder: queueBlock
      };
    }
    const leftBorder = seq.length ? seq[seq.length - 1] : seedPrev;
    const unconditionallyDense = roundChars.filter(c => !seq.includes(c) && !queueBlock.includes(c)).sort((a, b) => orderOf[a] - orderOf[b]);
    const rightBorder = unconditionallyDense.length ? unconditionallyDense[0] : null;
    function densitiesFor(perm) {
      const chain = [ leftBorder, ...perm, rightBorder ].filter(x => x !== null);
      const rightOffset = rightBorder !== null ? 1 : 0;
      const ds = [];
      for (let i = 1; i < chain.length - rightOffset; i++) ds.push(computeDensity(chain[i], chain[i - 1], chain[i + 1]));
      return ds;
    }
    const naturalSorted = queueBlock.slice().sort((a, b) => orderOf[a] - orderOf[b]);
    const naturalIdx = new Map(naturalSorted.map((c, i) => [ c, i ]));
    const permCandidates = queueBlock.length <= 7 ? permutationsOf(queueBlock) : [ naturalSorted ];
    let best = null;
    for (const perm of permCandidates) {
      const ds = densitiesFor(perm);
      const cand = {
        perm: perm,
        zeroCount: ds.filter(d => d <= tier).length,
        maxD: Math.max(...ds),
        dist: inversionCount(perm.map(c => naturalIdx.get(c)))
      };
      if (!best || cand.zeroCount > best.zeroCount || cand.zeroCount === best.zeroCount && cand.maxD < best.maxD || cand.zeroCount === best.zeroCount && cand.maxD === best.maxD && cand.dist < best.dist) best = cand;
    }
    const chain = [ leftBorder, ...best.perm, rightBorder ].filter(x => x !== null);
    const rightOffset = rightBorder !== null ? 1 : 0;
    for (let i = 1; i < chain.length - rightOffset; i++) densities[chain[i]] = computeDensity(chain[i], chain[i - 1], chain[i + 1]);
    return {
      seq: seq,
      queueOrder: best.perm
    };
  }
  function resolveOneRound(densities, candidates, tier, floor, seedPrev, exempt) {
    const forward = resolveRound(densities, candidates, tier, floor, seedPrev, exempt);
    const seq = stabilizeInternal(densities, forward.placedOrder, tier, seedPrev);
    const {seq: seqFinal, queueOrder: queueOrder} = resolveQueueBlock(densities, seq, tier, seedPrev, candidates, forward.leftoverQueue);
    return {
      order: [ ...seqFinal, ...queueOrder ],
      queueOrder: queueOrder,
      unconditionalChars: forward.unconditionalChars
    };
  }
  const densities = {};
  const round0 = resolveOneRound(densities, allChars, 0, 0, null, null);
  const round0Order = round0.order;
  const tailChars = allChars.filter(c => !round0Order.includes(c)).sort((a, b) => densities[a] - densities[b] || orderOf[a] - orderOf[b]);
  const round0QueueExempt = new Set(round0.queueOrder);
  const frontLast = round0Order.length ? round0Order[round0Order.length - 1] : null;
  let round1Order = [], round1 = null;
  if (tailChars.length > 1) {
    round1 = resolveOneRound(densities, tailChars, 1, 1, frontLast, round0QueueExempt);
    round1Order = round1.order;
  }
  const beyond = sorted.filter(k => densities[k.char] > 1 && !round1Order.includes(k.char)).sort((a, b) => densities[a.char] - densities[b.char] || a.order - b.order).map(k => k.char);
  const finalOrder = [ ...round0Order, ...round1Order, ...beyond ];
  const positions = Object.fromEntries(finalOrder.map((c, i) => [ c, i ]));
  const rounds = [ round0, round1 ].filter(Boolean);
  const classification = {};
  sorted.forEach(k => {
    const char = k.char;
    if (densities[char] <= 0) return;
    for (let r = 0; r < rounds.length; r++) {
      if (rounds[r].queueOrder.includes(char)) {
        classification[char] = {
          type: "queue",
          round: r
        };
        return;
      }
    }
    for (let r = rounds.length - 1; r >= 0; r--) {
      if (rounds[r].unconditionalChars.includes(char)) {
        classification[char] = {
          type: "unconditional",
          round: r
        };
        return;
      }
    }
  });
  return {
    positions: positions,
    classification: classification
  };
}

function markDensityResolutionClasses() {
  const {classification: classification} = computeDensityPreview();
  document.querySelectorAll("#kanji-grid .kc:not(.legendCard)").forEach(card => {
    [ ...card.classList ].filter(c => /^density(Queue|Unconditional)R\d+$/.test(c)).forEach(c => card.classList.remove(c));
  });
  Object.entries(classification).forEach(([char, {type: type, round: round}]) => {
    const card = document.getElementById("kc-" + char);
    if (card) card.classList.add(`density${type === "queue" ? "Queue" : "Unconditional"}R${round}`);
  });
}

function rerenderAllCards() {
  appState.kanji.forEach(k => rerenderCard(k.char));
  appState.customKanji.forEach(k => rerenderCard(k.char));
}

function rerenderCard(char) {
  const grid = document.getElementById("kanji-grid");
  const custom = isCustomKanji(char);
  const k = custom ? appState.customKanji.find(c => c.char === char) : findBaseKanji(char);
  if (!k) return;
  const id = "kc-" + char;
  const wordsForChar = custom ? {
    [char]: appState.customWords[char] || []
  } : appState.words;
  const html = buildCard(k, wordsForChar, appState.moraInfo, appState.kanjiOverrides, appState.wordOverrides);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  const newCard = wrapper.firstElementChild;
  const old = document.getElementById(id);
  if (old) old.replaceWith(newCard); else grid.appendChild(newCard);
  initCard(newCard);
  resortGridCards();
  setTimeout(() => {
    applyRowRescueSwaps();
    document.querySelectorAll("#kanji-grid .kc:not(.legendCard)").forEach(capCardReadingOverflow);
    markDensityResolutionClasses();
  }, 0);
}

function updateDataButtonsVisibility() {
  const isEmpty = Object.keys(appState.kanjiOverrides).length === 0 && Object.keys(appState.wordOverrides).length === 0 && appState.customKanji.length === 0 && Object.keys(appState.customWords).length === 0;
  const exportBtn = document.getElementById("exportAdditionsBtn");
  const resetBtn = document.getElementById("resetDataBtn");
  if (exportBtn) exportBtn.disabled = isEmpty;
  if (resetBtn) resetBtn.disabled = isEmpty;
}

function resetAllData() {
  if (!confirm("Reset all local changes and additions? This clears every edit and custom kanji saved in this browser and cannot be undone.")) return;
  localStorage.removeItem(KANJI_OVERRIDES_KEY);
  localStorage.removeItem(WORD_OVERRIDES_KEY);
  localStorage.removeItem(CUSTOM_KANJI_KEY);
  localStorage.removeItem(CUSTOM_WORDS_KEY);
  location.reload();
}

function confirmFieldEdit(char, label) {
  if (isCustomKanji(char)) return true;
  if (!appState.settings.confirmOverwrite) return true;
  return window.confirm(`Save this change to ${char}'s ${label}? (Stays only in your browser until exported from the nav menu.)`);
}

function getCurrentFieldValue(char, field) {
  const custom = isCustomKanji(char);
  const rec = custom ? appState.customKanji.find(k => k.char === char) : findBaseKanji(char);
  if (!rec) return OVERRIDABLE_ARRAY_FIELDS.has(field) ? [] : "";
  if (custom) return rec[field];
  const ov = appState.kanjiOverrides[char];
  return ov && ov[field] !== undefined ? ov[field] : rec[field];
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

function initFieldEditing() {
  document.addEventListener("click", e => {
    if (!appState.settings.editMode) return;
    const el = e.target.closest("[data-field]");
    if (!el || el.isContentEditable) return;
    const {char: char, field: field} = el.dataset;
    const isArray = OVERRIDABLE_ARRAY_FIELDS.has(field);
    const current = getCurrentFieldValue(char, field);
    const originalText = isArray ? (current || []).join(", ") : current || "";
    el.textContent = originalText;
    el.contentEditable = "true";
    el.classList.add("editing");
    el.focus();
    selectAllText(el);
    const finish = commit => {
      el.removeEventListener("keydown", onKeydown);
      el.removeEventListener("blur", onBlur);
      if (commit && el.textContent.trim() !== originalText.trim()) {
        const raw = el.textContent.trim();
        const value = isArray ? raw.split(",").map(s => s.trim()).filter(Boolean) : raw;
        if (confirmFieldEdit(char, field)) saveFieldEdit(char, field, value);
      }
      rerenderCard(char);
    };
    const onKeydown = ev => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        el.blur();
      } else if (ev.key === "Escape") {
        finish(false);
      }
    };
    const onBlur = () => finish(true);
    el.addEventListener("keydown", onKeydown);
    el.addEventListener("blur", onBlur);
  });
}

function getMergedWordEntries(char) {
  const custom = isCustomKanji(char);
  const wOvForChar = appState.wordOverrides && appState.wordOverrides[char] || {};
  const wordsForChar = custom ? appState.customWords[char] || [] : appState.words && appState.words[char] || [];
  const merged = [ ...wordsForChar ];
  Object.keys(wOvForChar).forEach(idxStr => {
    const ov = wOvForChar[idxStr];
    const pos = merged.findIndex(e => e.word === ov.word);
    if (pos >= 0) merged[pos] = ov; else merged.push(ov);
  });
  return merged;
}

function saveWordSlot(char, idx, wordObj) {
  const full = {
    ...wordObj,
    selfAdded: true
  };
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

function initPositionQuickEdit() {
  const commit = input => {
    const char = input.closest(".positionQuickPopup").dataset.char;
    moveKanjiToPosition(char, Number(input.value));
  };
  document.addEventListener("change", e => {
    if (e.target.matches(".positionQuickInput")) commit(e.target);
  });
  document.addEventListener("keydown", e => {
    if (e.target.matches(".positionQuickInput") && e.key === "Enter") e.target.blur();
  });
}

function initWordSlotEditing() {
  document.addEventListener("click", e => {
    if (!appState.settings.editMode && e.target.closest(".wordMeaning")) e.stopPropagation();
  }, true);
  document.addEventListener("click", e => {
    const addBtn = e.target.closest(".addWordBtn");
    if (addBtn) {
      if (!appState.settings.editMode) return;
      const {char: char} = addBtn.dataset;
      const rec = appState.customKanji.find(k => k.char === char);
      if (!rec) return;
      const idx = rec.frequentWord.length;
      rec.frequentWord.push(idx);
      rec.frequentWordMeaning.push("");
      saveLocal(CUSTOM_KANJI_KEY, appState.customKanji);
      appState.customWords[char] = appState.customWords[char] || [];
      appState.customWords[char][idx] = {
        word: "",
        kana: "",
        meaning: [ "" ],
        pos: null,
        jlpt: null,
        pitch: null,
        selfAdded: true
      };
      saveLocal(CUSTOM_WORDS_KEY, appState.customWords);
      rerenderCard(char);
      return;
    }
    const chip = e.target.closest(".wordKanji[data-idx]");
    if (chip) {
      const {char: char, idx: idx} = chip.dataset;
      const trigger = document.querySelector(`.wordMeaning[data-char="${CSS.escape(char)}"][data-idx="${CSS.escape(idx)}"]`);
      if (trigger) trigger.click();
      return;
    }
    const saveBtn = e.target.closest(".wsSave");
    const cancelBtn = e.target.closest(".wsCancel");
    if (!saveBtn && !cancelBtn) return;
    const popup = e.target.closest(".wordSlotPopup");
    const trigger = popup.parentElement.querySelector(".wordMeaning");
    const {char: char, idx: idx} = trigger.dataset;
    if (saveBtn) {
      const word = popup.querySelector(".wsWord").value.trim();
      if (!word) {
        alert("Word text is required.");
        return;
      }
      const wordObj = {
        word: word,
        kana: popup.querySelector(".wsKana").value.trim(),
        pitch: popup.querySelector(".wsPitch").value === "" ? null : Number(popup.querySelector(".wsPitch").value),
        pos: popup.querySelector(".wsPos").value.trim() || null,
        jlpt: popup.querySelector(".wsJlpt").value.trim() || null,
        meaning: [ popup.querySelector(".wsMeaning").value.trim() ]
      };
      if (confirmFieldEdit(char, `word #${Number(idx) + 1}`)) saveWordSlot(char, idx, wordObj);
    }
    closePopups();
    rerenderCard(char);
  });
}

function downloadJSON(filename, data) {
  const blob = new Blob([ JSON.stringify(data, null, 2) ], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAdditions() {
  downloadJSON("kanjiOverrides.json", {
    overrides: appState.kanjiOverrides,
    custom: appState.customKanji
  });
  downloadJSON("wordOverrides.json", {
    overrides: appState.wordOverrides,
    custom: appState.customWords
  });
}

const ADD_KANJI_FIELD_INPUTS = {
  variants: "akVariants",
  components: "akComponents",
  componentsExtensive: "akComponentsExtensive",
  on: "akOn",
  onAdd: "akOnAdd",
  kun: "akKun",
  kunAdd: "akKunAdd",
  name: "akName"
};

const KUN_MEANING_FIELDS = {
  kunMeaning: {
    readingField: "kun",
    readingInput: "akKun",
    container: "akKunMeanings"
  },
  kunAddMeaning: {
    readingField: "kunAdd",
    readingInput: "akKunAdd",
    container: "akKunAddMeanings",
    fieldWrapper: "akKunAddMeaningField"
  }
};

function initAddKanjiModal() {
  const overlay = document.getElementById("addKanjiModal");
  const openBtn = document.getElementById("addKanjiBtn");
  const saveBtn = document.getElementById("addKanjiSaveBtn");
  const cancelBtn = document.getElementById("addKanjiCancelBtn");
  const deleteBtn = document.getElementById("addKanjiDeleteBtn");
  const charInput = document.getElementById("akChar");
  const positionInput = document.getElementById("akPosition");
  const titleEl = document.getElementById("addKanjiModalTitle");
  const allWordsEl = document.getElementById("akAllWords");
  const addWordBtn = document.getElementById("akAddWordBtn");
  const freqPickers = [ 0, 1, 2 ].map(slot => document.querySelector(`.akFreqWordPicker[data-slot="${slot}"]`));
  const glossInputs = [ 0, 1, 2 ].map(slot => document.querySelector(`.akCardGloss[data-slot="${slot}"]`));
  let editingChar = null;
  let editOriginal = null;
  function clearForm() {
    overlay.querySelectorAll("input, textarea").forEach(el => {
      el.value = "";
    });
  }
  function close() {
    overlay.hidden = true;
  }
  function splitList(value) {
    return value.split(",").map(s => s.trim()).filter(Boolean);
  }
  function buildKunMeaningEntryHTML(reading, value) {
    return `<label class="modalKunMeaningEntry"><span class="modalKunMeaningReading">${reading}</span>` + `<input class="akKunMeaningInput" value="${value ? value.replace(/"/g, "&quot;") : ""}" autocomplete="off"></label>`;
  }
  function renderKunMeaningInputs(containerEl, readings, values) {
    containerEl.innerHTML = readings.map((r, i) => buildKunMeaningEntryHTML(r, (values || [])[i])).join("");
  }
  function currentKunMeaningValues(containerEl) {
    return [ ...containerEl.querySelectorAll(".akKunMeaningInput") ].map(el => el.value.trim());
  }
  function revealKunAddMeaningField() {
    document.getElementById(KUN_MEANING_FIELDS.kunAddMeaning.fieldWrapper).hidden = false;
  }
  function refreshKunMeaningInputs(readingInputEl, containerEl) {
    const readings = splitList(readingInputEl.value);
    const existingValues = currentKunMeaningValues(containerEl);
    renderKunMeaningInputs(containerEl, readings, existingValues);
  }
  function buildWordEntryHTML() {
    return `\n      <div class="modalWordEntry">\n        <div class="modalWordEntryFields">\n          <label class="modalWordEntryWord">word <input class="awWord" autocomplete="off"></label>\n          <label class="modalWordEntryWord">pos <input class="awPos" autocomplete="off"></label>\n          <label class="modalWordEntryNarrow">pitch <input class="awPitch" type="number" min="0" autocomplete="off"></label>\n          <label class="modalWordEntryNarrow">JLPT\n            <span class="modalJlptField"><span class="modalJlptN">N</span><input class="awJlpt" type="number" min="1" max="5" autocomplete="off"></span>\n          </label>\n          <label class="modalWordEntryFull">kana <input class="awKana" autocomplete="off"></label>\n        </div>\n        <div class="modalMeaningGroup">\n          <span class="modalMeaningLabel">meaning</span>\n          <textarea class="awMeaning" placeholder="sense 1" rows="1" autocomplete="off"></textarea>\n          <textarea class="awMeaning" placeholder="sense 2" rows="1" autocomplete="off"></textarea>\n          <textarea class="awMeaning" placeholder="sense 3" rows="1" autocomplete="off"></textarea>\n          <textarea class="awMeaning" placeholder="sense 4" rows="1" autocomplete="off"></textarea>\n        </div>\n      </div>`;
  }
  function jlptToDigit(jlpt) {
    const m = jlpt ? String(jlpt).match(/\d/) : null;
    return m ? m[0] : "";
  }
  function digitToJlpt(digit) {
    return digit ? "N" + digit : null;
  }
  function fillWordEntry(entryEl, entry) {
    entryEl.querySelector(".awWord").value = entry ? entry.word || "" : "";
    entryEl.querySelector(".awKana").value = entry ? entry.kana || "" : "";
    entryEl.querySelector(".awPitch").value = entry && entry.pitch != null ? entry.pitch : "";
    entryEl.querySelector(".awPos").value = entry ? entry.pos || "" : "";
    entryEl.querySelector(".awJlpt").value = entry ? jlptToDigit(entry.jlpt) : "";
    const meaningInputs = entryEl.querySelectorAll(".awMeaning");
    const meanings = entry ? entry.meaning || [] : [];
    meaningInputs.forEach((el, mi) => {
      el.value = meanings[mi] || "";
    });
  }
  function entryToWordObj(entryEl) {
    const word = entryEl.querySelector(".awWord").value.trim();
    if (!word) return null;
    const pitchRaw = entryEl.querySelector(".awPitch").value;
    return {
      word: word,
      kana: entryEl.querySelector(".awKana").value.trim(),
      pitch: pitchRaw === "" ? null : Number(pitchRaw),
      pos: entryEl.querySelector(".awPos").value.trim() || null,
      jlpt: digitToJlpt(entryEl.querySelector(".awJlpt").value.trim()),
      meaning: [ ...entryEl.querySelectorAll(".awMeaning") ].map(el => el.value.trim()).filter(Boolean),
      selfAdded: true
    };
  }
  function renderAllWords(char) {
    const list = char ? getMergedWordEntries(char) : [];
    allWordsEl.innerHTML = list.map(buildWordEntryHTML).join("");
    [ ...allWordsEl.children ].forEach((el, i) => fillWordEntry(el, list[i]));
  }
  function refreshFreqPickerOptions() {
    const words = [ ...allWordsEl.children ].map(el => el.querySelector(".awWord").value.trim() || "(blank)");
    const optionsHTML = words.map((w, i) => `<option value="${i}">${w}</option>`).join("");
    freqPickers.forEach(picker => {
      const prev = picker.value;
      picker.innerHTML = '<option value="">— none —</option>' + optionsHTML;
      picker.value = prev;
      if (picker.value !== prev) picker.value = "";
    });
  }
  function openForAdd() {
    editingChar = null;
    clearForm();
    charInput.disabled = false;
    deleteBtn.hidden = true;
    positionInput.value = nextOrderValue();
    renderAllWords(null);
    refreshFreqPickerOptions();
    Object.values(KUN_MEANING_FIELDS).forEach(({container: container}) => {
      document.getElementById(container).innerHTML = "";
    });
    document.getElementById(KUN_MEANING_FIELDS.kunAddMeaning.fieldWrapper).hidden = true;
    titleEl.textContent = "Add a new kanji";
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
    positionInput.value = getCurrentFieldValue(char, "position");
    document.getElementById("akMeaning").value = getCurrentFieldValue(char, "meaning") || "";
    Object.entries(ADD_KANJI_FIELD_INPUTS).forEach(([field, id]) => {
      document.getElementById(id).value = (getCurrentFieldValue(char, field) || []).join(", ");
    });
    Object.entries(KUN_MEANING_FIELDS).forEach(([field, {readingField: readingField, container: container}]) => {
      const readings = getCurrentFieldValue(char, readingField) || [];
      renderKunMeaningInputs(document.getElementById(container), readings, getCurrentFieldValue(char, field) || []);
    });
    const hasKunAddMeaning = (getCurrentFieldValue(char, "kunAddMeaning") || []).some(Boolean);
    document.getElementById(KUN_MEANING_FIELDS.kunAddMeaning.fieldWrapper).hidden = !hasKunAddMeaning;
    renderAllWords(char);
    refreshFreqPickerOptions();
    const mergedList = getMergedWordEntries(char);
    const freqWord = getCurrentFieldValue(char, "frequentWord") || [];
    const glosses = getCurrentFieldValue(char, "frequentWordMeaning") || [];
    freqPickers.forEach((picker, slot) => {
      const w = freqWord[slot];
      const idx = typeof w === "number" ? w : mergedList.findIndex(e => e.word === w);
      picker.value = idx >= 0 ? String(idx) : "";
    });
    glossInputs.forEach((input, slot) => {
      input.value = glosses[slot] || "";
    });
    titleEl.textContent = `Edit ${char}`;
    overlay.hidden = false;
    editOriginal = {
      meaning: document.getElementById("akMeaning").value,
      position: positionInput.value,
      fields: {},
      kunMeanings: {},
      frequentWord: [ ...freqWord ],
      glosses: [ ...glosses ],
      allWords: mergedList.map(e => JSON.stringify({
        word: e.word,
        kana: e.kana || "",
        pitch: e.pitch != null ? e.pitch : null,
        pos: e.pos || null,
        jlpt: e.jlpt || null,
        meaning: e.meaning || []
      }))
    };
    Object.entries(ADD_KANJI_FIELD_INPUTS).forEach(([field, id]) => {
      editOriginal.fields[field] = document.getElementById(id).value;
    });
    Object.entries(KUN_MEANING_FIELDS).forEach(([field, {container: container}]) => {
      editOriginal.kunMeanings[field] = currentKunMeaningValues(document.getElementById(container));
    });
  }
  function saveNew() {
    const char = [ ...charInput.value.trim() ][0];
    if (!char) {
      alert("A character is required.");
      charInput.focus();
      return;
    }
    if (findBaseKanji(char) || isCustomKanji(char)) {
      alert(`${char} is already on this page.`);
      return;
    }
    const order = nextOrderValue();
    const desiredPosition = Number(positionInput.value);
    const rec = {
      char: char,
      order: order,
      position: order,
      meaning: document.getElementById("akMeaning").value.trim()
    };
    Object.entries(ADD_KANJI_FIELD_INPUTS).forEach(([field, id]) => {
      rec[field] = splitList(document.getElementById(id).value);
    });
    Object.entries(KUN_MEANING_FIELDS).forEach(([field, {container: container}]) => {
      rec[field] = currentKunMeaningValues(document.getElementById(container));
    });
    const oldToNewIndex = {};
    const words = [];
    [ ...allWordsEl.children ].forEach((el, oldIdx) => {
      const w = entryToWordObj(el);
      if (!w) return;
      oldToNewIndex[oldIdx] = words.length;
      words.push(w);
    });
    rec.frequentWord = [];
    rec.frequentWordMeaning = [];
    freqPickers.forEach((picker, slot) => {
      if (picker.value === "" || !(Number(picker.value) in oldToNewIndex)) return;
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
    const el = document.getElementById("kc-" + char);
    if (el) el.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
  function saveEdit() {
    const char = editingChar;
    const meaningNow = document.getElementById("akMeaning").value.trim();
    const meaningChanged = meaningNow !== editOriginal.meaning.trim();
    const positionNow = Number(positionInput.value);
    const positionChanged = Number.isFinite(positionNow) && positionNow !== Number(editOriginal.position);
    const changedFields = Object.keys(ADD_KANJI_FIELD_INPUTS).filter(field => {
      const id = ADD_KANJI_FIELD_INPUTS[field];
      return document.getElementById(id).value.trim() !== editOriginal.fields[field].trim();
    });
    const changedKunMeaningFields = Object.keys(KUN_MEANING_FIELDS).filter(field => {
      const container = document.getElementById(KUN_MEANING_FIELDS[field].container);
      return JSON.stringify(currentKunMeaningValues(container)) !== JSON.stringify(editOriginal.kunMeanings[field]);
    });
    const wordChanges = [];
    [ ...allWordsEl.children ].forEach((el, i) => {
      const obj = entryToWordObj(el);
      if (!obj) return;
      const nowRaw = JSON.stringify({
        word: obj.word,
        kana: obj.kana,
        pitch: obj.pitch,
        pos: obj.pos,
        jlpt: obj.jlpt,
        meaning: obj.meaning
      });
      if (nowRaw !== editOriginal.allWords[i]) wordChanges.push(obj);
    });
    const updatedFreqWord = [ ...editOriginal.frequentWord ];
    let freqWordChanged = false;
    freqPickers.forEach((picker, slot) => {
      if (picker.value === "") return;
      const idx = Number(picker.value);
      if (editOriginal.frequentWord[slot] !== idx) {
        updatedFreqWord[slot] = idx;
        freqWordChanged = true;
      }
    });
    const changedGlossIdx = glossInputs.map((input, slot) => input.value.trim() !== (editOriginal.glosses[slot] || "") ? slot : -1).filter(i => i >= 0);
    if (!meaningChanged && !positionChanged && !changedFields.length && !changedKunMeaningFields.length && !wordChanges.length && !freqWordChanged && !changedGlossIdx.length) {
      close();
      return;
    }
    if (!isCustomKanji(char) && appState.settings.confirmOverwrite) {
      const ok = confirm(`Save these changes to ${char}? (Stays only in your browser until exported from the nav menu.)`);
      if (!ok) return;
    }
    if (meaningChanged) saveFieldEdit(char, "meaning", meaningNow);
    if (positionChanged) moveKanjiToPosition(char, positionNow);
    changedFields.forEach(field => {
      saveFieldEdit(char, field, splitList(document.getElementById(ADD_KANJI_FIELD_INPUTS[field]).value));
    });
    changedKunMeaningFields.forEach(field => {
      const container = document.getElementById(KUN_MEANING_FIELDS[field].container);
      saveFieldEdit(char, field, currentKunMeaningValues(container));
    });
    wordChanges.forEach(obj => saveWordSlot(char, obj.word, obj));
    if (freqWordChanged) saveFieldEdit(char, "frequentWord", updatedFreqWord);
    if (changedGlossIdx.length) {
      const currentGlosses = [ ...getCurrentFieldValue(char, "frequentWordMeaning") || [] ];
      changedGlossIdx.forEach(slot => {
        currentGlosses[slot] = glossInputs[slot].value.trim();
      });
      saveFieldEdit(char, "frequentWordMeaning", currentGlosses);
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
    const card = document.getElementById("kc-" + char);
    if (card) card.remove();
    updateDataButtonsVisibility();
    close();
  }
  openBtn.addEventListener("click", openForAdd);
  cancelBtn.addEventListener("click", close);
  saveBtn.addEventListener("click", () => editingChar ? saveEdit() : saveNew());
  deleteBtn.addEventListener("click", deleteEditingKanji);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });
  document.addEventListener("click", e => {
    const btn = e.target.closest(".editKanjiBtn");
    if (btn) openForEdit(btn.dataset.char);
  });
  addWordBtn.addEventListener("click", () => {
    allWordsEl.insertAdjacentHTML("beforeend", buildWordEntryHTML());
    refreshFreqPickerOptions();
  });
  Object.entries(KUN_MEANING_FIELDS).forEach(([field, {readingInput: readingInput, container: container}]) => {
    const inputEl = document.getElementById(readingInput);
    inputEl.addEventListener("input", () => {
      refreshKunMeaningInputs(inputEl, document.getElementById(container));
    });
    if (field === "kunAddMeaning") inputEl.addEventListener("focus", revealKunAddMeaningField);
  });
  allWordsEl.addEventListener("input", e => {
    if (e.target.classList.contains("awWord")) refreshFreqPickerOptions();
  });
  freqPickers.forEach((picker, slot) => {
    picker.addEventListener("change", () => {
      glossInputs[slot].value = "";
    });
  });
}

function syncNavMenuSpacing() {
  const nav = document.getElementById("navMenu");
  if (!nav) return;
  document.body.style.paddingTop = `${nav.getBoundingClientRect().height}px`;
  const ro = new ResizeObserver(entries => {
    const height = entries[0].borderBoxSize ? entries[0].borderBoxSize[0].blockSize : nav.getBoundingClientRect().height;
    document.body.style.paddingTop = `${height}px`;
  });
  ro.observe(nav);
}

function initNavMenu() {
  const addBtn = document.getElementById("addKanjiBtn");
  const editToggle = document.getElementById("editModeToggle");
  const toggle = document.getElementById("confirmOverwriteToggle");
  const extensiveToggle = document.getElementById("extensiveComponentsToggle");
  const exportBtn = document.getElementById("exportAdditionsBtn");
  const resetBtn = document.getElementById("resetDataBtn");
  extensiveToggle.checked = appState.settings.extensiveComponents;
  extensiveToggle.addEventListener("change", () => {
    appState.settings.extensiveComponents = extensiveToggle.checked;
    saveLocal(SETTINGS_KEY, appState.settings);
    rerenderAllCards();
  });
  editToggle.checked = appState.settings.editMode;
  document.body.classList.toggle("editMode", appState.settings.editMode);
  addBtn.disabled = !appState.settings.editMode;
  editToggle.addEventListener("change", () => {
    appState.settings.editMode = editToggle.checked;
    saveLocal(SETTINGS_KEY, appState.settings);
    document.body.classList.toggle("editMode", appState.settings.editMode);
    addBtn.disabled = !appState.settings.editMode;
  });
  toggle.checked = appState.settings.confirmOverwrite;
  toggle.addEventListener("change", () => {
    appState.settings.confirmOverwrite = toggle.checked;
    saveLocal(SETTINGS_KEY, appState.settings);
  });
  const densityToggle = document.getElementById("densityFitStrategyToggle");
  densityToggle.checked = appState.settings.densityFitStrategy === "sequential";
  densityToggle.addEventListener("change", () => {
    appState.settings.densityFitStrategy = densityToggle.checked ? "sequential" : "joint";
    saveLocal(SETTINGS_KEY, appState.settings);
    applyRowRescueSwaps();
    document.querySelectorAll("#kanji-grid .kc:not(.legendCard)").forEach(capCardReadingOverflow);
  });
  exportBtn.addEventListener("click", exportAdditions);
  resetBtn.addEventListener("click", resetAllData);
  updateDataButtonsVisibility();
}

async function init() {
  const grid = document.getElementById("kanji-grid");
  try {
    const res = await fetch("data/kanji.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const kanji = await res.json();
    const [words, moraInfo, kanjiDomain, wordDomain] = await Promise.all([ fetch("data/words.json").then(r => r.ok ? r.json() : {}).catch(() => ({})), PitchAccent.loadInfo().catch(() => null), loadKanjiDomain().catch(() => ({
      overrides: {},
      custom: []
    })), loadWordDomain().catch(() => ({
      overrides: {},
      custom: {}
    })) ]);
    Object.assign(appState, {
      kanji: kanji,
      words: words,
      moraInfo: moraInfo,
      kanjiOverrides: kanjiDomain.overrides,
      customKanji: kanjiDomain.custom,
      wordOverrides: wordDomain.overrides,
      customWords: wordDomain.custom,
      settings: {
        confirmOverwrite: true,
        editMode: false,
        extensiveComponents: false,
        densityFitStrategy: "sequential",
        ...loadLocal(SETTINGS_KEY, {})
      }
    });
    initFieldEditing();
    initPositionQuickEdit();
    initWordSlotEditing();
    initNavMenu();
    syncNavMenuSpacing();
    initAddKanjiModal();
    grid.insertAdjacentHTML("beforeend", buildLegendCard());
    initCard(document.getElementById("kc-legend"));
    const allCardRecs = [ ...kanji.map(k => ({
      k: k,
      wordsForChar: words
    })), ...appState.customKanji.map(k => ({
      k: k,
      wordsForChar: {
        [k.char]: appState.customWords[k.char] || []
      }
    })) ];
    allCardRecs.sort((a, b) => {
      const pa = getEffectivePosition(a.k.char), pb = getEffectivePosition(b.k.char);
      if (pa !== pb) return pa - pb;
      return getEffectiveOrder(a.k.char) - getEffectiveOrder(b.k.char);
    });
    const allCards = [];
    allCardRecs.forEach(({k: k, wordsForChar: wordsForChar}) => {
      grid.insertAdjacentHTML("beforeend", buildCard(k, wordsForChar, moraInfo, appState.kanjiOverrides, appState.wordOverrides));
      const card = document.getElementById("kc-" + k.char);
      initCard(card);
      allCards.push(card);
    });
    grid.insertAdjacentHTML("beforeend", buildCountersPlaceholder());
    syncCountersBoxHeight();
    setTimeout(() => {
      applyRowRescueSwaps();
      allCards.forEach(capCardReadingOverflow);
      markDensityResolutionClasses();
    }, 0);
  } catch (e) {
    console.error("Failed to load kanji data:", e);
    grid.classList.add("error");
    grid.textContent = "Could not load kanji data. " + "Open this project through a local server — see README.md for instructions.";
  }
}

initPopups();

document.addEventListener("DOMContentLoaded", init);