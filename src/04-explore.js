<script>
/* ================================================================
   Explore — search, facets, a numeric query row, and a windowed
   results table over all 23,972 organisations.
   ================================================================ */
'use strict';

const MEASURES = [
  {k:'inc',   label:'Total income',          core:'linc', fmt:eur},
  {k:'exp',   label:'Total expenditure',     core:'lexp', fmt:eur, abs:true},
  {k:'gov',   label:'Government funding',    core:'lgov', fmt:eur},
  {k:'ftot',  label:'Funding (all sources)', core:null,   fmt:eur},
  {k:'na',    label:'Net assets',            core:'lna',  fmt:eur},
  {k:'fr',    label:'Funds & reserves',      core:'lfr',  fmt:eur},
  {k:'pay',   label:'Payroll',               core:'lpay', fmt:eur},
  {k:'emp',   label:'Employees',             core:'lemp', fmt:int},
  {k:'vol',   label:'Volunteers',            core:null,   fmt:int},
  {k:'kmp',   label:'Key management pay',    core:null,   fmt:eur},
  {k:'don',   label:'Donations & legacies',  core:null,   fmt:eur},
  {k:'grants',label:'Grants',                core:null,   fmt:eur},
  {k:'cash',  label:'Cash at bank',          core:null,   fmt:eur},
];
const MBY = Object.fromEntries(MEASURES.map(m=>[m.k,m]));

const Q = {
  text:'', sectors:new Set(), counties:new Set(), gforms:new Set(),
  status:new Set(), flags:new Set(),
  measure:'inc', op:'', val:'', year:'latest',
  sort:'linc', dir:-1,
  showAll:{sectors:false, counties:false, gforms:false}
};
let RESULT = [];
let LOWNAME = null, LOWALT = null;

/** Measure value for an organisation, honouring the year selector. */
function measureVal(k, mk, year){
  const m = MBY[mk];
  if(year==='latest' && m.core) { const v = C()[m.core][k]; return m.abs&&v!=null?Math.abs(v):v; }
  if(!DB.finReady) return null;
  if(year==='any'){
    const rows = DB.finByOrg.get(k); if(!rows) return null;
    let best=null;
    for(const r of rows){ const v=DB.fin.cols[mk][r]; if(v!=null){ const a=m.abs?Math.abs(v):v; if(best==null||a>best) best=a; } }
    return best;
  }
  const v = finVal(k, mk, year);
  return m.abs&&v!=null?Math.abs(v):v;
}

function ensureLower(){
  if(LOWNAME) return;
  const n = DB.core.n, nm = C().name;
  LOWNAME = new Array(n);
  for(let i=0;i<n;i++) LOWNAME[i]=nm[i].toLowerCase();
}
function ensureAltLower(){
  if(LOWALT || !DB.extReady) return;
  LOWALT = new Map();
  const alt = E().alt||{};
  for(const key in alt) LOWALT.set(+key, String(alt[key]).toLowerCase());
}

