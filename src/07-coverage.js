<script>
/* ================================================================
   Coverage — what the dataset holds and what it does not.
   This view exists because a register that hides its gaps cannot
   be trusted; every number here is computed from the files.
   ================================================================ */
'use strict';

function viewCoverage(){
  const m = document.getElementById('main');
  const s = DB.stats;
  clearResize();

  m.innerHTML = `
  <div class="sect">
    <h2>Coverage and known gaps</h2>
    <p class="sub">Benefacts closed in 2022, so this data has a fixed end. Everything below is measured
      from the six archived files, not asserted. These are the gaps a refresh has to close.</p>

    <div class="stats" style="margin-bottom:20px">
      <div class="stat"><span class="lab">Organisations</span><div class="v">${NF.format(s.orgs)}</div>
        <div class="d">union of all three directories</div></div>
      <div class="stat"><span class="lab">In the 2024 directory</span><div class="v">${NF.format(s.in2023)}</div>
        <div class="d">${((s.in2023/s.orgs)*100).toFixed(0)}% of the union</div></div>
      <div class="stat"><span class="lab">With any accounts</span><div class="v">${NF.format(s.withAccounts)}</div>
        <div class="d">${((s.withAccounts/s.orgs)*100).toFixed(0)}% of organisations</div></div>
      <div class="stat"><span class="lab">Financial years</span><div class="v">2013–2020</div>
        <div class="d">2021 holds 16 filings only</div></div>
      <div class="stat"><span class="lab">State funding</span><div class="v">2020</div>
        <div class="d">one year, ten funders</div></div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr" id="cgrid">
      <div class="card" id="c-churn"></div>
      <div class="card" id="c-accyear"></div>
      <div class="card" style="grid-column:1/-1" id="c-secacc"></div>
      <div class="card" style="grid-column:1/-1" id="c-fields"></div>
      <div class="card" style="grid-column:1/-1" id="c-defects"></div>
    </div>
  </div>`;
  if(window.innerWidth < 900) document.getElementById('cgrid').style.gridTemplateColumns='1fr';

  /* ---- register churn ---- */
  document.getElementById('c-churn').innerHTML = `
    <div class="cardhead"><div class="grow"><h3>Register churn</h3>
      <span class="mut" style="font-size:12px">How the published directories differ from one another</span></div></div>
    <table class="plain">
      <tbody>
        <tr><td>In the 2015–2021 directory</td><td class="r">${NF.format(s.inLegacy)}</td></tr>
        <tr><td>In the 2022 directory</td><td class="r">${NF.format(s.in2022)}</td></tr>
        <tr><td>In the 2024 directory</td><td class="r">${NF.format(s.in2023)}</td></tr>
        <tr class="tot"><td>Appeared since 2015–2021</td><td class="r">+${NF.format(s.newIn2023)}</td></tr>
        <tr class="tot"><td>Gone by the 2024 directory</td><td class="r">−${NF.format(s.legacyOnly)}</td></tr>
        <tr><td>Accounts held but in no directory</td><td class="r">${NF.format(s.noDirectory)}</td></tr>
      </tbody></table>
    <p class="mut" style="font-size:11.5px;margin:11px 0 0">
      A disappearance is not necessarily a dissolution: an organisation can leave the directory because
      it was reclassified, merged, or fell out of the registers Benefacts drew on. Each of the
      ${NF.format(s.legacyOnly)} needs checking against the Companies Registration Office and the
      Charities Regulator before it is called closed.</p>
    <button class="tbtn" style="margin-top:12px" id="seechurn">Show organisations no longer in the register →</button>`;
  document.getElementById('seechurn').addEventListener('click',()=>{
    Q.text=''; Q.status.clear(); Q.status.add('dissolved'); Q.sort='linc'; Q.dir=-1;
    location.hash='explore';
  });

  /* ---- accounts per year ---- */
  const accYear = document.getElementById('c-accyear');
  if(DB.finReady){
    const counts = DB.years.map(y=>{
      let n=0;
      const f=DB.fin.cols;
      for(let r=0;r<DB.fin.n;r++) if(f.yr[r]===y) n++;
      return n;
    });
    accYear.innerHTML = `
      <div class="cardhead"><div class="grow"><h3>Filings per financial year</h3>
        <span class="mut" style="font-size:12px">Sets of accounts in the dataset, by year</span></div>
        <div class="viewtog" id="vt4"><button data-v="chart" aria-pressed="true">Chart</button><button data-v="table" aria-pressed="false">Table</button></div></div>
      <div id="b-accyear"></div><div id="t-accyear" hidden></div>`;
    const draw = ()=> groupedBars(document.getElementById('b-accyear'), DB.years.map(String),
      [{label:'Sets of accounts', colour:'var(--s1)', values:counts}],
      {fmt:int, fmtFull:int, aria:'Sets of accounts by financial year', plotH:168, padL:46});
    draw(); addResize(draw);
    document.getElementById('t-accyear').innerHTML = `<table class="plain">
      <thead><tr><th>Year</th><th class="r">Sets of accounts</th><th class="r">Share of organisations with accounts</th></tr></thead>
      <tbody>${DB.years.map((y,i)=>`<tr><td class="num">${y}</td><td class="r">${NF.format(counts[i])}</td>
        <td class="r">${((counts[i]/DB.stats.withAccounts)*100).toFixed(0)}%</td></tr>`).join('')}</tbody></table>`;
    wireToggle('vt4','b-accyear','t-accyear',draw);
  }else{
    accYear.innerHTML = `<span class="lab">Filings per financial year</span>
      <div class="mut" style="margin-top:10px;font-size:12.5px"><span class="spin"></span> loading…</div>`;
  }

  /* ---- accounts coverage by sector ---- */
  const bySec = DB.meta.sectors.map((sec,i)=>{
    let tot=0, acc=0;
    for(let k=0;k<DB.core.n;k++){
      if(C().sec[k]!==i) continue;
      tot++; if(inReg(k,R_ACC)) acc++;
    }
    return {name:sec.name, tot, acc, pct:tot?acc/tot:0, i};
  }).filter(r=>r.tot>0).sort((a,b)=>a.pct-b.pct);

  document.getElementById('c-secacc').innerHTML = `
    <div class="cardhead"><div class="grow"><h3>Accounts coverage by sector</h3>
      <span class="mut" style="font-size:12px">Share of each sector's organisations with at least one set of
      accounts in the dataset. Worst coverage first — these are where a refresh adds the most.</span></div></div>
    <div id="b-secacc"></div>
    <table class="plain" style="margin-top:14px">
      <thead><tr><th>Sector</th><th class="r">Organisations</th><th class="r">With accounts</th><th class="r">Coverage</th><th class="r">Missing</th></tr></thead>
      <tbody>${bySec.map(r=>`<tr><td>${esc(r.name)}</td><td class="r">${NF.format(r.tot)}</td>
        <td class="r">${NF.format(r.acc)}</td>
        <td class="r">${(r.pct*100).toFixed(0)}%</td>
        <td class="r">${NF.format(r.tot-r.acc)}</td></tr>`).join('')}
        <tr class="tot"><td>All sectors</td><td class="r">${NF.format(bySec.reduce((s,r)=>s+r.tot,0))}</td>
        <td class="r">${NF.format(bySec.reduce((s,r)=>s+r.acc,0))}</td>
        <td class="r">${((bySec.reduce((s,r)=>s+r.acc,0)/bySec.reduce((s,r)=>s+r.tot,0))*100).toFixed(0)}%</td>
        <td class="r">${NF.format(bySec.reduce((s,r)=>s+(r.tot-r.acc),0))}</td></tr>
      </tbody></table>`;
  rankedBars(document.getElementById('b-secacc'),
    bySec.map(r=>({label:r.name, value:Math.round(r.pct*100)})),
    {fmt:v=>v+'%'});

  /* ---- field completeness ---- */
  const fieldHost = document.getElementById('c-fields');
  if(DB.finReady){
    const f = DB.fin.cols, n = DB.fin.n;
    const checks = [
      ['inc','Total income'],['exp','Total expenditure'],['na','Net assets'],
      ['fr','Funds & reserves'],['emp','Average employees'],['pay','Payroll'],
      ['gov','Government funding'],['ngov','Non-government funding'],
      ['don','Donations & legacies'],['grants','Grants'],['kmp','Key management pay'],
      ['vol','Volunteer numbers']
    ].map(([k,label])=>{
      let pop=0;
      for(let r=0;r<n;r++) if(f[k][r]!=null) pop++;
      return {label, pop, pct:pop/n};
    }).sort((a,b)=>b.pct-a.pct);

    fieldHost.innerHTML = `
      <div class="cardhead"><div class="grow"><h3>Field completeness</h3>
        <span class="mut" style="font-size:12px">Share of the ${NF.format(n)} sets of accounts in which each
        figure is actually stated. Small companies may file abridged accounts, which legitimately omit most of this.</span></div></div>
      <div id="b-fields"></div>
      <table class="plain" style="margin-top:14px">
        <thead><tr><th>Figure</th><th class="r">Stated in</th><th class="r">Completeness</th><th class="r">Missing</th></tr></thead>
        <tbody>${checks.map(c=>`<tr><td>${esc(c.label)}</td><td class="r">${NF.format(c.pop)}</td>
          <td class="r">${(c.pct*100).toFixed(1)}%</td><td class="r">${NF.format(n-c.pop)}</td></tr>`).join('')}</tbody></table>`;
    rankedBars(document.getElementById('b-fields'),
      checks.map(c=>({label:c.label, value:Math.round(c.pct*100)})),
      {fmt:v=>v+'%'});
  }else{
    fieldHost.innerHTML = `<span class="lab">Field completeness</span>
      <div class="mut" style="margin-top:10px;font-size:12.5px"><span class="spin"></span> loading…</div>`;
  }

  /* ---- defects found while building ---- */
  document.getElementById('c-defects').innerHTML = `
    <div class="cardhead"><div class="grow"><h3>Defects found in the source files</h3>
      <span class="mut" style="font-size:12px">Logged while loading the archive, so a refresh can allow for them</span></div></div>
    <table class="plain">
      <thead><tr><th>Finding</th><th style="min-width:280px">What it means for a refresh</th></tr></thead>
      <tbody>
        <tr><td><b>Financial data effectively ends in 2020</b></td>
          <td>The file is titled 2015–2021 but holds 2013–2020 in substance: 2021 carries 16 sets of
          accounts against ${NF.format(Math.max(...(DB.finReady?DB.years.map(y=>{let n=0;const f=DB.fin.cols;for(let r=0;r<DB.fin.n;r++)if(f.yr[r]===y)n++;return n;}):[0])))} at the peak.
          Four years of accounts, not one, have to be rebuilt from scratch.</td></tr>
        <tr><td><b>${NF.format(DB.stats.noDirectory)} organisations have accounts but appear in no directory</b></td>
          <td>They are carried here from the financial file alone, with no county, address or legal form.
          Any identifier match has to work from the financial file as well as the directories.</td></tr>
        <tr><td><b>${NF.format(DB.stats.orgs - DB.stats.withAccounts)} organisations have no accounts at all</b></td>
          <td>Over half the register. The top-500-by-income target is therefore a target over the
          ${NF.format(DB.stats.withAccounts)} with a known income, not over the whole register.</td></tr>
        <tr><td><b>${DB.stats.rowAnomalies} rows in the governance file are malformed</b></td>
          <td>Purpose text containing newlines splits its row across three lines, leaving fragments
          (${(DB.stats.anomalySamples||[]).map(a=>'<code>'+esc(a)+'</code>').join(', ')}) in the id column.
          Any loader must reject non-numeric ids rather than trust the row count.</td></tr>
        <tr><td><b>Identifier formats are not uniform</b></td>
          <td>Friendly-society numbers appear as <code>5474 R</code> and Revenue sports numbers as
          <code>GS 139</code>. Parsing identifiers as integers silently drops them.</td></tr>
        <tr><td><b>Expenditure is signed negative</b></td>
          <td>Expenditure, creditors and other outflows are negative in the source. Summing income and
          expenditure without checking signs produces a surplus where there is a deficit.</td></tr>
        <tr><td><b>Registered names are upper-cased</b></td>
          <td>Names are stored in capitals. This front end title-cases them for reading and keeps the
          registered form for search and export, but the archive holds no mixed-case original.</td></tr>
      </tbody></table>`;
}

