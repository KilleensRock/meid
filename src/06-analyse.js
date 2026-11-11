<script>
/* ================================================================
   Analyse — sector, county and year aggregates over the whole set.
   One filter row scopes every chart on the page.
   ================================================================ */
'use strict';

const A = { year:'latest', measure:'inc', sectors:new Set() };

function aggregate(measure, year, groupBy){
  // groupBy: 'sec' | 'cty' | 'gf'
  const col = C()[groupBy];
  const sums = new Map(), counts = new Map();
  for(let k=0;k<DB.core.n;k++){
    if(A.sectors.size && !A.sectors.has(C().sec[k])) continue;
    const g = col[k]; if(g<0) continue;
    const v = measureVal(k, measure, year);
    if(v==null) continue;
    sums.set(g,(sums.get(g)||0)+Math.abs(v));
    counts.set(g,(counts.get(g)||0)+1);
  }
  return {sums,counts};
}
function yearTotals(measure, sectorIdx){
  return DB.years.map(y=>{
    let s=0, n=0;
    for(let k=0;k<DB.core.n;k++){
      if(sectorIdx!=null && C().sec[k]!==sectorIdx) continue;
      if(sectorIdx==null && A.sectors.size && !A.sectors.has(C().sec[k])) continue;
      const v = finVal(k, measure, y);
      if(v!=null){ s+=Math.abs(v); n++; }
    }
    return {total:s, n};
  });
}

function viewAnalyse(){
  const m = document.getElementById('main');
  if(!DB.finReady){
    m.innerHTML = `<div class="sect"><h2>Analyse</h2>
      <p class="sub"><span class="spin"></span> Loading the year-by-year figures…</p></div>`;
    return;
  }
  clearResize();
  const fmtFor = mk => MBY[mk].fmt===int ? int : eurShort;
  const measOpts = ['inc','exp','gov','pay','emp','na','fr','don','grants']
    .map(k=>`<option value="${k}"${A.measure===k?' selected':''}>${esc(MBY[k].label)}</option>`).join('');
  const yearOpts = ['latest','any'].concat(DB.years.map(String))
    .map(y=>`<option value="${y}"${A.year===y?' selected':''}>${y==='latest'?'Latest filed year':y==='any'?'Highest in any year':'FY '+y}</option>`).join('');

  m.innerHTML = `
  <div class="sect">
    <h2>Analyse the sector</h2>
    <p class="sub">Totals are sums of what each organisation actually filed. Because accounts coverage
      is uneven — and thins sharply after 2019 — these are totals <i>of the dataset</i>, not of the
      Irish nonprofit sector. The Coverage view sets out what is missing.</p>
    <div class="toolbar" style="padding:3px 0 16px">
      <select id="am" class="tbtn" style="padding:6px 9px">${measOpts}</select>
      <select id="ay" class="tbtn" style="padding:6px 9px">${yearOpts}</select>
      <span id="asel" class="pills"></span>
      <span class="resn" id="ascope" style="margin-left:auto"></span>
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr" id="agrid">
      <div class="card" id="c-sector" style="grid-column:1/-1"></div>
      <div class="card" id="c-trend" style="grid-column:1/-1"></div>
      <div class="card" id="c-county"></div>
      <div class="card" id="c-form"></div>
    </div>
  </div>`;
  if(window.innerWidth < 900) document.getElementById('agrid').style.gridTemplateColumns='1fr';

  const am=document.getElementById('am'), ay=document.getElementById('ay');
  am.addEventListener('change',()=>{ A.measure=am.value; drawAnalyse(); });
  ay.addEventListener('change',()=>{ A.year=ay.value; drawAnalyse(); });
  drawAnalyse();
}

