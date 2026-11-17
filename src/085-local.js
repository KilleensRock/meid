<script>
/* ================================================================
   Local — locally relevant charities by county, for councillors,
   candidates and journalists. Built from data/local.json, which
   build/build_local.py makes from the updates layer.
   ================================================================ */
'use strict';

const LOCAL = {data:null, county:'', group:'', national:true};

async function viewLocal(){
  const m = document.getElementById('main');
  if(!LOCAL.data){
    m.innerHTML = '<div class="sect"><p class="mut">Loading local figures…</p></div>';
    try{ LOCAL.data = await grab('data/local.json'); }
    catch(e){ m.innerHTML = `<div class="sect"><p>Could not load local figures: ${esc(e.message)}</p></div>`; return; }
    if((location.hash||'').replace(/^#/,'') !== 'local') return;
  }
  drawLocal();
}

function drawLocal(){
  const d = LOCAL.data, m = document.getElementById('main');
  const counties = d.counties.map(c=>c.county);
  m.innerHTML = `
  <div class="sect">
    <h2>Local: charities that matter in your county</h2>
    <p class="sub">${NF.format(d.rows.length)} organisations whose work is decided locally: local development
      companies, approved housing bodies, Traveller organisations, homeless services and integration groups.
      Figures are each organisation's latest return to the Charities Regulator. County is the registered
      address; bodies that work nationally are marked and kept out of county totals.</p>
    <div class="qbuild no-print" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <select id="lc" style="flex:1 1 160px"><option value="">All counties</option>
        ${counties.map(c=>`<option${LOCAL.county===c?' selected':''}>${esc(c)}</option>`).join('')}</select>
      <select id="lg" style="flex:1 1 200px"><option value="">All groups</option>
        ${d.groups.map(g=>`<option${LOCAL.group===g?' selected':''}>${esc(g)}</option>`).join('')}</select>
      <label style="font-size:12px;display:flex;gap:5px;align-items:center;white-space:nowrap">
        <input type="checkbox" id="ln"${LOCAL.national?' checked':''}> Include national bodies</label>
      <a class="tbtn" href="data/exports/local-charities.csv" download>Charities CSV</a>
      <a class="tbtn" href="data/exports/local-by-county.csv" download>County CSV</a>
      <button class="tbtn" id="lp">Print</button>
    </div>
    <div class="stats" id="lstats" style="margin-bottom:18px"></div>
    <div class="card" id="ltable" style="overflow-x:auto"></div>
    <div class="card" id="lcounty" style="margin-top:14px;overflow-x:auto"></div>
    <p class="mut" style="font-size:11.5px;margin-top:12px">Source: ${esc(d.source.name)}
      (<a href="${esc(d.source.url)}">${esc(d.source.url)}</a>). Population: ${esc(d.population.name)}.
      State funding adds government and other public bodies. A charity's registered address is not
      always where it spends its money; check the profile before drawing local conclusions.</p>
  </div>`;
  document.getElementById('lc').onchange = e=>{ LOCAL.county=e.target.value; fillLocal(); };
  document.getElementById('lg').onchange = e=>{ LOCAL.group=e.target.value; fillLocal(); };
  document.getElementById('ln').onchange = e=>{ LOCAL.national=e.target.checked; fillLocal(); };
  document.getElementById('lp').onclick = ()=>window.print();
  fillLocal();
}

function fillLocal(){
  const d = LOCAL.data;
  const rows = d.rows.filter(r =>
    (!LOCAL.group || r.group===LOCAL.group) &&
    (r.scope==='National' ? LOCAL.national : (!LOCAL.county || r.county===LOCAL.county)));
  const local = rows.filter(r=>r.scope==='County');
  const sum = (rs,k)=>rs.reduce((a,r)=>a+(r[k]||0),0);
  const pop = LOCAL.county ? d.counties.find(c=>c.county===LOCAL.county).population : d.population.total;
  const st = sum(local,'state');
  document.getElementById('lstats').innerHTML = `
    <div class="stat"><span class="lab">Organisations</span><div class="v">${NF.format(local.length)}</div>
      <div class="d">${LOCAL.county?esc(LOCAL.county):'all counties'}${LOCAL.national?` + ${rows.length-local.length} national`:''}</div></div>
    <div class="stat"><span class="lab">Income</span><div class="v">${eurShort(sum(local,'income'))}</div><div class="d">latest returns, county bodies</div></div>
    <div class="stat"><span class="lab">State funding</span><div class="v">${eurShort(st)}</div>
      <div class="d">${sum(local,'income')?Math.round(st/sum(local,'income')*100)+'% of income':'—'}</div></div>
    <div class="stat"><span class="lab">Per person</span><div class="v">€${(st/pop).toFixed(2)}</div><div class="d">State funding ÷ Census 2022</div></div>
    <div class="stat"><span class="lab">Staff</span><div class="v">${NF.format(sum(local,'staff'))}</div><div class="d">full and part time</div></div>`;

  document.getElementById('ltable').innerHTML = `
    <div class="cardhead"><div class="grow"><h3>Organisations</h3></div></div>
    <table class="plain"><thead><tr><th>Charity</th><th>Group</th><th>County</th><th class="r">Year</th>
      <th class="r">Income</th><th class="r">State</th><th class="r">State %</th><th class="r">Surplus</th><th class="r">Staff</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td><a href="#org-${esc(r.id)}">${esc(r.name)}</a>${r.note?` <span class="mut" title="${esc(r.note)}">ⓘ</span>`:''}</td>
      <td>${esc(r.group)}</td><td>${r.scope==='National'?'National':esc(r.county)}</td><td class="r">${r.year}</td>
      <td class="r">${eurShort(r.income)}</td><td class="r">${eurShort(r.state)}</td>
      <td class="r">${r.income&&r.state!=null?Math.round(r.state/r.income*100)+'%':'—'}</td>
      <td class="r">${eurShort(r.surplus)}</td><td class="r">${int(r.staff)}</td></tr>`).join('')
      || '<tr><td colspan="9" class="mut">No organisations match.</td></tr>'}</tbody></table>`;

  const cs = d.counties.filter(c=>!LOCAL.county || c.county===LOCAL.county).map(c=>{
    if(!LOCAL.group) return c;
    const rs = d.rows.filter(r=>r.scope==='County' && r.county===c.county && r.group===LOCAL.group);
    const s = sum(rs,'state');
    return {...c, organisations:rs.length, income:sum(rs,'income'), state:s, staff:sum(rs,'staff'), statePerPerson:s/c.population};
  });
  document.getElementById('lcounty').innerHTML = `
    <div class="cardhead"><div class="grow"><h3>By county${LOCAL.group?': '+esc(LOCAL.group):''}</h3>
      <span class="mut" style="font-size:12px">County-scope bodies only</span></div></div>
    <table class="plain"><thead><tr><th>County</th><th class="r">Population</th><th class="r">Organisations</th>
      <th class="r">Income</th><th class="r">State funding</th><th class="r">Per person</th><th class="r">Staff</th></tr></thead>
    <tbody>${cs.map(c=>`<tr><td><a href="javascript:void 0" data-c="${esc(c.county)}">${esc(c.county)}</a></td>
      <td class="r">${NF.format(c.population)}</td><td class="r">${c.organisations}</td>
      <td class="r">${eurShort(c.income)}</td><td class="r">${eurShort(c.state)}</td>
      <td class="r">€${c.statePerPerson.toFixed(2)}</td><td class="r">${NF.format(c.staff)}</td></tr>`).join('')}</tbody></table>`;
  document.querySelectorAll('#lcounty a[data-c]').forEach(a=>a.onclick=()=>{
    LOCAL.county=a.dataset.c; document.getElementById('lc').value=LOCAL.county; fillLocal(); window.scrollTo(0,0); });
}
</script>
