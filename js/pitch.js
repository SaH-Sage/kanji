let _infoPromise = null;

function loadInfo() {
  if (!_infoPromise) _infoPromise = fetch("data/info.json").then(r => r.json());
  return _infoPromise;
}

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

function getPitchPattern(reading, pitch, info) {
  if (pitch == null) return null;
  const morae = splitMorae(reading, info);
  return morae.map((_, i) => {
    const n = i + 1;
    if (pitch === 0) return n === 1 ? "L" : "H";
    if (pitch === 1) return n === 1 ? "H" : "L";
    return n === 1 ? "L" : n <= pitch ? "H" : "L";
  });
}

const PITCH_GEOMETRY = {
  cellW: 22,
  viewH: 24,
  highY: 2,
  lowY: 22,
  textY: 18,
  odakaTail: 10,
  lineHeightEm: 1.5,
  dotPeriod: 2,
  dotRadius: .75
};

const PITCH_FONT_SIZE = 16;

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
      dots.push([ x1 + (x2 - x1) * t, y1 + (y2 - y1) * t ]);
      next += period;
    }
    travelled += segLen;
  }
  return dots;
}

function buildPitchSVG(reading, pitch, info) {
  if (pitch == null || !info) return null;
  const morae = splitMorae(reading, info);
  const pattern = getPitchPattern(reading, pitch, info);
  const {cellW: cellW, viewH: viewH, highY: highY, lowY: lowY, textY: textY, odakaTail: odakaTail, lineHeightEm: lineHeightEm, dotPeriod: dotPeriod, dotRadius: dotRadius} = PITCH_GEOMETRY;
  const isOdaka = pitch === morae.length;
  const cellWidths = morae.map(m => cellW * m.length);
  const cellStarts = [];
  let cursor = 0;
  cellWidths.forEach(w => {
    cellStarts.push(cursor);
    cursor += w;
  });
  const totalWidth = cursor;
  const points = [];
  pattern.forEach((state, i) => {
    const y = state === "H" ? highY : lowY;
    const xStart = cellStarts[i];
    const xEnd = cellStarts[i] + cellWidths[i];
    if (points.length && points[points.length - 1][1] !== y) {
      points.push([ xStart, y ]);
    } else if (!points.length) {
      points.push([ xStart, y ]);
    }
    points.push([ xEnd, y ]);
  });
  if (isOdaka) {
    points.push([ totalWidth, lowY ]);
    points.push([ totalWidth + odakaTail, lowY ]);
  }
  const width = totalWidth + (isOdaka ? odakaTail : 0);
  const dots = sampleDots(points, dotPeriod).map(([x, y]) => `<circle class="pitch-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${dotRadius}" />`).join("");
  const textEls = morae.map((m, i) => {
    const cx = cellStarts[i] + cellWidths[i] / 2;
    if (m.length === 1) {
      return `<text x="${cx}" y="${textY}" class="pitch-char" text-anchor="middle">${m}</text>`;
    }
    const base = m[0];
    const small = m.slice(1);
    return `<text x="${cx - cellW / 2}" y="${textY}" class="pitch-char" text-anchor="middle">${base}</text>` + `<text x="${cx + cellW / 2 - 2}" y="${textY}" class="pitch-char" text-anchor="middle">${small}</text>`;
  }).join("");
  return `<svg class="pitch-svg" viewBox="0 0 ${width} ${viewH}" width="${(width / cellW * (PITCH_FONT_SIZE / 10)).toFixed(2)}em" height="${lineHeightEm}em" preserveAspectRatio="xMidYMid meet">${textEls}${dots}</svg>`;
}

function buildPitchRT(reading, pitch, info) {
  return buildPitchSVG(reading, pitch, info) || reading;
}

window.PitchAccent = {
  loadInfo: loadInfo,
  splitMorae: splitMorae,
  getPitchPattern: getPitchPattern,
  buildPitchSVG: buildPitchSVG,
  buildPitchRT: buildPitchRT
};