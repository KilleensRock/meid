<script>
/* ================================================================
   Benefacts 2 — front end over the archived Benefacts open data.

   Data layer. Files are published gzipped; some hosts set
   Content-Encoding and the browser inflates for us, so the loader
   accepts either plain JSON or gzip bytes.
   ================================================================ */
'use strict';

const DB = {
  meta:null, stats:null,
  core:null,            // column arrays, all organisations
  ext:null,             // sparse identifier / address columns
  fin:null,             // one row per organisation-year
  byId:new Map(),       // benefacts id -> row index
  finByOrg:null,        // row index -> array of fin row positions
  years:[],             // financial years present, ascending
  funding:null,         // state funding 2020
  detail:new Map(),     // bucket -> parsed json
  gov:new Map(),
  ready:false, extReady:false, finReady:false
};

async function grab(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(path+' → HTTP '+r.status);
  const buf = await r.arrayBuffer();
  // Payloads are gzip stored under a .json name. Depending on whether the
  // host sets Content-Encoding, the browser may already have inflated them,
  // so sniff the gzip magic bytes rather than assuming either way.
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if(!(head[0]===0x1f && head[1]===0x8b)) return JSON.parse(new TextDecoder().decode(buf));
  if(typeof DecompressionStream === 'undefined')
    throw new Error('This browser cannot read the compressed data files.');
  const stream = new Response(buf).body.pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/* ---------------- formatting ---------------- */
const NF = new Intl.NumberFormat('en-IE');
function eur(v){
  if(v===null||v===undefined) return '—';
  const n = Math.round(v);
  return (n<0?'−':'') + '€' + NF.format(Math.abs(n));
}
function eurShort(v){
  if(v===null||v===undefined) return '—';
  const a = Math.abs(v), s = v<0?'−':'';
  if(a>=1e9) return s+'€'+(a/1e9).toFixed(a>=1e10?0:1)+'bn';
  if(a>=1e6) return s+'€'+(a/1e6).toFixed(a>=1e7?0:1)+'m';
  if(a>=1e3) return s+'€'+Math.round(a/1e3)+'k';
  return s+'€'+NF.format(Math.round(a));
}
function int(v){ return (v===null||v===undefined) ? '—' : NF.format(Math.round(v)); }
function esc(s){
  return String(s===null||s===undefined?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* Registered names arrive fully upper-cased; title-case for reading but
   keep known acronyms and small words sensible. */
const KEEP = new Set(['CLG','DAC','HSE','IRFU','GAA','FAI','RTE','RTÉ','UCD','UCC','NUI','DIT','TU','IT','CLÉ','CIE','ESB','VEC','ETB','HSA','NGO','UK','EU','USA','CHY','CRO','RCN','YMCA','YWCA','ICA','IFA','SVP','DSPCA','ISPCC','ISPCA','NCBI','MABS','FRC','CDP','SCP','LGBT','LGBTQ','AIDS','HIV','CBS','NS','GPO','OPW','RDS','AA','AIB','BOI','IDA','ICTU','SIPTU','IMPACT','INTO','TUI','ASTI','HEA','QQI','SOLAS','IPA','RIA','IHREC','NTMA','HIQA','PSI','RCSI','RCPI','TCD','DCU','MU','UL','ATU','MTU','SETU','DKIT','IADT','NCAD','NCI','GMIT','LYIT','CIT','WIT','AIT','LIT','IOT','VHI','BUPA','SSE','ESRI','CSO','NESC','NDA','NCCA','NEWB','TESS','CAMHS','CHO','LCDC','LEO','LDC','LAG','PPN','NYCI','NFTE','IWA','MS','CF','MND','ME','CFS','POMS','PRSI','PAYE','VAT','R&D','UNICEF','UNHCR','WHO','OECD','ILO','ICRC','MSF','GOAL','GORTA','TROCAIRE','TRÓCAIRE'].map(x=>x.toUpperCase()));
const LOWER = new Set(['of','the','and','for','in','to','a','an','at','by','on','or','as','with','de','le','la','na','agus','an','is']);
function titleise(s){
  if(!s) return '';
  if(!/[A-Z]/.test(s) || /[a-z]/.test(s)) return s;   // already mixed case
  return s.toLowerCase().split(/(\s+|[()\/,.\-])/).map((w,i)=>{
    if(!w.trim()) return w;
    const up = w.toUpperCase();
    if(KEEP.has(up)) return up;
    if(i>0 && LOWER.has(w)) return w;
    if(/^[ivxlc]+$/.test(w) && w.length>1) return up;         // roman numerals
    if(/^\d/.test(w)) return w;
    return w.charAt(0).toUpperCase()+w.slice(1);
  }).join('');
}

/* ---------------- accessors ---------------- */
const C = () => DB.core.cols;
const E = () => DB.ext && DB.ext.cols;
function orgName(k){ return titleise(C().name[k]); }
function rawName(k){ return C().name[k]; }
function extVal(key,k){
  const e = E(); if(!e) return '';
  const v = e[key] && e[key][k];
  return (v===undefined||v===null) ? '' : v;
}
function sectorOf(k){ const i=C().sec[k]; return i<0?null:DB.meta.sectors[i]; }
function subsectorOf(k){ const i=C().sub[k]; return i<0?null:DB.meta.subsectors[i]; }
function countyOf(k){ const i=C().cty[k]; return i<0?null:DB.meta.counties[i]; }
function gformOf(k){ const i=C().gf[k]; return i<0?null:DB.meta.govForms[i]; }

/* register bitmask */
const R_LEGACY=1, R_2022=2, R_2023=4, R_ACC=8, R_GOV=16, R_FUND=32;
const inReg = (k,bit) => (C().reg[k] & bit) !== 0;
const isCurrent = k => inReg(k,R_2023);
const isDissolved = k => !inReg(k,R_2023) && (C().reg[k] & (R_LEGACY|R_2022)) !== 0;
const noDirectory = k => (C().reg[k] & (R_LEGACY|R_2022|R_2023)) === 0;

/* Twelve sectors exceed what colour can carry as identity, and a
   sequential ramp encodes magnitude, not category. Sectors are named in
   text everywhere; colour is reserved for emphasis (what you selected). */

/* ---------------- financial index ---------------- */
function buildFinIndex(){
  const f = DB.fin.cols, n = DB.fin.n;
  const idx = new Map(); const ys = new Set();
  for(let r=0;r<n;r++){
    const k = f.oi[r];
    let a = idx.get(k); if(!a){ a=[]; idx.set(k,a); }
    a.push(r);
    ys.add(f.yr[r]);
  }
  // each organisation's years ascending
  for(const a of idx.values()) a.sort((x,y)=>f.yr[x]-f.yr[y]);
  DB.finByOrg = idx;
  DB.years = [...ys].sort((a,b)=>a-b);
}
/** Headline measure for one organisation in one year ('latest' allowed).
    `year` may arrive as a string from a <select>; financial years are
    numbers, so coerce before comparing. */
function finVal(k, measure, year){
  const rows = DB.finByOrg && DB.finByOrg.get(k);
  if(!rows) return null;
  const f = DB.fin.cols;
  if(year==='latest'){
    for(let i=rows.length-1;i>=0;i--){ const v=f[measure][rows[i]]; if(v!==null) return v; }
    return null;
  }
  const y = Number(year);
  for(const r of rows) if(f.yr[r]===y){ const v=f[measure][r]; if(v!==null) return v; }
  return null;
}
function finYears(k){
  const rows = DB.finByOrg && DB.finByOrg.get(k);
  return rows ? rows.map(r=>DB.fin.cols.yr[r]) : [];
}

/* ---------------- post-archive updates ----------------
   Years added from sources outside the Benefacts archive. They are merged
   into the financial table so they sort, filter and chart like any other
   year, but each carries a provenance marker so the source is never lost.
   An update never overwrites an archive year: where both hold a year, the
   archive stands and the update is dropped.                              */
const PROV_ARCHIVE = 0, PROV_UPDATE = 1;

function hasFinRow(k, year){
  const rows = DB.finByOrg && DB.finByOrg.get(k);
  if(!rows) return false;
  for(const r of rows) if(DB.fin.cols.yr[r] === year) return true;
  return false;
}

function applyUpdates(){
  if(!DB.updates || !DB.finReady || DB.updatesApplied) return;
  const f = DB.fin.cols;
  if(!f.prov) f.prov = new Array(DB.fin.n).fill(PROV_ARCHIVE);
  const FIELDS = ['inc','exp','na','fr','emp','pay','gov','ngov','ftot','vol','kmp','don','grants','cash'];
  let added = 0, skipped = 0;

  for(const id in DB.updates){
    if(id.charAt(0) === '_') continue;
    const k = DB.byId.get(id);
    if(k === undefined) continue;
    for(const y of (DB.updates[id].years || [])){
      if(hasFinRow(k, y.y)){ skipped++; continue; }
      f.oi.push(k); f.yr.push(y.y); f.src.push(-1); f.flags.push(0);
      f.prov.push(PROV_UPDATE);
      for(const fld of FIELDS) f[fld].push(y[fld] === undefined ? null : y[fld]);
      DB.fin.n++; added++;
    }
  }
  if(added){
    buildFinIndex();
    for(const id in DB.updates){
      if(id.charAt(0) === '_') continue;
      const k = DB.byId.get(id);
      if(k !== undefined) refreshLatest(k);
    }
  }
  DB.updatesApplied = true;
  DB.updateStats = {added, skipped};
}

/** Re-point an organisation's latest-year summary at its newest year. */
function refreshLatest(k){
  const rows = DB.finByOrg.get(k);
  if(!rows || !rows.length) return;
  const f = DB.fin.cols, last = rows[rows.length - 1];
  const c = C();
  c.ly[k] = f.yr[last];
  c.linc[k] = finVal(k,'inc','latest');
  c.lexp[k] = finVal(k,'exp','latest');
  c.lna[k]  = finVal(k,'na','latest');
  c.lfr[k]  = finVal(k,'fr','latest');
  c.lemp[k] = finVal(k,'emp','latest');
  c.lpay[k] = finVal(k,'pay','latest');
  c.lgov[k] = finVal(k,'gov','latest');
  c.nyr[k]  = rows.length;
  c.y1[k]   = f.yr[last];
  c.reg[k] |= R_ACC;
}

/** Provenance of one organisation-year, for labelling in the profile. */
function yearProvenance(k, year){
  const rows = DB.finByOrg && DB.finByOrg.get(k);
  if(!rows || !DB.fin.cols.prov) return null;
  for(const r of rows) if(DB.fin.cols.yr[r] === year) return DB.fin.cols.prov[r];
  return null;
}
function updateSourceFor(id){
  const u = DB.updates && DB.updates[id];
  if(!u) return null;
  return (DB.updates._sources || {})[u.src] || null;
}

/* lazily fetched per-organisation buckets */
async function loadDetail(id){
  const b = id.slice(-2).padStart(2,'0');
  if(!DB.detail.has(b)) DB.detail.set(b, grab('data/detail/'+b+'.json').catch(()=>({})));
  const d = await DB.detail.get(b);
  return d[id] || null;
}
async function loadGov(id){
  const b = id.slice(-2).padStart(2,'0');
  if(!DB.gov.has(b)) DB.gov.set(b, grab('data/gov/'+b+'.json').catch(()=>({})));
  const d = await DB.gov.get(b);
  return d[id] || null;
}

/* ---------------- boot ---------------- */
async function boot(){
  const bar = document.getElementById('bootbar'), msg = document.getElementById('bootmsg');
  const step = (p,t)=>{ bar.style.width=p+'%'; if(t) msg.textContent=t; };
  try{
    step(12,'Loading register…');
    const [meta,stats,core] = await Promise.all([
      grab('data/meta.json'), grab('data/stats.json'), grab('data/orgs-core.json')
    ]);
    DB.meta=meta; DB.stats=stats; DB.core=core;
    for(let k=0;k<core.n;k++) DB.byId.set(core.cols.id[k], k);
    step(74,'Preparing views…');
    DB.ready = true;

    document.getElementById('boot').style.opacity='0';
    setTimeout(()=>document.getElementById('boot').remove(),260);
    document.getElementById('app').hidden=false;
    initChrome(); route();

    // background: everything the first screen does not need
    grab('data/fin.json').then(async f=>{
      DB.fin=f; buildFinIndex(); DB.finReady=true;
      try{ DB.updates = await grab('data/updates.json'); applyUpdates(); }
      catch(e){ /* the register still works without the update layer */ }
      onDataArrived('fin');
    }).catch(e=>console.warn('fin',e));
    grab('data/orgs-ext.json').then(x=>{
      DB.ext=x; DB.extReady=true; onDataArrived('ext');
    }).catch(e=>console.warn('ext',e));
    grab('data/funding2020.json').then(x=>{
      DB.funding=x; onDataArrived('funding');
    }).catch(e=>console.warn('funding',e));
  }catch(err){
    document.getElementById('boot').innerHTML =
      '<div class="bx"><h3 style="margin-bottom:8px">Could not load the data</h3>'+
      '<p style="color:var(--ink2);font-size:13px">'+esc(err.message)+'</p></div>';
  }
}
</script>