/* ---------------- the filter pipeline ---------------- */
function passFacets(k, skip){
  const c = C();
  if(skip!=='sectors' && Q.sectors.size && !Q.sectors.has(c.sec[k])) return false;
  if(skip!=='counties' && Q.counties.size && !Q.counties.has(c.cty[k])) return false;
  if(skip!=='gforms'  && Q.gforms.size  && !Q.gforms.has(c.gf[k]))   return false;
  if(skip!=='status' && Q.status.size){
    const cur=isCurrent(k), dis=isDissolved(k), nd=noDirectory(k);
    let ok=false;
    if(Q.status.has('current')&&cur) ok=true;
    if(Q.status.has('dissolved')&&dis) ok=true;
    if(Q.status.has('nodir')&&nd) ok=true;
    if(!ok) return false;
  }
  if(skip!=='flags' && Q.flags.size){
    for(const f of Q.flags){
      if(f==='acc'     && !inReg(k,R_ACC)) return false;
      if(f==='noacc'   &&  inReg(k,R_ACC)) return false;
      if(f==='fund'    && !inReg(k,R_FUND)) return false;
      if(f==='charity' && !(DB.extReady ? extVal('rcn',k) : true)) return false;
      if(f==='company' && !(DB.extReady ? extVal('cro',k) : true)) return false;
      if(f==='school'  && !(DB.extReady ? extVal('roll',k) : true)) return false;
      if(f==='sport'   && !(DB.extReady ? extVal('sport',k) : true)) return false;
      if(f==='tax'     && !(DB.extReady ? extVal('tax',k) : true)) return false;
    }
  }
  return true;
}
function passNumeric(k){
  if(Q.op==='' || Q.val==='' || Q.val===null) return true;
  const v = measureVal(k, Q.measure, Q.year);
  const t = parseFloat(String(Q.val).replace(/[,\s€]/g,''));
  if(isNaN(t)) return true;
  if(v===null) return false;
  switch(Q.op){
    case 'gte': return v>=t;
    case 'lte': return v<=t;
    case 'gt':  return v>t;
    case 'lt':  return v<t;
  }
  return true;
}
function textScore(k, needles){
  const nm = LOWNAME[k];
  let score = 0;
  for(const nd of needles){
    let p = nm.indexOf(nd);
    if(p===0) score += 100;
    else if(p>0 && (nm[p-1]===' '||nm[p-1]==='('||nm[p-1]==='-')) score += 55;
    else if(p>0) score += 22;
    else {
      // alternative names, then registration numbers
      let hit = false;
      if(LOWALT){ const a = LOWALT.get(k); if(a && a.indexOf(nd)>=0){ score += 30; hit=true; } }
      if(!hit && DB.extReady && /^\d{2,}$/.test(nd)){
        for(const key of ['cro','rcn','chy','roll']){
          const v = extVal(key,k);
          if(v && String(v).replace(/\D/g,'').indexOf(nd)===0){ score += 85; hit=true; break; }
        }
      }
      if(!hit) return -1;
    }
  }
  return score;
}
function runQuery(){
  ensureLower(); ensureAltLower();
  const needles = Q.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const n = DB.core.n, out = [];
  if(needles.length){
    const scored = [];
    for(let k=0;k<n;k++){
      if(!passFacets(k)||!passNumeric(k)) continue;
      const s = textScore(k, needles);
      if(s>=0) scored.push([k,s]);
    }
    // relevance first, then the chosen sort as tiebreak
    scored.sort((a,b)=> b[1]-a[1] || cmpSort(a[0],b[0]));
    for(const [k] of scored) out.push(k);
  }else{
    for(let k=0;k<n;k++) if(passFacets(k)&&passNumeric(k)) out.push(k);
    out.sort(cmpSort);
  }
  RESULT = out;
}
function sortValue(k){
  const s = Q.sort, c = C();
  if(s==='name') return rawName(k);
  if(s==='sector'){ const x=sectorOf(k); return x?x.name:'~'; }
  if(s==='county') return countyOf(k)||'~';
  if(s==='year') return c.ly[k];
  if(s==='nyr') return c.nyr[k];
  if(s.charAt(0)==='l') { const v=c[s][k]; return v==null?null:(s==='lexp'?Math.abs(v):v); }
  return measureVal(k, s, Q.year);
}
function cmpSort(a,b){
  const va = sortValue(a), vb = sortValue(b);
  const na = va===null||va===undefined, nb = vb===null||vb===undefined;
  if(na&&nb) return rawName(a)<rawName(b)?-1:1;
  if(na) return 1;                         // blanks always last
  if(nb) return -1;
  if(typeof va==='string') return Q.dir*(va<vb?-1:va>vb?1:0);
  return Q.dir*(va-vb)||(rawName(a)<rawName(b)?-1:1);
}

/* ---------------- facet counts ---------------- */
function facetCounts(kind){
  const counts = new Map();
  const needles = Q.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const col = kind==='sectors'?'sec':kind==='counties'?'cty':'gf';
  for(let k=0;k<DB.core.n;k++){
    if(!passFacets(k,kind)||!passNumeric(k)) continue;
    if(needles.length && textScore(k,needles)<0) continue;
    const v = C()[col][k];
    if(v<0) continue;
    counts.set(v,(counts.get(v)||0)+1);
  }
  return counts;
}
function statusCounts(){
  const o = {current:0,dissolved:0,nodir:0,acc:0,noacc:0,fund:0};
  const needles = Q.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for(let k=0;k<DB.core.n;k++){
    if(!passFacets(k,'status')||!passNumeric(k)) continue;
    if(needles.length && textScore(k,needles)<0) continue;
    if(isCurrent(k)) o.current++; else if(isDissolved(k)) o.dissolved++; else o.nodir++;
  }
  for(let k=0;k<DB.core.n;k++){
    if(!passFacets(k,'flags')||!passNumeric(k)) continue;
    if(needles.length && textScore(k,needles)<0) continue;
    if(inReg(k,R_ACC)) o.acc++; else o.noacc++;
    if(inReg(k,R_FUND)) o.fund++;
  }
  return o;
}