/* ================================================================
   About — sources, licence, method
   ================================================================ */
function viewAbout(){
  clearResize();
  const s = DB.stats;
  document.getElementById('main').innerHTML = `
  <div class="sect" style="max-width:76ch">
    <h2>About Méid</h2>
    <p class="sub">A working interface over the archived Benefacts open data, built to show what a
      refreshed public register of Irish nonprofits could do.</p>

    <h3 style="margin:24px 0 7px;font-size:14px">The name</h3>
    <p class="ink2" style="font-size:13.5px;line-height:1.65">
      <i>Méid</i> is the Irish for amount or extent &mdash; the word inside the question
      <i>c&eacute; mh&eacute;ad?</i>, how much. It is the question this register exists to answer:
      how much an organisation raised, how much it spent, how much of it came from the State.
      The project is independent of Benefacts, which closed in 2022, and uses a name of its own.
    </p>

    <h3 style="margin:24px 0 7px;font-size:14px">What it covers</h3>
    <p class="ink2" style="font-size:13.5px;line-height:1.65">
      ${NF.format(s.orgs)} organisations, assembled as the union of the 2015–2021, 2022 and 2024
      Benefacts directories, plus ${NF.format(s.noDirectory)} that appear only in the financial file.
      ${NF.format(s.withAccounts)} have at least one set of accounts, giving 70,476 organisation-years
      across 182 financial fields. ${NF.format(s.withGovernance)} have a stated legal purpose or
      charitable objects. ${NF.format(s.withStateFunding)} appear in the 2020 <i>Who Funds What</i> directory.
    </p>

    <h3 style="margin:24px 0 7px;font-size:14px">Source files</h3>
    <table class="plain">
      <thead><tr><th>File</th><th class="r">Rows used</th><th>Used for</th></tr></thead>
      <tbody>
        <tr><td>Directory of Irish Nonprofits 2015–2021</td><td class="r">${NF.format(s.inLegacy)}</td><td>Legacy register, sector, county, identifiers, website</td></tr>
        <tr><td>Directory of Irish Nonprofits 2022</td><td class="r">${NF.format(s.in2022)}</td><td>Register membership in 2022</td></tr>
        <tr><td>Irish Nonprofits Directory 2024</td><td class="r">${NF.format(s.in2023)}</td><td>Current register, legal form, address, alternative names</td></tr>
        <tr><td>Financial dataset 2015–2021</td><td class="r">70,476</td><td>All financial figures and provenance</td></tr>
        <tr><td>Governance dataset 2015–2021</td><td class="r">${NF.format(s.withGovernance)}</td><td>Legal purpose and charitable objects</td></tr>
        <tr><td>Who Funds What 2020</td><td class="r">${NF.format(s.withStateFunding)}</td><td>State funding by body and programme</td></tr>
      </tbody></table>

    <h3 style="margin:24px 0 7px;font-size:14px">Method</h3>
    <p class="ink2" style="font-size:13.5px;line-height:1.65">
      Organisations are joined on the Benefacts ID across all six files. The most recent directory wins
      where fields conflict; older directories and the governance and financial files backfill anything
      missing. Non-numeric IDs are rejected. Registration numbers are kept as published rather than
      parsed as integers. Expenditure is stored negative in the source and is shown here as a positive
      amount, with the sign convention stated wherever a figure appears. No figure is imputed,
      interpolated or estimated: a blank means the source is blank.
    </p>

    <h3 style="margin:24px 0 7px;font-size:14px">Licence and attribution</h3>
    <p class="ink2" style="font-size:13.5px;line-height:1.65">
      The underlying data is the Benefacts Database of Irish Nonprofits, archived by the Irish Social
      Science Data Archive and published under a Creative Commons Attribution 4.0 licence. Credit is
      due to Benefacts and to ISSDA. This interface is a prototype and is not affiliated with either.
    </p>

    <div class="note" style="margin-top:20px">
      <b>This is a historic snapshot.</b> Benefacts closed in 2022 after its State funding was
      withdrawn. Nothing here is current: the register ends in 2024 and the financial data ends in
      2020. For the present status of an organisation, check the
      <a href="https://www.charitiesregulator.ie/" target="_blank" rel="noopener noreferrer">Charities Regulator</a>
      and the <a href="https://core.cro.ie/" target="_blank" rel="noopener noreferrer">Companies Registration Office</a> directly.
    </div>

    <div class="foot">
      <b style="color:var(--ink)">Sources</b><br>
      <a href="https://www.ucd.ie/issda/data/benefacts" target="_blank" rel="noopener noreferrer">ISSDA — Benefacts Database of Irish Nonprofits 2015–2021</a><br>
      <a href="https://www.charitiesregulator.ie/" target="_blank" rel="noopener noreferrer">Charities Regulator</a> ·
      <a href="https://core.cro.ie/" target="_blank" rel="noopener noreferrer">Companies Registration Office</a>
    </div>
  </div>`;
}
</script>
