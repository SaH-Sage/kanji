/* Links on the existing sheet. Highlighting never changes card order or geometry. */
const SheetExplorer = (() => {
  const aliases = {'亻':'人','忄':'心','㣺':'心','氵':'水','氺':'水','灬':'火','扌':'手','龵':'手','辶':'辵','⻌':'辵','⻍':'辵'};
  const normalize = c => aliases[c] || c.normalize('NFKC');
  let selection = null, number = 3, context = 'number', root, result, canvas, overview, frame, fitted = false, savedScroll = null;
  const cards = () => [...document.querySelectorAll('#kanji-grid .kc:not(.legendCard)')];
  const records = () => [...appState.kanji, ...appState.customKanji].map(k => ({...k, ...appState.kanjiOverrides[k.char]}));
  function parts(k, seen = new Set()) {
    if (seen.has(k.char)) return new Set();
    seen.add(k.char);
    const result = new Set(), by = new Map(records().map(k => [k.char,k]));
    for (const c of [...(k.components || []), ...(k.componentsExtensive || [])]) {
      const n = normalize(c); result.add(n);
      if (by.has(n)) for (const p of parts(by.get(n), new Set(seen))) result.add(p);
    }
    return result;
  }
  function presentChars(text) {
    const known = new Set(records().map(k => k.char));
    return [...new Set([...text].filter(c => known.has(c)))];
  }
  function jump(char) {
    const card = document.getElementById('kc-'+char);
    if (!card) return;
    card.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});
    history.replaceState(null, '', '#'+encodeURIComponent(char));
  }
  function button(text, fn, title) {
    const b=document.createElement('button'); b.type='button'; b.textContent=text;
    if(title)b.title=title; b.addEventListener('click',fn);return b;
  }
  function apply() {
    if (!root) return;
    const chosen = new Set(selection ? selection.chars : []);
    for(const card of cards()) {
      card.classList.toggle('connectionMatch',chosen.has(card.dataset.kanji));
      card.classList.toggle('connectionMuted',Boolean(selection)&&!chosen.has(card.dataset.kanji));
    }
    root.querySelector('#clearConnections').disabled=!selection;
    result.replaceChildren();
    if(selection) {
      const label=document.createElement('div');label.textContent=selection.label;result.append(label);
      const links=document.createElement('div');links.className='connectionLinks';
      for(const char of chosen)links.append(button(char,()=>jump(char),'Go to '+char));
      if(!chosen.size)links.textContent='No matching cards.';
      result.append(links);
      if(selection.missing?.length) {
        const missing=document.createElement('small');missing.textContent='Not on this sheet: '+selection.missing.join(' ');result.append(missing);
      }
    }
    drawMap();
  }
  function component(char) {
    const n=normalize(char);
    selection={label:char+' · component family',chars:records().filter(k=>normalize(k.char)===n||parts(k).has(n)).map(k=>k.char)};
    // Keyed by the normalized form so clicking a radical variant (e.g. 亻)
    // still auto-switches the counter the same way clicking 人 itself does.
    const ct={'本':'long','人':'people','日':'date','月':'months','週':'weeks'}[n];
    if(ct)setCounter(number,ct);
    apply();
  }
  function word(text,kana='') {
    const found=presentChars(text);
    selection={label:text+(kana?' ('+kana+')':''),chars:found,missing:[...new Set([...text].filter(c=>/\p{Script=Han}/u.test(c)&&!found.includes(c)))]};
    apply();
  }
  function search(query) {
    const q=query.trim();
    if(!q){selection=null;apply();return;}
    const hira=s=>s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
    if(records().some(k=>k.char===q)){component(q);return;}
    const matches=records().filter(k=>[k.char,k.meaning,...k.on,...k.kun,...k.kunAdd,...k.onAdd,...k.name].some(v=>hira(v).toLowerCase().includes(hira(q).toLowerCase())) || getMergedWordEntries(k.char).some(e=>[e.word,e.kana,...e.meaning].some(v=>hira(v).toLowerCase().includes(hira(q).toLowerCase()))));
    selection={label:'Search: '+q,chars:matches.map(k=>k.char)};apply();
  }
  function start(smooth=true) {
    const requested=decodeURIComponent(location.hash.slice(1));
    if(!smooth && document.getElementById('kc-'+requested)){jump(requested);return;}
    const legend=document.getElementById('kc-legend');
    if(legend)legend.scrollIntoView({behavior:smooth?'smooth':'instant',block:'start',inline:'end'});
  }
  function setCounter(n,type=context) {
    if(!CounterReadings.valid(n))return;
    number=n;context=type;
    const box=document.getElementById('kc-counters');if(!box)return;
    const options=Object.entries(CounterReadings.types).map(([id,label])=>`<option value="${id}"${context===id?' selected':''}>${label}</option>`).join('');
    box.innerHTML=`<div class="counterHeader"><strong>Counters</strong><label>Number <input id="counterNumber" type="number" min="0" max="120" step="1" value="${number}"></label><label>Focus <select id="counterContext">${options}</select></label><button type="button" id="counterToRuler">On ruler ↗</button></div><div class="counterResults"></div>`;
    const rows=box.querySelector('.counterResults');
    for(const [id,label] of Object.entries(CounterReadings.types)) {
      const e=CounterReadings.read(number,id);const cell=document.createElement('div');cell.className='counterResult'+(id===context?' counterActive':'');
      const caption=document.createElement('small');caption.textContent=label;cell.append(caption);
      if(e){
        const b=button('',()=>word(e.word,e.kana));b.className='counterWord';
        const ruby=document.createElement('ruby');ruby.textContent=e.word;const rt=document.createElement('rt');rt.textContent=e.kana;ruby.append(rt);b.append(ruby);cell.append(b);
        if(e.note){const note=document.createElement('small');note.textContent=e.note;cell.append(note);}
      }else{const note=document.createElement('span');note.textContent=id==='date'?'Dates: 1–31':'General つ: 1–10';cell.append(note);}
      rows.append(cell);
    }
    box.querySelector('#counterNumber').addEventListener('change',e=>{setCounter(Number(e.target.value));const selected=CounterReadings.read(number,context);word(selected?selected.word:CounterReadings.numeral(number),selected?.kana||'');});
    box.querySelector('#counterContext').addEventListener('change',e=>{setCounter(number,e.target.value);const selected=CounterReadings.read(number,context);word(selected?selected.word:CounterReadings.numeral(number),selected?.kana||'');});
    box.querySelector('#counterToRuler').addEventListener('click',()=>document.querySelector(`[data-ruler-number="${number}"]`)?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'}));
    for(const el of document.querySelectorAll('[data-ruler-number]')) {
      const v=Number(el.dataset.rulerNumber),reading=CounterReadings.read(v,context);
      el.classList.toggle('rulerSelected',v===number);
      el.setAttribute('aria-pressed',String(v===number));
      el.title=CounterReadings.types[context]+': '+(reading?reading.word+' ('+reading.kana+')':'outside this counter range');
      el.setAttribute('aria-label',el.title);
    }
    const summary=root?.querySelector('#counterSummary');
    if(summary){const reading=CounterReadings.read(number,context);summary.textContent=reading?reading.word+' ('+reading.kana+')':'Outside this counter range';}
  }
  // Toggles the whole sheet — #kanji-grid AND #rulerFooter below it —
  // between real size and scaled down to fit entirely in the viewport at
  // once, a "fit to window" next to the minimap. CSS zoom (not
  // transform: scale) because zoom reflows layout at the new size, so
  // the document's own scrollWidth/scrollHeight shrink with it instead
  // of leaving a transform's full-size footprint still scrollable
  // underneath. zoom is applied to both elements independently (there's
  // no shared wrapper to zoom once) with the same factor, so they stay
  // stacked exactly as before, just smaller.
  function fitToggle() {
    const grid = document.getElementById('kanji-grid'), ruler = document.getElementById('rulerFooter'), btn = root?.querySelector('#zoomFit');
    if (fitted) {
      grid.style.zoom = '';
      ruler.style.zoom = '';
      if (savedScroll) window.scrollTo(savedScroll.x, savedScroll.y);
      fitted = false;
    } else {
      savedScroll = {x: scrollX, y: scrollY};
      grid.style.zoom = ''; ruler.style.zoom = ''; // reset first so the measurements below are the real, unscaled size
      const navHeight = document.getElementById('navMenu')?.getBoundingClientRect().height || 0;
      // grid: offsetWidth, not scrollWidth — its overflow-x: clip hides
      // overflow that scrollWidth still counts, which left phantom
      // empty space on the right once fitted. The ruler isn't clipped,
      // so its scrollWidth is its real visible width.
      const width = Math.max(grid.offsetWidth, ruler.scrollWidth);
      const height = grid.scrollHeight + ruler.scrollHeight;
      const scale = Math.min(innerWidth / width, (innerHeight - navHeight) / height, 1);
      grid.style.zoom = scale;
      ruler.style.zoom = scale;
      window.scrollTo(0, grid.offsetTop);
      fitted = true;
    }
    if (btn) { btn.classList.toggle('fitActive', fitted); btn.setAttribute('aria-pressed', String(fitted)); }
  }
  function drawMap() {
    if(!canvas || !overview.open)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const grid=document.getElementById('kanji-grid');
    const width=grid.scrollWidth,height=grid.scrollHeight;
    canvas.width=560;canvas.height=Math.max(100,Math.round(height/width*560));
    const sx=canvas.width/width,sy=canvas.height/height;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const rect=grid.getBoundingClientRect();
    // Theme colors, read live so the map follows whichever theme is active.
    const css=getComputedStyle(document.documentElement),color=name=>css.getPropertyValue(name).trim();
    const matchColor=color('--color-num'),cardColor=color('--color-muted');
    for(const el of cards()) {
      const r=el.getBoundingClientRect();ctx.fillStyle=el.classList.contains('connectionMatch')?matchColor:cardColor;
      ctx.fillRect((r.left-rect.left)*sx,(r.top-rect.top)*sy,Math.max(2,r.width*sx-1),Math.max(2,r.height*sy-1));
    }
    ctx.strokeStyle=color('--color-text');ctx.lineWidth=2;
    ctx.strokeRect(-rect.left*sx,-rect.top*sy,innerWidth*sx,innerHeight*sy);
  }
  function refresh() {apply();}
  function init() {
    root=document.createElement('aside');root.id='sheetNavigator';root.setAttribute('aria-label','Sheet navigation');
    root.innerHTML=`<div class="sheetNavigationActions"><button id="sheetStart" type="button">Start ↗</button><button id="showCounters" type="button">Counters</button><button id="clearConnections" type="button" disabled>Clear</button><button id="zoomFit" type="button" aria-pressed="false" title="Zoom out to fit the whole sheet in view, or back to actual size">Fit ⤢</button></div><details id="sheetOverview"><summary>Explore / overview</summary><form id="sheetSearch"><input aria-label="Find kanji, reading, or word" placeholder="Kanji, reading, word…"><button type="submit">Find</button></form><canvas id="sheetMap" aria-label="Overview of the kanji sheet"></canvas><small>Click the map to move; use Find for keyboard navigation.</small></details><div id="connectionResults" aria-live="polite"></div><button type="button" id="counterSummary" title="Open counters"></button>`;
    document.body.append(root);result=root.querySelector('#connectionResults');canvas=root.querySelector('#sheetMap');overview=root.querySelector('#sheetOverview');
    root.querySelector('#sheetStart').addEventListener('click',()=>start());
    root.querySelector('#zoomFit').addEventListener('click',fitToggle);
    const openCounters=()=>document.getElementById('kc-counters').scrollIntoView({behavior:'smooth',block:'center',inline:'center'});
    root.querySelector('#showCounters').addEventListener('click',openCounters);root.querySelector('#counterSummary').addEventListener('click',openCounters);
    root.querySelector('#clearConnections').addEventListener('click',()=>{selection=null;apply();});
    root.querySelector('#sheetSearch').addEventListener('submit',e=>{e.preventDefault();search(e.target.querySelector('input').value);});
    overview.addEventListener('toggle',drawMap);
    canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),g=document.getElementById('kanji-grid');window.scrollTo({left:(e.clientX-r.left)/r.width*g.scrollWidth-innerWidth/2,top:g.offsetTop+(e.clientY-r.top)/r.height*g.scrollHeight-innerHeight/2,behavior:'smooth'});});
    window.addEventListener('scroll',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(drawMap);},{passive:true});
    window.addEventListener('resize',()=>{drawMap();});
    new MutationObserver(drawMap).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    // Capture read-only exploration before the original click-to-edit handlers.
    document.addEventListener('click',e=>{
      const ruler=e.target.closest('[data-ruler-number]');
      if(ruler){setCounter(Number(ruler.dataset.rulerNumber));const reading=CounterReadings.read(number,context);word(reading?reading.word:CounterReadings.numeral(number),reading?.kana||'');return;}
      if(appState.settings.editMode)return;
      const c=e.target.closest('[data-component]');const w=e.target.closest('[data-explore-word]');const k=e.target.closest('[data-explore-char]');
      if(c||w||k){e.preventDefault();e.stopImmediatePropagation();if(c)component(c.dataset.component);else if(w)word(w.dataset.exploreWord,w.dataset.exploreKana);else component(k.dataset.exploreChar);}
      const meaning=e.target.closest('.wordMeaning[data-idx]');
      if(meaning){const card=meaning.closest('.kc'),chip=card.querySelector(`.wordKanji[data-idx="${meaning.dataset.idx}"]`);if(chip){e.stopImmediatePropagation();word(chip.dataset.exploreWord,chip.dataset.exploreKana);}}
    },true);
    document.addEventListener('keydown',e=>{
      if((e.key==='Enter'||e.key===' ')&&e.target.matches('svg[data-explore-char],span[data-explore-word]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
      if(e.key==='Escape'&&!e.target.closest('input,textarea,select')){selection=null;apply();}
    });
    setCounter(number);apply();
  }
  return {init,refresh,start,word,component,search,setCounter};
})();