/* ---------------- rendering ---------------- */
const ALLCOLS = [
  {k:'name',  label:'Organisation',  w:'minmax(150px,2.4fr)', keep:3},
  {k:'sector',label:'Sector',        w:'minmax(120px,1fr)',   keep:1},
  {k:'county',label:'County',        w:'96px',                keep:0},
  {k:'year',  label:'FY',            w:'56px',  r:true,       keep:1},
  {k:'linc',  label:'Income',        w:'104px', r:true,       keep:3},
  {k:'lexp',  label:'Expenditure',   w:'104px', r:true,       keep:1},
  {k:'lemp',  label:'Staff',         w:'66px',  r:true,       keep:2},
  {k:'lgov',  label:'State funding', w:'104px', r:true,       keep:0},
];
/* Narrow screens drop the lowest-priority columns rather than overflowing. */
function activeCols(){
  const w = window.innerWidth;
  const min = w < 560 ? 3 : w < 860 ? 2 : w < 1160 ? 1 : 0;
  return ALLCOLS.filter(c=>c.keep >= min);
}
let COLS = activeCols();

function viewExplore(){
  COLS = activeCols();
  const m = document.getElementById('main');
  m.innerHTML = `
  <div class="explore">
    <aside class="rail" id="rail"></aside>
    <section>
      <div class="searchwrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input id="q" type="search" autocomplete="off" spellcheck="false"
          placeholder="Search 23,972 organisations by name, or by CRO / charity number…" value="${esc(Q.text)}">
      </div>
      <div class="toolbar">
        <span class="resn" id="resn"></span>
        <span class="pills" id="pills"></span>
        <span style="margin-left:auto;display:flex;gap:7px">
          <button class="tbtn" id="csvbtn">Copy as CSV</button>
          <button class="tbtn" id="clrbtn">Reset</button>
        </span>
      </div>
      <div class="tblwrap">
        <div class="thead" id="thead"></div>
        <div id="scroller"><div id="spacer"></div></div>
      </div>
      <p class="mut" style="font-size:11.5px;margin:9px 0 0">
        Figures are the organisation's most recently filed accounts unless a year is chosen in the filter.
        Expenditure is published as a negative figure in the source and is shown here as a positive amount.
        Click any row for the full accounts.
      </p>
    </section>
  </div>`;

  const q = document.getElementById('q');
  let t=null;
  q.addEventListener('input',()=>{
    clearTimeout(t);
    t=setTimeout(()=>{ Q.text=q.value; refreshExplore(); },170);
  });
  document.getElementById('csvbtn').addEventListener('click',copyCSV);
  document.getElementById('clrbtn').addEventListener('click',()=>{
    Q.text=''; Q.sectors.clear(); Q.counties.clear(); Q.gforms.clear();
    Q.status.clear(); Q.flags.clear(); Q.op=''; Q.val=''; Q.year='latest';
    Q.sort='linc'; Q.dir=-1; viewExplore();
  });
  renderHead();
  document.getElementById('scroller').addEventListener('scroll',paintRows);
  addResize(()=>{
    const next = activeCols();
    if(next.length !== COLS.length){ COLS = next; renderHead(); }
    paintRows();
  });
  refreshExplore();
}

function renderHead(){
  const h = document.getElementById('thead');
  h.style.gridTemplateColumns = COLS.map(c=>c.w).join(' ');
  h.style.display='grid';
  h.innerHTML = COLS.map(c=>{
    const on = Q.sort===c.k;
    const ar = on ? (Q.dir===-1?'↓':'↑') : '';
    return `<div class="${c.r?'r':''}${on?' srt':''}" data-k="${c.k}" title="Sort by ${esc(c.label)}">${esc(c.label)}<span>${ar}</span></div>`;
  }).join('');
  h.querySelectorAll('div[data-k]').forEach(d=>{
    d.addEventListener('click',()=>{
      const k = d.dataset.k;
      if(Q.sort===k) Q.dir = -Q.dir;
      else { Q.sort=k; Q.dir = (k==='name'||k==='sector'||k==='county') ? 1 : -1; }
      renderHead(); refreshExplore();
    });
  });
}

