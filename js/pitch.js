// ── Pitch accent / mora helpers ─────────────────────────────────
// Reads data/info.json for lookup data (combining kana, etc.) so the
// rules can be tuned without touching this file.

let _infoPromise = null;

/** Fetch (and cache) data/info.json. */
function loadInfo() {
  if (!_infoPromise) _infoPromise = fetch('data/info.json').then(r => r.json());
  return _infoPromise;
}

/**
 * Split a kana reading into morae.
 * Small ゃゅょぁぃぅぇぉ (and katakana equivalents) attach to the
 * preceding kana instead of forming their own mora; every other
 * character (including ん, っ, ー) is its own mora.
 */
function splitMorae(reading, info) {
  const combining = new Set(info.mora.combining);
  const morae = [];
  for (const ch of reading) {
    if (combining.has(ch) && morae.length) {
      morae[morae.length - 1] += ch;
    } else {
      morae.push(ch);
    }
  }
  return morae;
}

/**
 * Compute the high/low pattern for a reading given its pitch number.
 * Returns an array of 'H'/'L', one per mora, or null if pitch is null.
 *
 *   pitch 0        → heiban:    L H H H ...
 *   pitch 1        → atamadaka: H L L L ...
 *   pitch N (>= 2) → nakadaka/odaka: L H...H(up to N) L L ...
 */
function getPitchPattern(reading, pitch, info) {
  if (pitch == null) return null;
  const morae = splitMorae(reading, info);
  return morae.map((_, i) => {
    const n = i + 1;
    if (pitch === 0) return n === 1 ? 'L' : 'H';
    if (pitch === 1) return n === 1 ? 'H' : 'L';
    return n === 1 ? 'L' : (n <= pitch ? 'H' : 'L');
  });
}

// ── Fine-tuning: geometry ────────────────────────────────────────
// Every adjustable number for the SVG pitch diagram, in one place.
// All are in the SVG's own viewBox units (which scale together with
// PITCH_FONT_SIZE), except lineHeightEm — cellW is the width given to
// each mora "cell"; highY/lowY are the two line levels; textY is the
// character baseline; oddakaTail is how far the odaka drop-tail
// extends past the last mora; lineHeightEm is the furigana row's own
// line-spacing — the SVG's rendered height (in em, relative to the
// card's font-size), i.e. how much vertical room the furigana row
// takes relative to the kanji line above it; dotPeriod is the
// distance along the path between dot centers; dotRadius is each
// dot's radius (was stroke-width / 2 back when this was a dashed
// stroke — see buildDots()).
const PITCH_GEOMETRY = {
  cellW: 22,
  viewH: 24,
  highY: 2,   // was 5 — 3 units further from lowY, for a taller step
  lowY: 22,
  textY: 18,
  odakaTail: 10,
  lineHeightEm: 1.5,
  dotPeriod: 2,
  dotRadius: 0.75,
};
const PITCH_FONT_SIZE = 16; // viewBox units, not px — see PITCH_GEOMETRY note

/**
 * Walk a polyline (array of [x, y] points) and return evenly-spaced
 * [x, y] sample points every `period` units of cumulative path length,
 * starting at the very first point.
 *
 * This replaces drawing the line as a single dashed <polyline> with
 * stroke-dasharray/stroke-linecap: round — that technique needs the
 * dash's "on" length to be near zero for the round cap to expand into
 * a circle rather than a pill shape, but a length that small becomes
 * genuinely sub-pixel once scaled down to this diagram's actual
 * on-screen size, and some renderers silently skip drawing
 * degenerate-length dash segments below some threshold rather than
 * expanding them — "dots don't render until you zoom in enough".
 * There's no dash length that's simultaneously small enough to stay
 * round and large enough to render reliably, because both problems
 * scale with the same number. Explicit <circle> elements sidestep
 * this entirely: a circle is always round regardless of its radius,
 * and isn't subject to degenerate-dash-segment rendering heuristics.
 */
function sampleDots(points, period) {
  const dots = [];
  let travelled = 0;
  let next = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    while (next <= travelled + segLen) {
      const t = segLen === 0 ? 0 : (next - travelled) / segLen;
      dots.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      next += period;
    }
    travelled += segLen;
  }
  return dots;
}

