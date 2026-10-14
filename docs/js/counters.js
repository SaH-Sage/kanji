const CounterReadings = (() => {
  const digit = [ "", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう" ];
  const glyph = [ "", "一", "二", "三", "四", "五", "六", "七", "八", "九" ];
  function valid(n) {
    return Number.isInteger(n) && n >= 0 && n <= 120;
  }
  function numeral(n) {
    if (!valid(n)) return "";
    if (!n) return "零";
    const h = n >= 100 ? "百" : "", r = n % 100, t = Math.floor(r / 10), o = r % 10;
    return h + (t ? (t === 1 ? "" : glyph[t]) + "十" : "") + glyph[o];
  }
  function number(n) {
    if (!valid(n)) return "";
    if (!n) return "れい";
    const r = n % 100, t = Math.floor(r / 10);
    return (n >= 100 ? "ひゃく" : "") + (t ? (t === 1 ? "" : digit[t]) + "じゅう" : "") + digit[r % 10];
  }
  function counter(n, units, ten, hundred, suffix) {
    if (!n) return number(n) + suffix;
    if (n === 100) return hundred;
    const r = n % 100, t = Math.floor(r / 10), o = r % 10;
    const prefix = n >= 100 ? "ひゃく" : "";
    if (!o) return prefix + (t > 1 ? digit[t] : "") + ten;
    return prefix + (t ? (t > 1 ? digit[t] : "") + "じゅう" : "") + units[o];
  }
  const date = {
    1: "ついたち",
    2: "ふつか",
    3: "みっか",
    4: "よっか",
    5: "いつか",
    6: "むいか",
    7: "なのか",
    8: "ようか",
    9: "ここのか",
    10: "とおか",
    14: "じゅうよっか",
    20: "はつか",
    24: "にじゅうよっか"
  };
  const generic = [ "", "ひとつ", "ふたつ", "みっつ", "よっつ", "いつつ", "むっつ", "ななつ", "やっつ", "ここのつ", "とお" ];
  const types = {
    number: "Number",
    people: "People · 人",
    long: "Long objects · 本",
    objects: "General objects · つ",
    date: "Day of month · 日",
    days: "Days · 日",
    weeks: "Weeks · 週間",
    months: "Months · ヶ月"
  };
  function read(n, type) {
    if (!valid(n)) return null;
    const k = numeral(n), r = number(n);
    switch (type) {
     case "people":
      return {
        word: k + "人",
        kana: n === 1 ? "ひとり" : n === 2 ? "ふたり" : n % 10 === 4 ? number(n - 4).replace(/^れい$/, "") + "よにん" : r + "にん",
        note: n % 10 === 7 ? "しちにん is also used for the seven-person ending." : ""
      };

     case "long":
      return {
        word: k + "本",
        kana: counter(n, [ "", "いっぽん", "にほん", "さんぼん", "よんほん", "ごほん", "ろっぽん", "ななほん", "はっぽん", "きゅうほん" ], "じゅっぽん", "ひゃっぽん", "ほん"),
        note: n % 10 === 0 && n !== 0 && n !== 100 ? "The ten ending also occurs as じっぽん." : ""
      };

     case "objects":
      return n >= 1 && n <= 10 ? {
        word: k + (n === 10 ? "" : "つ"),
        kana: generic[n]
      } : null;

     case "date":
      return n >= 1 && n <= 31 ? {
        word: k + "日",
        kana: date[n] || (n === 17 ? "じゅうしち" : n === 19 ? "じゅうく" : n === 27 ? "にじゅうしち" : n === 29 ? "にじゅうく" : r) + "にち"
      } : null;

     case "days":
      return {
        word: k + "日",
        kana: n === 1 ? "いちにち" : date[n] || (n % 10 === 7 ? number(n - 7).replace(/^れい$/, "") + "しち" : n % 10 === 9 ? number(n - 9).replace(/^れい$/, "") + "く" : r) + "にち",
        note: n === 1 ? "いちにち is a duration; ついたち is the first day of a month." : ""
      };

     case "weeks":
      return {
        word: k + "週間",
        kana: counter(n, [ "", "いっしゅうかん", "にしゅうかん", "さんしゅうかん", "よんしゅうかん", "ごしゅうかん", "ろくしゅうかん", "ななしゅうかん", "はっしゅうかん", "きゅうしゅうかん" ], "じゅっしゅうかん", "ひゃくしゅうかん", "しゅうかん")
      };

     case "months":
      return {
        word: k + "ヶ月",
        kana: counter(n, [ "", "いっかげつ", "にかげつ", "さんかげつ", "よんかげつ", "ごかげつ", "ろっかげつ", "ななかげつ", "はっかげつ", "きゅうかげつ" ], "じゅっかげつ", "ひゃっかげつ", "かげつ")
      };

     default:
      return {
        word: k,
        kana: r
      };
    }
  }
  return {
    valid: valid,
    numeral: numeral,
    number: number,
    types: types,
    read: read
  };
})();