function refreshExplore(){
  if(!document.getElementById('scroller')) return;
  runQuery();
  const n = RESULT.length;
  document.getElementById('resn').innerHTML =
    `<b>${NF.format(n)}</b> organisation${n===1?'':'s'}`+
    (n<DB.core.n ? ` <span class="mut">of ${NF.format(DB.core.n)}</span>` : '');
  renderRail(); renderPills();
  const sp = document.getElementById('spacer');
  sp.style.height = (n*34)+'px';
  document.getElementById('scroller').scrollTop = 0;
  paintRows();
}

function paintRows(){
  const sc = document.getElementById('scroller'); if(!sc) return;
  const sp = document.getElementById('spacer');
  const H = 34, top = sc.scrollTop, vh = sc.clientHeight;
  const first = Math.max(0, Math.floor(top/H)-6);
  const last  = Math.min(RESULT.length, Math.ceil((top+vh)/H)+6);
  if(!RESULT.length){
    sp.innerHTML = `<div class="empty">No organisation matches these filters.<br>
      <button class="tbtn" style="margin-top:12px" onclick="document.getElementById('clrbtn').click()">Reset filters</button></div>`;
    return;
  }
  const tpl = COLS.map(c=>c.w).join(' ');
  let html='';
  for(let i=first;i<last;i++){
    const k = RESULT[i];
    const c = C();
    const sec = sectorOf(k), sub = subsectorOf(k);
    const inc = Q.year==='latest' ? c.linc[k] : measureVal(k,'inc',Q.year);
    const exp = Q.year==='latest' ? c.lexp[k] : measureVal(k,'exp',Q.year);
    const emp = Q.year==='latest' ? c.lemp[k] : measureVal(k,'emp',Q.year);
    const gov = Q.year==='latest' ? c.lgov[k] : measureVal(k,'gov',Q.year);
    const dash = '<span class="mut">—</span>';
    const cell = {
      name:  `<div class="nm" title="${esc(rawName(k))}">${esc(orgName(k))}${
               isDissolved(k)?'<span class="bdg no" style="margin-left:6px">Not in 2024</span>':''}</div>`,
      sector:`<div class="sub" title="${esc(sub?sub.name:'')}">${esc(sub?sub.name:(sec?sec.name:'—'))}</div>`,
      county:`<div class="sub">${esc(titleise(countyOf(k)||'—'))}</div>`,
      year:  `<div class="r sub">${c.ly[k]||'—'}</div>`,
      linc:  `<div class="r">${inc==null?dash:esc(eurShort(inc))}</div>`,
      lexp:  `<div class="r">${exp==null?dash:esc(eurShort(Math.abs(exp)))}</div>`,
      lemp:  `<div class="r">${emp==null?dash:esc(int(emp))}</div>`,
      lgov:  `<div class="r">${gov==null?dash:esc(eurShort(gov))}</div>`,
    };
    html += `<div class="row" style="top:${i*H}px;display:grid;grid-template-columns:${tpl}" data-id="${esc(c.id[k])}">`
          + COLS.map(col=>cell[col.k]).join('') + `</div>`;
  }
  sp.innerHTML = html;
  sp.querySelectorAll('.row').forEach(r=>{
    r.addEventListener('click',()=>{ location.hash = 'org-'+r.dataset.id; });
  });
}