function drawAnalyse(){
  const mk = A.measure, yr = A.year;
  const fmt = MBY[mk].fmt===int ? int : eurShort;
  const fmtFull = MBY[mk].fmt===int ? int : eur;
  const label = MBY[mk].label;

  /* scope note + sector chips */
  const sel = document.getElementById('asel');
  sel.innerHTML = [...A.sectors].map(i=>
    `<span class="pill">${esc(DB.meta.sectors[i].name)}<button data-i="${i}">×</button></span>`).join('');
  sel.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    A.sectors.delete(+b.dataset.i); drawAnalyse();
  }));

  /* ---- by sector ---- */
  const bySec = aggregate(mk, yr, 'sec');
  const secRows = DB.meta.sectors.map((s,i)=>({
      label:s.name, value:bySec.sums.get(i)||0, n:bySec.counts.get(i)||0, i
    })).filter(r=>r.value>0).sort((a,b)=>b.value-a.value);
  const grand = secRows.reduce((s,r)=>s+r.value,0);
  document.getElementById('ascope').innerHTML =
    `<b>${esc(fmt(grand))}</b> <span class="mut">${esc(label.toLowerCase())}, ${
      yr==='latest'?'latest filed year':yr==='any'?'best year each':'FY '+yr}</span>`;

  const secCard = document.getElementById('c-sector');
  secCard.innerHTML = `
    <div class="cardhead"><div class="grow">
      <h3>${esc(label)} by sector</h3>
      <span class="mut" style="font-size:12px">Click a sector to narrow every chart on this page.</span>
    </div><div class="viewtog" id="vt1"><button data-v="chart" aria-pressed="true">Chart</button><button data-v="table" aria-pressed="false">Table</button></div></div>
    <div id="b-sector"></div>
    <div id="t-sector" hidden></div>`;
  rankedBars(document.getElementById('b-sector'), secRows.map(r=>({
    label:r.label, value:r.value,
    colour: A.sectors.has(r.i) ? 'var(--s2)' : 'var(--s1)',
    onClick:()=>{ A.sectors.has(r.i)?A.sectors.delete(r.i):A.sectors.add(r.i); drawAnalyse(); }
  })), {fmt});
  document.getElementById('t-sector').innerHTML = `<table class="plain">
    <thead><tr><th>Sector</th><th class="r">${esc(label)}</th><th class="r">Share</th><th class="r">Organisations</th><th class="r">Average</th></tr></thead>
    <tbody>${secRows.map(r=>`<tr><td>${esc(r.label)}</td><td class="r">${esc(fmtFull(r.value))}</td>
      <td class="r">${grand?((r.value/grand)*100).toFixed(1)+'%':'—'}</td>
      <td class="r">${NF.format(r.n)}</td><td class="r">${esc(fmtFull(r.n?r.value/r.n:null))}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="r">${esc(fmtFull(grand))}</td><td class="r">100%</td>
      <td class="r">${NF.format(secRows.reduce((s,r)=>s+r.n,0))}</td><td class="r"></td></tr></tbody></table>`;
  wireToggle('vt1','b-sector','t-sector');

  /* ---- trend over the years ---- */
  const trend = yearTotals(mk, null);
  const cats = DB.years.map(String);
  const tCard = document.getElementById('c-trend');
  tCard.innerHTML = `
    <div class="cardhead"><div class="grow">
      <h3>${esc(label)} by financial year</h3>
      <span class="mut" style="font-size:12px">The fall after 2019 is thinning coverage, not a collapse in activity —
      ${NF.format(trend[trend.length-1].n)} organisations report a figure for ${DB.years[DB.years.length-1]}
      against ${NF.format(Math.max(...trend.map(t=>t.n)))} at the peak.</span>
    </div><div class="viewtog" id="vt2"><button data-v="chart" aria-pressed="true">Chart</button><button data-v="table" aria-pressed="false">Table</button></div></div>
    <div id="b-trend"></div><div id="t-trend" hidden></div>`;
  const drawTrend = ()=> lineChart(document.getElementById('b-trend'), cats,
    [{label:label, colour:'var(--s1)', values:trend.map(t=>t.total||null)}],
    {fmt, fmtFull, aria:label+' by financial year', plotH:190});
  drawTrend(); addResize(drawTrend);
  document.getElementById('t-trend').innerHTML = `<table class="plain">
    <thead><tr><th>Year</th><th class="r">${esc(label)}</th><th class="r">Organisations reporting</th><th class="r">Average</th></tr></thead>
    <tbody>${DB.years.map((y,i)=>`<tr><td class="num">${y}</td>
      <td class="r">${esc(fmtFull(trend[i].total))}</td><td class="r">${NF.format(trend[i].n)}</td>
      <td class="r">${esc(fmtFull(trend[i].n?trend[i].total/trend[i].n:null))}</td></tr>`).join('')}</tbody></table>`;
  wireToggle('vt2','b-trend','t-trend',drawTrend);

  /* ---- county + legal form ---- */
  const byCty = aggregate(mk, yr, 'cty');
  const ctyRows = DB.meta.counties.map((c,i)=>({label:titleise(c), value:byCty.sums.get(i)||0, n:byCty.counts.get(i)||0, i}))
    .filter(r=>r.value>0).sort((a,b)=>b.value-a.value);
  document.getElementById('c-county').innerHTML = `
    <div class="cardhead"><div class="grow"><h3>Top counties</h3>
      <span class="mut" style="font-size:12px">By registered address</span></div></div>
    <div id="b-cty"></div>
    <details style="margin-top:12px"><summary class="more" style="cursor:pointer">All ${ctyRows.length} counties as a table</summary>
      <table class="plain" style="margin-top:9px"><thead><tr><th>County</th><th class="r">${esc(label)}</th><th class="r">Orgs</th></tr></thead>
      <tbody>${ctyRows.map(r=>`<tr><td>${esc(r.label)}</td><td class="r">${esc(fmtFull(r.value))}</td><td class="r">${NF.format(r.n)}</td></tr>`).join('')}</tbody></table></details>`;
  rankedBars(document.getElementById('b-cty'), ctyRows.slice(0,12), {fmt});

  const byGf = aggregate(mk, yr, 'gf');
  const gfRows = DB.meta.govForms.map((g,i)=>({label:g, value:byGf.sums.get(i)||0, n:byGf.counts.get(i)||0}))
    .filter(r=>r.value>0).sort((a,b)=>b.value-a.value);
  document.getElementById('c-form').innerHTML = `
    <div class="cardhead"><div class="grow"><h3>By legal form</h3>
      <span class="mut" style="font-size:12px">As recorded in the 2024 directory</span></div></div>
    <div id="b-gf"></div>
    <details style="margin-top:12px"><summary class="more" style="cursor:pointer">All ${gfRows.length} forms as a table</summary>
      <table class="plain" style="margin-top:9px"><thead><tr><th>Legal form</th><th class="r">${esc(label)}</th><th class="r">Orgs</th></tr></thead>
      <tbody>${gfRows.map(r=>`<tr><td>${esc(r.label)}</td><td class="r">${esc(fmtFull(r.value))}</td><td class="r">${NF.format(r.n)}</td></tr>`).join('')}</tbody></table></details>`;
  rankedBars(document.getElementById('b-gf'), gfRows.slice(0,10), {fmt, colour:'var(--s3)'});
}

function wireToggle(togId, chartId, tableId, redraw){
  document.querySelectorAll('#'+togId+' button').forEach(b=>{
    b.addEventListener('click',()=>{
      const chart = b.dataset.v==='chart';
      document.querySelectorAll('#'+togId+' button').forEach(x=>
        x.setAttribute('aria-pressed', String(x.dataset.v===b.dataset.v)));
      document.getElementById(chartId).hidden = !chart;
      document.getElementById(tableId).hidden = chart;
      if(chart && redraw) redraw();
    });
  });
}

/* ================================================================
   Funding — the 2020 Who Funds What directory
   ================================================================ */
function viewFunding(){
  const m = document.getElementById('main');
  if(!DB.funding){
    m.innerHTML = `<div class="sect"><h2>State funding</h2>
      <p class="sub"><span class="spin"></span> Loading the funding directory…</p></div>`;
    return;
  }
  clearResize();
  const funders = DB.meta.funders.map(f=>{
    let total=0, nOrg=0, nAmt=0;
    const progs = new Map();
    for(const id in DB.funding){
      const r = DB.funding[id][f.name]; if(!r) continue;
      nOrg++;
      if(r.total){ total+=r.total; nAmt++; }
      for(const p in (r.p||{})) progs.set(p,(progs.get(p)||0)+r.p[p]);
    }
    return {name:f.name, short:f.short||f.name, total, nOrg, nAmt, progs, def:f};
  }).filter(f=>f.nOrg>0).sort((a,b)=>b.total-a.total);

  const grand = funders.reduce((s,f)=>s+f.total,0);
  const nOrgs = Object.keys(DB.funding).length;

  m.innerHTML = `
  <div class="sect">
    <h2>Who funds what, 2020</h2>
    <p class="sub">The Benefacts <i>Who Funds What</i> directory mapped State funding programmes to the
      organisations receiving them. It was published as a beta covering ten funders for a single year,
      so it is a sample of State funding rather than a complete account of it.</p>
    <div class="stats" style="margin-bottom:18px">
      <div class="stat"><span class="lab">Published funding</span><div class="v">${esc(eurShort(grand))}</div><div class="d">across ${funders.length} funders</div></div>
      <div class="stat"><span class="lab">Organisations</span><div class="v">${NF.format(nOrgs)}</div><div class="d">named in the directory</div></div>
      <div class="stat"><span class="lab">Programmes</span><div class="v">${NF.format(DB.meta.funders.reduce((s,f)=>s+f.programmes.length,0))}</div><div class="d">funding streams mapped</div></div>
      <div class="stat"><span class="lab">Share of register</span><div class="v">${((nOrgs/DB.core.n)*100).toFixed(1)}%</div><div class="d">of all organisations here</div></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="cardhead"><div class="grow"><h3>Funding by body</h3>
        <span class="mut" style="font-size:12px">Published amounts only. Some bodies flag an organisation as funded without stating a figure.</span>
      </div><div class="viewtog" id="vt3"><button data-v="chart" aria-pressed="true">Chart</button><button data-v="table" aria-pressed="false">Table</button></div></div>
      <div id="b-fund"></div><div id="t-fund" hidden></div>
    </div>
    <div class="card">
      <span class="lab">Programmes</span>
      <div class="scrollx" style="margin-top:10px"><table class="plain">
        <thead><tr><th>Funder</th><th>Programme</th><th class="r">2020 total</th><th class="r">Recipients</th></tr></thead>
        <tbody id="progbody"></tbody></table></div>
    </div>
  </div>`;

  rankedBars(document.getElementById('b-fund'),
    funders.filter(f=>f.total>0).map(f=>({label:f.short, value:f.total})), {fmt:eurShort});
  document.getElementById('t-fund').innerHTML = `<table class="plain">
    <thead><tr><th>Funder</th><th class="r">Published 2020</th><th class="r">Organisations funded</th><th class="r">With an amount</th></tr></thead>
    <tbody>${funders.map(f=>`<tr><td>${esc(f.name)}</td><td class="r">${f.total?esc(eur(f.total)):'<span class="mut">none published</span>'}</td>
      <td class="r">${NF.format(f.nOrg)}</td><td class="r">${NF.format(f.nAmt)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="r">${esc(eur(grand))}</td><td class="r"></td><td class="r"></td></tr></tbody></table>`;
  wireToggle('vt3','b-fund','t-fund');

  // programme rows, with recipient counts
  const rows = [];
  for(const f of funders){
    for(const p of f.def.programmes){
      let tot=0,n=0;
      for(const id in DB.funding){
        const r = DB.funding[id][f.name];
        if(r && r.p && r.p[p.acr]){ tot+=r.p[p.acr]; n++; }
      }
      if(n) rows.push({f:f.name, fshort:f.short, p:p.label, tot, n});
    }
  }
  rows.sort((a,b)=>b.tot-a.tot);
  document.getElementById('progbody').innerHTML = rows.map(r=>
    `<tr><td class="mut">${esc(r.fshort)}</td><td>${esc(r.p)}</td>
     <td class="r">${esc(eur(r.tot))}</td><td class="r">${NF.format(r.n)}</td></tr>`).join('');
}
</script>