/**
 * Build a small inline <svg> for a <rt> furigana element: the kana
 * drawn as SVG <text> plus one continuous <polyline> tracing the
 * pitch-accent shape underneath — the same technique kanshudo's own
 * pitch diagrams use. Returns null if there's no pitch data (caller
 * falls back to plain kana text).
 *
 * Drawing the whole H/L path as a single stroked polyline (rather
 * than separate CSS borders per run, which is what this project
 * tried first) means there's only ever one dash pattern for the
 * renderer to draw, so corners never show the doubled/misaligned dot
 * that came from two independent borders meeting at a miter.
 */
function buildPitchSVG(reading, pitch, info) {
  if (pitch == null || !info) return null;
  const morae   = splitMorae(reading, info);
  const pattern = getPitchPattern(reading, pitch, info);
  const { cellW, viewH, highY, lowY, textY, odakaTail, lineHeightEm, dotPeriod, dotRadius } = PITCH_GEOMETRY;
  const isOdaka = pitch === morae.length;

  // A youon mora (e.g. しゅ) is two glyphs, not one, so it needs a wider
  // cell — cellW per character in the mora, not a uniform cellW per
  // mora. Without this, the boundary line sits at the single-char
  // width and cuts through the second (small) glyph of any wider mora.
  const cellWidths = morae.map(m => cellW * m.length);
  const cellStarts = [];
  let cursor = 0;
  cellWidths.forEach(w => { cellStarts.push(cursor); cursor += w; });
  const totalWidth = cursor;

  const points = [];
  pattern.forEach((state, i) => {
    const y = state === 'H' ? highY : lowY;
    const xStart = cellStarts[i];
    const xEnd   = cellStarts[i] + cellWidths[i];
    if (points.length && points[points.length - 1][1] !== y) {
      points.push([xStart, y]); // vertical jump at this mora's boundary
    } else if (!points.length) {
      points.push([xStart, y]);
    }
    points.push([xEnd, y]);
  });
  if (isOdaka) {
    points.push([totalWidth, lowY]);              // drop straight down at the boundary...
    points.push([totalWidth + odakaTail, lowY]);  // ...then extend the tail horizontally
  }

  const width = totalWidth + (isOdaka ? odakaTail : 0);
  const dots = sampleDots(points, dotPeriod)
    .map(([x, y]) => `<circle class="pitch-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${dotRadius}" />`)
    .join('');
  const textEls = morae
    .map((m, i) => {
      const cx = cellStarts[i] + cellWidths[i] / 2;
      if (m.length === 1) {
        return `<text x="${cx}" y="${textY}" class="pitch-char" text-anchor="middle">${m}</text>`;
      }
      // Youon mora (base + small kana): two separate glyphs, roughly
      // mirrored around the cell's center (cx) by cellW/2 — base to
      // the left, small kana to the right. Tied to cellW (the general
      // horizontal-spacing knob) rather than its own variable, so it
      // scales together with the rest of the diagram's spacing. The
      // small glyph gets a couple extra units pulled back in from the
      // mirror point — nudge that -2 to taste.
      const base  = m[0];
      const small = m.slice(1);
      return `<text x="${cx - cellW / 2}" y="${textY}" class="pitch-char" text-anchor="middle">${base}</text>`
           + `<text x="${cx + cellW / 2 - 2}" y="${textY}" class="pitch-char" text-anchor="middle">${small}</text>`;
    })
    .join('');

  return `<svg class="pitch-svg" viewBox="0 0 ${width} ${viewH}" width="${(width / cellW * (PITCH_FONT_SIZE / 10)).toFixed(2)}em" height="${lineHeightEm}em" preserveAspectRatio="xMidYMid meet">${textEls}${dots}</svg>`;
}

/**
 * Build the inner HTML for a <rt> furigana element: the SVG pitch
 * diagram from buildPitchSVG() when pitch data is available, or the
 * plain reading text otherwise.
 */
function buildPitchRT(reading, pitch, info) {
  return buildPitchSVG(reading, pitch, info) || reading;
}

window.PitchAccent = { loadInfo, splitMorae, getPitchPattern, buildPitchSVG, buildPitchRT };