/* ---------------- facet rail ---------------- */
function renderRail(){
  const rail = document.getElementById('rail'); if(!rail) return;
  const sc = facetCounts('sectors'), cc = facetCounts('counties'), gc = facetCounts('gforms');
  const st = statusCounts();
  const yearOpts = ['latest','any'].concat(DB.years.map(String));

  function group(kind, items, sel, counts, labelFn){
    const all = items.map((it,i)=>({i,label:labelFn(it),n:counts.get(i)||0}))
      .filter(x=>x.n>0 || sel.has(x.i))
      .sort((a,b)=> b.n-a.n || (a.label<b.label?-1:1));
    const show = Q.showAll[kind] ? all : all.slice(0,8);
    return show.map(x=>
      `<label class="chk${sel.has(x.i)?' on':''}">
        <input type="checkbox" data-kind="${kind}" data-i="${x.i}" ${sel.has(x.i)?'checked':''}>
        <span>${esc(x.label)}</span><span class="cnt">${NF.format(x.n)}</span>
      </label>`).join('') +
      (all.length>8 ? `<button class="more" data-toggle="${kind}">${Q.showAll[kind]?'Show fewer':'Show all '+all.length+'…'}</button>` : '');
  }

  rail.innerHTML = `
  <div class="qbuild">
    <div class="lab" style="margin-bottom:7px">Numeric filter</div>
    <div class="qrow">
      <select id="qm">${MEASURES.map(x=>`<option value="${x.k}"${Q.measure===x.k?' selected':''}>${esc(x.label)}</option>`).join('')}</select>
    </div>
    <div class="qrow">
      <select id="qo" style="flex:0 0 76px">
        <option value=""${Q.op===''?' selected':''}>any</option>
        <option value="gte"${Q.op==='gte'?' selected':''}>≥</option>
        <option value="lte"${Q.op==='lte'?' selected':''}>≤</option>
        <option value="gt"${Q.op==='gt'?' selected':''}>&gt;</option>
        <option value="lt"${Q.op==='lt'?' selected':''}>&lt;</option>
      </select>
      <input id="qv" placeholder="amount" value="${esc(Q.val)}" inputmode="numeric">
    </div>
    <div class="qrow">
      <select id="qy">${yearOpts.map(y=>`<option value="${y}"${Q.year===y?' selected':''}>${y==='latest'?'Latest filed year':y==='any'?'Best of any year':'FY '+y}</option>`).join('')}</select>
    </div>
    ${!DB.finReady?'<div class="mut" style="font-size:11px;margin-top:6px"><span class="spin"></span> loading year-by-year figures…</div>':''}
  </div>

  <div class="fgroup">
    <span class="lab">Register status</span>
    <label class="chk${Q.status.has('current')?' on':''}"><input type="checkbox" data-kind="status" data-v="current" ${Q.status.has('current')?'checked':''}><span>In 2024 register</span><span class="cnt">${NF.format(st.current)}</span></label>
    <label class="chk${Q.status.has('dissolved')?' on':''}"><input type="checkbox" data-kind="status" data-v="dissolved" ${Q.status.has('dissolved')?'checked':''}><span>Not in 2024 register</span><span class="cnt">${NF.format(st.dissolved)}</span></label>
    <label class="chk${Q.status.has('nodir')?' on':''}"><input type="checkbox" data-kind="status" data-v="nodir" ${Q.status.has('nodir')?'checked':''}><span>Accounts only</span><span class="cnt">${NF.format(st.nodir)}</span></label>
  </div>

  <div class="fgroup">
    <span class="lab">Data held</span>
    <label class="chk${Q.flags.has('acc')?' on':''}"><input type="checkbox" data-kind="flags" data-v="acc" ${Q.flags.has('acc')?'checked':''}><span>Has accounts</span><span class="cnt">${NF.format(st.acc)}</span></label>
    <label class="chk${Q.flags.has('noacc')?' on':''}"><input type="checkbox" data-kind="flags" data-v="noacc" ${Q.flags.has('noacc')?'checked':''}><span>No accounts</span><span class="cnt">${NF.format(st.noacc)}</span></label>
    <label class="chk${Q.flags.has('fund')?' on':''}"><input type="checkbox" data-kind="flags" data-v="fund" ${Q.flags.has('fund')?'checked':''}><span>State-funded 2020</span><span class="cnt">${NF.format(st.fund)}</span></label>
    <label class="chk${Q.flags.has('charity')?' on':''}"><input type="checkbox" data-kind="flags" data-v="charity" ${Q.flags.has('charity')?'checked':''}><span>Registered charity</span></label>
    <label class="chk${Q.flags.has('school')?' on':''}"><input type="checkbox" data-kind="flags" data-v="school" ${Q.flags.has('school')?'checked':''}><span>School</span></label>
    <label class="chk${Q.flags.has('sport')?' on':''}"><input type="checkbox" data-kind="flags" data-v="sport" ${Q.flags.has('sport')?'checked':''}><span>Sports body</span></label>
  </div>

  <div class="fgroup"><span class="lab">Sector</span>${group('sectors',DB.meta.sectors,Q.sectors,sc,s=>s.name)}</div>
  <div class="fgroup"><span class="lab">County</span>${group('counties',DB.meta.counties,Q.counties,cc,c=>titleise(c))}</div>
  <div class="fgroup"><span class="lab">Legal form</span>${group('gforms',DB.meta.govForms,Q.gforms,gc,g=>g)}</div>`;

  rail.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change',()=>{
      const kind = cb.dataset.kind;
      const set = kind==='sectors'?Q.sectors:kind==='counties'?Q.counties:kind==='gforms'?Q.gforms:
                  kind==='status'?Q.status:Q.flags;
      const v = cb.dataset.i!==undefined ? +cb.dataset.i : cb.dataset.v;
      if(cb.checked) set.add(v); else set.delete(v);
      refreshExplore();
    });
  });
  rail.querySelectorAll('button[data-toggle]').forEach(b=>{
    b.addEventListener('click',()=>{ const k=b.dataset.toggle; Q.showAll[k]=!Q.showAll[k]; renderRail(); });
  });
  const qm=rail.querySelector('#qm'), qo=rail.querySelector('#qo'),
        qv=rail.querySelector('#qv'), qy=rail.querySelector('#qy');
  qm.addEventListener('change',()=>{ Q.measure=qm.value; if(Q.op) refreshExplore(); });
  qo.addEventListener('change',()=>{ Q.op=qo.value; refreshExplore(); });
  qy.addEventListener('change',()=>{ Q.year=qy.value; refreshExplore(); });
  let vt=null;
  qv.addEventListener('input',()=>{ clearTimeout(vt); vt=setTimeout(()=>{ Q.val=qv.value; refreshExplore(); },280); });
}

