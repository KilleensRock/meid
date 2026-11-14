<script>
/* ================================================================
   Organisation profile — identifiers, stated purpose, financial
   history, the full filed accounts, and state funding.
   ================================================================ */
'use strict';

const SECTION_ORDER = ['Income & Expenditure','Balance Sheet','Notes  to the Accounts','Funding','Other'];
const SECTION_LABEL = {
  'Income & Expenditure':'Income & expenditure',
  'Balance Sheet':'Balance sheet',
  'Notes  to the Accounts':'Notes to the accounts',
  'Funding':'Funding analysis',
  'Other':'Other fields'
};

async function viewOrg(id){
  const m = document.getElementById('main');
  const k = DB.byId.get(id);
  if(k===undefined){
    m.innerHTML = `<div class="sect"><h2>Organisation not found</h2>
      <p class="sub">No organisation in this dataset carries the id ${esc(id)}.</p>
      <button class="tbtn" onclick="location.hash='explore'">Back to search</button></div>`;
    return;
  }
  const c = C();
  const sec = sectorOf(k), sub = subsectorOf(k);
  const years = finYears(k);

  m.innerHTML = `
    <button class="back" id="backbtn">← Back to register</button>
    <div class="ohead">
      <h1>${esc(orgName(k))}</h1>
      <div class="meta">
        <span class="bdg">${esc(sec?sec.name:'Unclassified')}</span>
        ${sub?`<span class="mut" style="font-size:12.5px">${esc(sub.name)}</span>`:''}
        ${isCurrent(k)
          ? '<span class="bdg ok">In the 2024 register</span>'
          : noDirectory(k)
            ? '<span class="bdg wn">Accounts only — not in a published directory</span>'
            : '<span class="bdg no">Not in the 2024 register</span>'}
        ${inReg(k,R_FUND)?'<span class="bdg">State-funded 2020</span>':''}
      </div>
      <div class="alt" id="altnames"></div>
    </div>
    <div class="ocols">
      <div id="ocol-main">
        <div id="finsummary"></div>
        <div id="updatenotes"></div>
        <div id="accounts"></div>
        <div id="statefunding"></div>
        <div id="stategrants"></div>
      </div>
      <aside>
        <div class="card" style="margin-bottom:14px">
          <span class="lab">Identifiers</span>
          <dl class="kv" id="ids"></dl>
        </div>
        <div class="card" style="margin-bottom:14px">
          <span class="lab">Registers</span>
          <dl class="kv" id="regs"></dl>
        </div>
        <div class="card" id="purposecard">
          <span class="lab">Stated purpose</span>
          <div id="purpose"><span class="skel" style="display:block;width:100%"></span></div>
        </div>
      </aside>
    </div>`;

  document.getElementById('backbtn').addEventListener('click',()=>{
    if(history.length>1) history.back(); else location.hash='explore';
  });

  /* ---- alternative names ---- */
  const alt = String(extVal('alt',k)||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(alt.length) document.getElementById('altnames').innerHTML =
    '<span class="lab">Also known as</span> '+alt.map(a=>esc(titleise(a))).join(' &middot; ');

  /* ---- identifier panel ---- */
  const idRow = (dt,dd,mono)=> dd ? `<div><dt>${esc(dt)}</dt><dd class="${mono?'mono':''}">${dd}</dd></div>` : '';
  const url = extVal('url',k);
  document.getElementById('ids').innerHTML =
    idRow('Benefacts ID', esc(c.id[k]), true) +
    idRow('CRO number', esc(extVal('cro',k)), true) +
    idRow('Charity (RCN)', esc(extVal('rcn',k)), true) +
    idRow('Revenue (CHY)', esc(extVal('chy',k)), true) +
    idRow('School roll', esc(extVal('roll',k)), true) +
    idRow('Friendly society', esc(extVal('rfs',k)), true) +
    idRow('Legal form', esc(gformOf(k)||'')) +
    idRow('Incorporated', esc(extVal('inc',k))) +
    idRow('Address', esc(titleise(extVal('addr',k)))) +
    idRow('County', esc(titleise(countyOf(k)||''))) +
    idRow('Eircode', esc(extVal('eir',k)), true) +
    idRow('Website', url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url.replace(/^https?:\/\//,''))}</a>`:'') +
    (DB.extReady?'':'<div><dt>Loading</dt><dd><span class="spin"></span></dd></div>');

  const crost = extVal('crost',k), rcnst = extVal('rcnst',k);
  document.getElementById('regs').innerHTML =
    idRow('Company status', crost?esc(titleise(crost)):'') +
    idRow('Charity status', rcnst?esc(rcnst):'') +
    idRow('Tax relief', extVal('tax',k)?'Yes':'') +
    idRow('Sports body', extVal('sport',k)?'Yes':'') +
    `<div><dt>Appears in</dt><dd>${
      [inReg(k,R_LEGACY)?'2015–2021':null, inReg(k,R_2022)?'2022':null, inReg(k,R_2023)?'2024':null]
      .filter(Boolean).map(x=>`<span class="bdg" style="margin:0 3px 3px 0">${x}</span>`).join('') ||
      '<span class="mut">no published directory</span>'}</dd></div>` +
    `<div><dt>Accounts held</dt><dd>${years.length
      ? esc(years.length+' year'+(years.length===1?'':'s')+' · '+years[0]+'–'+years[years.length-1])
      : '<span class="mut">none</span>'}</dd></div>`;

  /* ---- purpose text ---- */
  loadGov(id).then(g=>{
    const el = document.getElementById('purpose'); if(!el) return;
    if(!g){ document.getElementById('purposecard').remove(); return; }
    let html = '';
    if(g.lp) html += `<div class="lab" style="margin-bottom:5px">Legal purpose</div>
      <div class="purpose clamp" id="lp">${esc(g.lp)}</div>`;
    if(g.co) html += `<div class="lab" style="margin:13px 0 5px">Charitable objects</div>
      <div class="purpose clamp" id="co">${esc(g.co)}</div>`;
    html += `<button class="more" id="expandp" style="margin-top:8px">Show full text</button>`;
    el.innerHTML = html;
    document.getElementById('expandp').addEventListener('click',e=>{
      const on = el.querySelector('.purpose.clamp');
      el.querySelectorAll('.purpose').forEach(p=>p.classList.toggle('clamp', !on));
      e.target.textContent = on ? 'Show less' : 'Show full text';
    });
  });

  /* ---- financial summary + accounts ---- */
  if(!years.length){
    document.getElementById('finsummary').innerHTML = `
      <div class="note">No financial statements for this organisation are held in the archived
      Benefacts dataset. That does not mean none were filed — the dataset covers accounts
      keyed by Benefacts up to 2020, and ${NF.format(DB.stats.orgs - DB.stats.withAccounts)}
      of the ${NF.format(DB.stats.orgs)} organisations here have no accounts in it.</div>`;
  }else{
    renderFinSummary(k, years);
  }
  renderUpdateNotes(id);
  renderStateFunding(id);
  renderGrants(id);
  if(years.length) renderAccounts(id, years);
}

/* Caveats recorded against post-archive years: anomalies in a source
   filing, and figures deliberately left blank rather than imputed.   */
function renderUpdateNotes(id){
  const host = document.getElementById('updatenotes');
  if(!host) return;
  const u = DB.updates && DB.updates[id];
  const notes = (u && u.notes) || [];
  if(!notes.length || !(u.years||[]).length){ host.innerHTML=''; return; }
  const src = updateSourceFor(id);
  const ys = u.years.map(y=>y.y);
  host.innerHTML = `<div class="note" style="margin-top:14px">
    <b>About the ${esc(String(Math.min(...ys)))}–${esc(String(Math.max(...ys)))} figures</b>
    ${src?` <span class="mut">(${esc(src.name)})</span>`:''}
    <ul style="margin:6px 0 0 18px;padding:0">${notes.map(n=>`<li style="margin:3px 0">${esc(n)}</li>`).join('')}</ul>
  </div>`;
}

/* State grant awards announced after the archive ends (updates layer).
   Listed beside the accounts, never added into them: an award is the
   amount announced, not income shown in a set of filed accounts.      */
function renderGrants(id){
  const host = document.getElementById('stategrants');
  if(!host) return;
  const u = DB.updates && DB.updates[id];
  const gs = (u && u.grants) ? u.grants.slice().sort((a,b)=>(b.y-a.y)||((b.amt||0)-(a.amt||0))) : [];
  if(!gs.length){ host.innerHTML=''; return; }
  const srcs = DB.updates._sources || {};
  const total = gs.reduce((s,g)=>s+(g.amt||0),0);
  const eurExact = v => (v===null||v===undefined) ? '—'
    : '€' + v.toLocaleString('en-IE',{minimumFractionDigits:(v%1?2:0), maximumFractionDigits:2});
  const used = [...new Set(gs.map(g=>g.src))].map(s=>srcs[s]).filter(Boolean);

  host.innerHTML = `<div class="card" style="margin-top:14px">
    <div class="cardhead"><div class="grow">
      <h3>State grants announced since the archive</h3>
      <span class="mut" style="font-size:12px">Awards as published by the awarding body, added after the
      Benefacts archive ends. An award is the amount announced, not income shown in filed accounts.</span>
    </div></div>
    <div class="stats" style="margin-bottom:14px"><div class="stat">
      <span class="lab">Announced awards</span><div class="v">${esc(eurExact(Math.round(total)))}</div>
      <div class="d">${gs.length} award${gs.length===1?'':'s'}, ${gs[gs.length-1].y}${gs[0].y!==gs[gs.length-1].y?'–'+gs[0].y:''}</div></div></div>
    <div class="scrollx"><table class="plain">
      <thead><tr><th>Year</th><th>Funder / programme</th><th>Project</th><th>Area</th><th class="r">Award</th></tr></thead>
      <tbody>${gs.map(g=>`<tr>
        <td>${esc(String(g.y))}</td>
        <td><b>${esc(g.funder||'')}</b>${g.prog?`<div class="mut" style="font-size:11.5px">${esc(g.prog)}</div>`:''}</td>
        <td>${esc(g.proj||'')}</td>
        <td>${esc(g.area||'')}</td>
        <td class="r">${esc(eurExact(g.amt))}</td></tr>`).join('')}</tbody></table></div>
    ${used.length?`<p class="mut" style="font-size:11.5px;margin-top:10px">Source: ${used.map(s=>
      s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>`:esc(s.name)
    ).join(' · ')}${used[0].published?', published '+esc(used[0].published):''}.</p>`:''}
  </div>`;
}

function renderFinSummary(k, years){
  const host = document.getElementById('finsummary');
  const f = DB.fin.cols;
  const cats = years.map(String);
  const inc = years.map(y=>finVal(k,'inc',y));
  const exp = years.map(y=>{ const v=finVal(k,'exp',y); return v==null?null:Math.abs(v); });
  const emp = years.map(y=>finVal(k,'emp',y));
  const gov = years.map(y=>finVal(k,'gov',y));
  const last = years[years.length-1];
  const li = finVal(k,'inc',last), le = finVal(k,'exp',last);
  const surplus = (li!=null&&le!=null) ? li+le : null;   // expenditure is negative in source
  const updated = years.filter(y=>yearProvenance(k,y)===PROV_UPDATE);
  const usrc = updateSourceFor(C().id[k]);

  host.innerHTML = `
    ${updated.length && usrc ? `<div class="note" style="margin-bottom:15px">
      <b>${updated.length} year${updated.length===1?'':'s'} here (${updated.join(', ')}) come from
      ${esc(usrc.name)}, not from the Benefacts archive.</b>
      They are headline figures from the charity's annual return on the Regulator's own definitions,
      so they are not line-for-line comparable with the earlier years: there is no breakdown of the
      accounts behind them, and the staff figure is a headcount of full- and part-time employees
      rather than an average over the year. Retrieved ${esc(usrc.retrieved)}.
    </div>` : ''}
    <div class="stats" style="margin-bottom:16px">
      <div class="stat"><span class="lab">Income · FY ${last}</span><div class="v">${esc(eurShort(li))}</div>
        <div class="d">${li==null?'not stated':'total income & endowments'}</div></div>
      <div class="stat"><span class="lab">Expenditure</span><div class="v">${esc(eurShort(le==null?null:Math.abs(le)))}</div>
        <div class="d">${le==null?'not stated':'total expenditure'}</div></div>
      <div class="stat"><span class="lab">Surplus / deficit</span>
        <div class="v" style="color:${surplus==null?'inherit':surplus>=0?'var(--good)':'var(--crit)'}">${esc(eurShort(surplus))}</div>
        <div class="d">${surplus==null?'not calculable':'income less expenditure'}</div></div>
      <div class="stat"><span class="lab">Employees</span><div class="v">${esc(int(finVal(k,'emp',last)))}</div>
        <div class="d">${yearProvenance(k,last)===PROV_UPDATE ? 'full- and part-time headcount' : 'average in the year'}</div></div>
      <div class="stat"><span class="lab">Net assets</span><div class="v">${esc(eurShort(finVal(k,'na',last)))}</div>
        <div class="d">balance sheet</div></div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="cardhead">
        <div class="grow">
          <h3>Income and expenditure, ${years[0]}–${years[years.length-1]}</h3>
          <span class="mut" style="font-size:12px">As filed. Gaps mean no accounts were keyed for that year.</span>
        </div>
        <div class="viewtog" id="fvt">
          <button data-v="chart" aria-pressed="true">Chart</button>
          <button data-v="table" aria-pressed="false">Table</button>
        </div>
      </div>
      <div id="fchart"></div>
      <div id="ftable" hidden></div>
    </div>`;

  const chartHost = document.getElementById('fchart');
  const draw = () => groupedBars(chartHost, cats, [
    {label:'Income', colour:'var(--s1)', values:inc},
    {label:'Expenditure', colour:'var(--s2)', values:exp}
  ], {aria:'Income and expenditure by financial year', plotH:190});
  draw();
  addResize(draw);

  document.getElementById('ftable').innerHTML = `<div class="scrollx"><table class="plain">
    <thead><tr><th>Financial year</th><th class="r">Income</th><th class="r">Expenditure</th>
    <th class="r">Surplus / deficit</th><th class="r">Employees</th><th class="r">Govt funding</th><th>Source</th></tr></thead>
    <tbody>${years.map((y,i)=>{
      const s = (inc[i]!=null&&exp[i]!=null)?inc[i]-exp[i]:null;
      const up = yearProvenance(k,y)===PROV_UPDATE;
      return `<tr><td class="num">${y}${up?' <span class="bdg wn">new</span>':''}</td><td class="r">${esc(eur(inc[i]))}</td>
        <td class="r">${esc(eur(exp[i]))}</td>
        <td class="r" style="color:${s==null?'inherit':s>=0?'var(--good)':'var(--crit)'}">${esc(eur(s))}</td>
        <td class="r">${esc(int(emp[i]))}</td><td class="r">${esc(eur(gov[i]))}</td>
        <td class="mut" style="font-size:11.5px">${up?esc((usrc&&usrc.name)||'Charities Regulator'):'Benefacts archive'}</td></tr>`;
    }).join('')}</tbody></table></div>`;

  document.querySelectorAll('#fvt button').forEach(b=>{
    b.addEventListener('click',()=>{
      const chart = b.dataset.v==='chart';
      document.querySelectorAll('#fvt button').forEach(x=>x.setAttribute('aria-pressed', String(x.dataset.v===b.dataset.v)));
      document.getElementById('fchart').hidden = !chart;
      document.getElementById('ftable').hidden = chart;
      if(chart) draw();
    });
  });
}

/* ---------------- the full filed accounts ---------------- */
async function renderAccounts(id, years){
  const host = document.getElementById('accounts');
  host.innerHTML = `<div class="card"><span class="lab">Filed accounts</span>
    <div class="mut" style="font-size:12.5px;margin-top:8px"><span class="spin"></span> loading the full line items…</div></div>`;
  const rows = await loadDetail(id);
  if(!rows){ host.innerHTML=''; return; }

  const byYear = new Map(rows.map(r=>[r.y,r]));
  const ys = rows.map(r=>r.y).sort((a,b)=>a-b);
  const fields = DB.meta.finFields;

  // group the 182 fields by section, keeping dictionary order and depth
  const groups = new Map();
  for(const f of fields){
    if(f.section==='Identity') continue;
    if(!groups.has(f.section)) groups.set(f.section,[]);
    groups.get(f.section).push(f);
  }

  let html = `<div class="card">
    <div class="cardhead"><div class="grow">
      <h3>Filed accounts, line by line</h3>
      <span class="mut" style="font-size:12px">Every field Benefacts captured from the filed financial
      statements. Rows with no figure in any year are hidden.</span>
    </div></div>`;

  let shown = 0;
  for(const sname of SECTION_ORDER){
    const fs = groups.get(sname); if(!fs) continue;
    const live = fs.filter(f=>ys.some(y=>byYear.get(y)[f.code]!==undefined));
    if(!live.length) continue;
    shown += live.length;
    html += `<div class="lab" style="display:block;margin:17px 0 5px">${esc(SECTION_LABEL[sname]||sname)}</div>
      <div class="scrollx"><table class="plain">
      <thead><tr><th style="min-width:230px">Line item</th>${ys.map(y=>`<th class="r">${y}</th>`).join('')}</tr></thead>
      <tbody>${live.map(f=>{
        const tot = f.depth===0;
        return `<tr class="${tot?'tot':''}">
          <td class="${f.depth?'ind'+f.depth:''}" title="${esc(f.code)}">${esc(f.label)}</td>
          ${ys.map(y=>{
            const v = byYear.get(y)[f.code];
            return `<td class="r">${v===undefined?'<span class="mut">—</span>':esc(eur(v))}</td>`;
          }).join('')}</tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // per-year provenance
  html += `<div class="lab" style="display:block;margin:19px 0 5px">How each year was filed</div>
    <div class="scrollx"><table class="plain">
    <thead><tr><th>Year</th><th>Year end</th><th>Source</th><th>Audited</th>
      <th>Basis</th><th>Flags</th></tr></thead>
    <tbody>${ys.map(y=>{
      const r = byYear.get(y), fl = r.fl||0;
      const flags = [];
      if(fl&1) flags.push('SORP');
      if(fl&2) flags.push('Abridged');
      if(fl&4) flags.push('HSE s.38');
      if(fl&8) flags.push('HEA-funded');
      if(fl&16) flags.push('2+ filings in year');
      const aud = (fl&64) ? ((fl&32)?'<span class="bdg ok">Audited</span>':'<span class="bdg wn">Unaudited</span>')
                          : '<span class="mut">not stated</span>';
      return `<tr><td class="num">${y}</td><td class="num">${esc(r.e||'—')}</td>
        <td>${esc(r.sr||'—')}</td><td>${aud}</td><td>${esc(r.rs||'—')}</td>
        <td>${flags.map(f=>`<span class="bdg" style="margin:0 3px 2px 0">${esc(f)}</span>`).join('')||'<span class="mut">—</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="mut" style="font-size:11.5px;margin:11px 0 0">
      ${shown} populated line items across ${ys.length} year${ys.length===1?'':'s'}.
      Expenditure, creditors and other outflows carry a negative sign in the source data.
      Source abbreviations: CRO — Companies Registration Office; RFS — Registry of Friendly
      Societies; SIPO — Standards in Public Office; OIR — Oireachtas; SELF — supplied by the organisation.
    </p></div>`;
  host.innerHTML = html;
}

/* ---------------- state funding 2020 ---------------- */
function renderStateFunding(id){
  const host = document.getElementById('statefunding');
  if(!DB.funding){ host.innerHTML=''; return; }
  const rec = DB.funding[id];
  if(!rec){ host.innerHTML=''; return; }

  const funders = Object.keys(rec).sort((a,b)=>(rec[b].total||0)-(rec[a].total||0));
  const total = funders.reduce((s,f)=>s+(rec[f].total||0),0);
  const named = funders.filter(f=>rec[f].total);

  host.innerHTML = `<div class="card" style="margin-top:14px">
    <div class="cardhead"><div class="grow">
      <h3>State funding, 2020</h3>
      <span class="mut" style="font-size:12px">From the Benefacts <i>Who Funds What</i> directory (beta).
      A funder may be marked as funding an organisation without a published amount.</span>
    </div></div>
    ${total?`<div class="stats" style="margin-bottom:14px"><div class="stat">
      <span class="lab">Published total, 2020</span><div class="v">${esc(eurShort(total))}</div>
      <div class="d">across ${named.length} funder${named.length===1?'':'s'}</div></div></div>`:''}
    <div class="scrollx"><table class="plain">
      <thead><tr><th>Funder / programme</th><th class="r">2020</th></tr></thead>
      <tbody>${funders.map(fn=>{
        const r = rec[fn];
        const progs = Object.keys(r.p||{});
        const label = DB.meta.funders.find(x=>x.name===fn);
        let out = `<tr class="sub0"><td><b>${esc(fn)}</b>${!r.total&&r.funded?' <span class="bdg wn">funded, amount not published</span>':''}</td>
          <td class="r"><b>${r.total?esc(eur(r.total)):'<span class="mut">—</span>'}</b></td></tr>`;
        for(const p of progs){
          const pl = label && label.programmes.find(x=>x.acr===p);
          out += `<tr><td class="ind1">${esc(pl?pl.label:p)}</td><td class="r">${esc(eur(r.p[p]))}</td></tr>`;
        }
        return out;
      }).join('')}</tbody></table></div></div>`;
}

/* re-draw charts on resize, scoped to the live view */
let RESIZERS = [];
function addResize(fn){ RESIZERS.push(fn); }
function clearResize(){ RESIZERS = []; }
let rzT=null;
window.addEventListener('resize',()=>{
  clearTimeout(rzT);
  rzT = setTimeout(()=>RESIZERS.forEach(f=>{ try{f();}catch(e){} }),180);
});
</script>
