function initRuler(container) {
  const YC = "#F5C518", BC = "#4FB8E8", RC = "#EE4444", WC = "#FFFFFF", MC = "#aaaaaa";
  const OC = "#FF8C42", PC = "#C07AE8";
  const CW = 60, TH = 112, CH = 28, BH = 24;
  const SANS = "'Hiragino Sans','Yu Gothic','Meiryo',sans-serif";
  const SERIF = "'Hiragino Mincho ProN','Yu Mincho','MS Mincho',serif";
  function toKanji(n) {
    if (!n) return "零";
    const d = [ "", "一", "二", "三", "四", "五", "六", "七", "八", "九" ];
    if (n < 10) return d[n];
    if (n < 100) {
      const t = ~~(n / 10), o = n % 10;
      return (t === 1 ? "十" : d[t] + "十") + d[o];
    }
    const h = ~~(n / 100), rem = n % 100, hs = h === 1 ? "百" : d[h] + "百";
    if (!rem) return hs;
    const t = ~~(rem / 10), o = rem % 10;
    return hs + (t ? t === 1 ? "十" : d[t] + "十" : "") + d[o];
  }
  const STD = [ "", "いち", "に", "さん", "し", "ご", "ろく", "しち", "はち", "く" ];
  const ALT = [ "", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう" ];
  function toR(n, alt) {
    const d = alt ? ALT : STD;
    if (!n) return "れい";
    if (n < 10) return d[n];
    if (n < 100) {
      const t = ~~(n / 10), o = n % 10;
      return (t === 1 ? "じゅう" : STD[t] + "じゅう") + d[o];
    }
    if (n === 100) return "ひゃく";
    const rem = n - 100, t = ~~(rem / 10), o = rem % 10;
    return "ひゃく" + (t ? t === 1 ? "じゅう" : STD[t] + "じゅう" : "") + d[o];
  }
  function isExc(n) {
    const o = n % 10;
    return o === 4 || o === 7 || o === 9;
  }
  function splitKanji(n, suffix, suffixC) {
    const kj = toKanji(n), pre = kj.slice(0, -1), suf = kj.slice(-1);
    const parts = [];
    if (pre) parts.push({
      t: pre,
      c: WC,
      serif: true
    });
    parts.push({
      t: suf,
      c: RC,
      serif: true
    });
    if (suffix) parts.push({
      t: suffix,
      c: suffixC,
      serif: true
    });
    return parts;
  }
  const DAYS_D = {
    1: [ {
      t: "ついたち",
      c: YC
    } ],
    2: [ {
      t: "ふつか",
      c: YC
    } ],
    3: [ {
      t: "みっか",
      c: YC
    } ],
    4: [ {
      t: "よっか",
      c: YC
    } ],
    5: [ {
      t: "いつか",
      c: YC
    } ],
    6: [ {
      t: "むいか",
      c: YC
    } ],
    7: [ {
      t: "なのか",
      c: YC
    } ],
    8: [ {
      t: "ようか",
      c: YC
    } ],
    9: [ {
      t: "ここのか",
      c: YC
    } ],
    10: [ {
      t: "とおか",
      c: YC
    } ],
    14: [ {
      t: "じゅうよっか",
      c: YC
    } ],
    20: [ {
      t: "はつか",
      c: YC
    } ],
    24: [ {
      t: "にじゅうよっか",
      c: YC
    } ]
  };
  const KUN_D = {
    1: [ {
      t: "ひとつ",
      c: BC
    } ],
    2: [ {
      t: "ふたつ",
      c: BC
    } ],
    3: [ {
      t: "みっつ",
      c: BC
    } ],
    4: [ {
      t: "よっつ",
      c: BC
    } ],
    5: [ {
      t: "いつつ",
      c: BC
    } ],
    6: [ {
      t: "むっつ",
      c: BC
    } ],
    7: [ {
      t: "ななつ",
      c: BC
    } ],
    8: [ {
      t: "やっつ",
      c: BC
    } ],
    9: [ {
      t: "ここのつ",
      c: BC
    } ],
    10: [ {
      t: "とお",
      c: BC
    } ]
  };
  const MONTHS_D = {
    30: [ {
      t: "いっかげつ",
      c: PC
    } ],
    60: [ {
      t: "にかげつ",
      c: PC
    } ],
    90: [ {
      t: "三",
      c: WC,
      serif: true
    }, {
      t: "ヶ月",
      c: PC,
      serif: true
    } ],
    120: [ {
      t: "四",
      c: RC,
      serif: true
    }, {
      t: "ヶ月",
      c: PC,
      serif: true
    } ]
  };
  const WEEKS_D = (() => {
    const d = {}, GEM = new Set([ 8, 10, 11 ]);
    for (let w = 1; w <= 17; w++) {
      const pos = w * 7, kj = toKanji(w);
      if (w === 1) {
        d[pos] = [ {
          t: "いっしゅうかん",
          c: OC
        } ];
      } else if (w === 2) {
        d[pos] = [ {
          t: "にしゅうかん",
          c: OC
        } ];
      } else if (GEM.has(w)) {
        d[pos] = [ {
          t: kj,
          c: WC,
          serif: true
        }, {
          t: "っ",
          c: OC
        }, {
          t: "週間",
          c: OC,
          serif: true
        } ];
      } else if (isExc(w)) {
        d[pos] = splitKanji(w, "週間", OC);
      } else {
        d[pos] = [ {
          t: kj,
          c: WC,
          serif: true
        }, {
          t: "週間",
          c: OC,
          serif: true
        } ];
      }
    }
    return d;
  })();
  function mk(tag, css) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    return e;
  }
  function makeCell(parts, w, h) {
    const c = mk("div", `width:${w || CW}px;flex-shrink:0;height:${h || BH}px;display:flex;align-items:center;justify-content:center;font-size:11px;white-space:nowrap;overflow:visible;`);
    if (!parts || !parts.length) return c;
    parts.forEach(p => {
      const s = document.createElement("span");
      s.style.color = p.c || WC;
      s.style.fontFamily = p.serif ? SERIF : SANS;
      if (p.dotted) {
        s.style.textDecoration = "underline dotted";
        s.style.textUnderlineOffset = "2px";
      }
      s.textContent = p.t;
      c.appendChild(s);
    });
    return c;
  }
  function makeDownCell(n) {
    const fs = n > 20 && isExc(n) ? 13 : 11;
    const c = mk("div", `width:${CW}px;flex-shrink:0;height:${BH}px;display:flex;align-items:center;justify-content:center;font-size:${fs}px;white-space:nowrap;overflow:visible;`);
    if (!isExc(n)) {
      if (n > 20) return c;
      const s = document.createElement("span");
      s.style.color = MC;
      s.style.fontFamily = SANS;
      s.textContent = toR(n, false);
      c.appendChild(s);
      return c;
    }
    if (n <= 20) {
      const s = document.createElement("span");
      s.style.color = RC;
      s.style.fontFamily = SANS;
      s.textContent = toR(n, true);
      c.appendChild(s);
    } else {
      const kj = toKanji(n), pre = kj.slice(0, -1), suf = kj.slice(-1);
      if (pre) {
        const s = mk("span");
        s.style.color = WC;
        s.style.fontFamily = SERIF;
        s.textContent = pre;
        c.appendChild(s);
      }
      const s2 = mk("span");
      s2.style.color = RC;
      s2.style.fontFamily = SERIF;
      s2.textContent = suf;
      c.appendChild(s2);
    }
    return c;
  }
  const DATA = Array.from({
    length: 121
  }, (_, n) => {
    let slots;
    if (n === 0) {
      slots = [ null, null, [ {
        t: "まる",
        c: WC,
        dotted: true
      } ], [ {
        t: "ゼロ",
        c: WC
      } ], [ {
        t: "れい",
        c: WC
      } ] ];
    } else {
      slots = [ MONTHS_D[n] || null, WEEKS_D[n] || null, DAYS_D[n] || null, KUN_D[n] || null, n <= 20 ? [ {
        t: toR(n, false),
        c: WC
      } ] : null ];
    }
    let chg = true;
    while (chg) {
      chg = false;
      for (let i = slots.length - 2; i >= 0; i--) {
        if (slots[i] && !slots[i + 1]) {
          slots[i + 1] = slots[i];
          slots[i] = null;
          chg = true;
        }
      }
    }
    return {
      n: n,
      k: toKanji(n),
      slots: slots
    };
  });
  const wrap = mk("div", "display:flex;align-items:stretch;");
  const lbl = mk("div", "flex-shrink:0;display:flex;flex-direction:column;");
  [ {
    h: BH,
    c: PC,
    t: "月"
  }, {
    h: BH,
    c: OC,
    t: "週"
  }, {
    h: BH,
    c: YC,
    t: "日"
  }, {
    h: BH,
    c: BC,
    t: "訓"
  }, {
    h: BH,
    c: WC,
    t: "音"
  }, {
    h: TH,
    c: "transparent",
    t: ""
  }, {
    h: BH,
    c: RC,
    t: "音"
  } ].forEach(l => {
    const e = mk("div", `height:${l.h}px;display:flex;align-items:center;color:${l.c};font-size:${l.h === TH ? 0 : 18}px;font-family:${SERIF};padding:0 10px 0 14px;`);
    e.textContent = l.t;
    lbl.appendChild(e);
  });
  wrap.appendChild(lbl);
  const con = mk("div", "display:flex;flex-direction:column;width:max-content;padding-right:20px;");
  for (let row = 0; row < 5; row++) {
    const r = mk("div", `display:flex;height:${BH}px;`);
    DATA.forEach(d => r.appendChild(makeCell(d.slots[row])));
    con.appendChild(r);
  }
  const tR = mk("div", `display:flex;height:${TH}px;`);
  DATA.forEach(d => {
    const col = mk("div", `width:${CW}px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;height:${TH}px;`);
    const top = mk("div", `flex:1;width:1.5px;background:${WC};margin:0 auto;`);
    const k = mk("div", `writing-mode:vertical-rl;text-orientation:mixed;font-size:${CH}px;line-height:1;color:${WC};font-family:${SERIF};font-weight:300;`);
    k.textContent = d.k;
    const bot = mk("div", `flex:1;width:1.5px;background:${WC};margin:0 auto;`);
    col.appendChild(top);
    col.appendChild(k);
    col.appendChild(bot);
    tR.appendChild(col);
  });
  con.appendChild(tR);
  const gR = mk("div", `display:flex;height:${BH}px;`);
  DATA.forEach(d => gR.appendChild(makeDownCell(d.n)));
  con.appendChild(gR);
  wrap.appendChild(con);
  container.appendChild(wrap);
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("rulerRow");
  if (container) initRuler(container);
});