function renderPills(){
  const p = document.getElementById('pills'); if(!p) return;
  const out=[];
  const push=(label,fn)=>out.push({label,fn});
  Q.sectors.forEach(i=>push(DB.meta.sectors[i].name,()=>Q.sectors.delete(i)));
  Q.counties.forEach(i=>push(titleise(DB.meta.counties[i]),()=>Q.counties.delete(i)));
  Q.gforms.forEach(i=>push(DB.meta.govForms[i],()=>Q.gforms.delete(i)));
  Q.status.forEach(v=>push({current:'In 2024 register',dissolved:'Not in 2024 register',nodir:'Accounts only'}[v],()=>Q.status.delete(v)));
  Q.flags.forEach(v=>push({acc:'Has accounts',noacc:'No accounts',fund:'State-funded 2020',charity:'Registered charity',company:'Company',school:'School',sport:'Sports body',tax:'Tax relief'}[v],()=>Q.flags.delete(v)));
  if(Q.op && Q.val!==''){
    const sym={gte:'≥',lte:'≤',gt:'>',lt:'<'}[Q.op];
    const yl = Q.year==='latest'?'latest year':Q.year==='any'?'any year':'FY '+Q.year;
    push(`${MBY[Q.measure].label} ${sym} ${NF.format(parseFloat(String(Q.val).replace(/[,\s€]/g,''))||0)} (${yl})`,
      ()=>{ Q.op=''; Q.val=''; });
  }
  p.innerHTML = out.map((o,i)=>`<span class="pill">${esc(o.label)}<button data-i="${i}" aria-label="Remove filter">×</button></span>`).join('');
  p.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click',()=>{ out[+b.dataset.i].fn(); refreshExplore(); });
  });
}

/* ---------------- CSV (the frame refuses downloads, so copy) ---------------- */
function copyCSV(){
  const head = ['Benefacts ID','Name','Sector','Subsector','County','Legal form',
    'CRO','Charity no','In 2024 register','Financial year','Income','Expenditure',
    'Net assets','Employees','Payroll','Government funding'];
  const q = s => { s = s===null||s===undefined?'':String(s);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const lines = [head.join(',')];
  const cap = Math.min(RESULT.length, 20000);
  for(let i=0;i<cap;i++){
    const k = RESULT[i], c = C(), sec=sectorOf(k), sub=subsectorOf(k);
    lines.push([c.id[k], rawName(k), sec?sec.name:'', sub?sub.name:'', countyOf(k)||'',
      gformOf(k)||'', extVal('cro',k), extVal('rcn',k), isCurrent(k)?'Y':'N',
      c.ly[k]||'', c.linc[k]??'', c.lexp[k]==null?'':Math.abs(c.lexp[k]),
      c.lna[k]??'', c.lemp[k]??'', c.lpay[k]??'', c.lgov[k]??''].map(q).join(','));
  }
  const text = lines.join('\n');
  const btn = document.getElementById('csvbtn');
  navigator.clipboard.writeText(text).then(()=>{
    btn.textContent = `Copied ${NF.format(cap)} rows`;
    setTimeout(()=>btn.textContent='Copy as CSV',2200);
  }).catch(()=>{ btn.textContent='Copy failed'; setTimeout(()=>btn.textContent='Copy as CSV',2200); });
}
</script>
