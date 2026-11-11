<script>
/* ================================================================
   Chart primitives — hand-rolled SVG.
   Thin marks, hairline grid, 2px surface gaps between fills,
   selective direct labels, hover tooltip on every plot, and a
   table twin for each chart (the relief rule: slot 3 sits below
   3:1 on the light surface, so values are always readable as text).
   ================================================================ */
'use strict';

let TIPN = 0;
function tipFor(host){
  let t = host.querySelector('.tip');
  if(!t){ t=document.createElement('div'); t.className='tip'; host.appendChild(t); }
  return t;
}
function showTip(host,t,x,y,html){
  t.innerHTML=html; t.style.opacity='1';
  const hw=host.clientWidth, tw=t.offsetWidth, th=t.offsetHeight;
  let L=x+13; if(L+tw>hw-4) L=x-tw-13; if(L<4) L=4;
  let T=y-th-11; if(T<2) T=y+15;
  t.style.left=L+'px'; t.style.top=T+'px';
}
const hideTip = t => { t.style.opacity='0'; };

function niceMax(v){
  if(v<=0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v/e;
  return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*e;
}
function axisTicks(max,n){
  const step = niceMax(max)/n, out=[];
  for(let i=0;i<=n;i++) out.push(step*i);
  return out;
}

/* ----------------------------------------------------------------
   Grouped vertical bars over a shared y-axis.
   series: [{key,label,colour,values:[]}]  cats: [labels]
   ---------------------------------------------------------------- */
function groupedBars(host, cats, series, opts){
  opts = opts||{};
  const fmt = opts.fmt || eurShort, fmtFull = opts.fmtFull || eur;
  const W = Math.max(host.clientWidth||680, 300);
  const padL = opts.padL||52, padR = 14, padT = 12, plotH = opts.plotH||186, axisH = 26;
  const H = padT+plotH+axisH;
  const innerW = W-padL-padR;

  let max = 0;
  for(const s of series) for(const v of s.values) if(v!=null) max = Math.max(max, Math.abs(v));
  const top = niceMax(max||1);
  const y = v => padT+plotH-(Math.abs(v||0)/top)*plotH;
  const ticks = axisTicks(top,4);

  const bandW = innerW/Math.max(cats.length,1);
  const GAP = 2;                                  // surface gap between fills
  const groupW = Math.min(bandW*0.68, 54);
  const barW = Math.max((groupW-(series.length-1)*GAP)/series.length, 3);

  let g = '';
  // grid + y ticks
  for(const t of ticks){
    const yy = y(t);
    g += `<line class="gridline" x1="${padL}" y1="${yy}" x2="${W-padR}" y2="${yy}"/>`;
    g += `<text class="tick" x="${padL-7}" y="${yy+3.5}" text-anchor="end">${esc(fmt(t))}</text>`;
  }
  g += `<line class="axisline" x1="${padL}" y1="${padT+plotH}" x2="${W-padR}" y2="${padT+plotH}"/>`;

  cats.forEach((c,ci)=>{
    const cx = padL+bandW*ci+bandW/2;
    const x0 = cx-groupW/2;
    series.forEach((s,si)=>{
      const v = s.values[ci];
      if(v==null) return;
      const bx = x0+si*(barW+GAP);
      const bh = Math.max(padT+plotH-y(v), 0);
      // 4px rounded data-end, anchored to the baseline
      const r = Math.min(4, barW/2, bh);
      const b = padT+plotH;
      g += `<path d="M${bx} ${b} L${bx} ${b-bh+r} Q${bx} ${b-bh} ${bx+r} ${b-bh} L${bx+barW-r} ${b-bh} Q${bx+barW} ${b-bh} ${bx+barW} ${b-bh+r} L${bx+barW} ${b} Z" fill="${s.colour}"/>`;
    });
    g += `<text class="tick" x="${cx}" y="${padT+plotH+16}" text-anchor="middle">${esc(c)}</text>`;
    // hover band
    g += `<rect class="hitarea" x="${padL+bandW*ci}" y="${padT}" width="${bandW}" height="${plotH}" data-ci="${ci}"/>`;
  });

  // direct-label the final category of each series (selective, not every point)
  if(opts.labelLast !== false && cats.length){
    const ci = cats.length-1, cx = padL+bandW*ci+bandW/2;
    series.forEach((s,si)=>{
      const v = s.values[ci]; if(v==null) return;
      const bx = v!=null ? (cx-groupW/2)+si*(barW+GAP)+barW/2 : cx;
      g += `<text class="dlabel" x="${bx}" y="${y(v)-6}" text-anchor="middle">${esc(fmt(v))}</text>`;
    });
  }

  host.innerHTML =
    (series.length>1 ? `<div class="legend">`+series.map(s=>
      `<span><i style="background:${s.colour}"></i>${esc(s.label)}</span>`).join('')+`</div>` : '')+
    `<div class="chart"><svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(opts.aria||'Chart')}">${g}</svg></div>`;

  const chart = host.querySelector('.chart');
  const tip = tipFor(chart);
  chart.querySelectorAll('.hitarea').forEach(h=>{
    h.addEventListener('mouseenter',ev=>{
      const ci = +h.dataset.ci;
      const rows = series.map(s=>s.values[ci]==null?'':
        `<div class="tr"><span>${esc(s.label)}</span><b>${esc(fmtFull(s.values[ci]))}</b></div>`).join('');
      const r = chart.getBoundingClientRect(), hb = h.getBoundingClientRect();
      showTip(chart,tip,hb.left-r.left+hb.width/2,hb.top-r.top+20,
        `<div class="ty">${esc(cats[ci])}</div>${rows||'<div class="tr mut">No data</div>'}`);
    });
    h.addEventListener('mouseleave',()=>hideTip(tip));
  });
}

/* ----------------------------------------------------------------
   Multi-series line with crosshair.
   ---------------------------------------------------------------- */
function lineChart(host, cats, series, opts){
  opts = opts||{};
  const fmt = opts.fmt||eurShort, fmtFull = opts.fmtFull||eur;
  const W = Math.max(host.clientWidth||680, 300);
  const padL = opts.padL||54, padR = 18, padT = 12, plotH = opts.plotH||196, axisH = 26;
  const H = padT+plotH+axisH, innerW = W-padL-padR;

  let max=0, min=0;
  for(const s of series) for(const v of s.values) if(v!=null){ max=Math.max(max,v); min=Math.min(min,v); }
  const top = niceMax(max||1);
  const y = v => padT+plotH-((v||0)/top)*plotH;
  const x = i => cats.length<2 ? padL+innerW/2 : padL+(innerW*i)/(cats.length-1);
  const ticks = axisTicks(top,4);

  let g='';
  for(const t of ticks){
    const yy=y(t);
    g += `<line class="gridline" x1="${padL}" y1="${yy}" x2="${W-padR}" y2="${yy}"/>`;
    g += `<text class="tick" x="${padL-7}" y="${yy+3.5}" text-anchor="end">${esc(fmt(t))}</text>`;
  }
  g += `<line class="axisline" x1="${padL}" y1="${padT+plotH}" x2="${W-padR}" y2="${padT+plotH}"/>`;
  cats.forEach((c,i)=> g += `<text class="tick" x="${x(i)}" y="${padT+plotH+16}" text-anchor="middle">${esc(c)}</text>`);

  for(const s of series){
    // break the path across gaps rather than bridging missing years
    let d='', open=false;
    s.values.forEach((v,i)=>{
      if(v==null){ open=false; return; }
      d += (open?' L':' M')+x(i)+' '+y(v); open=true;
    });
    g += `<path d="${d.trim()}" fill="none" stroke="${s.colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v,i)=>{
      if(v==null) return;
      // 2px surface ring keeps overlapping markers legible
      g += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.colour}" stroke="var(--surface)" stroke-width="2"/>`;
    });
    // direct-label the last point
    for(let i=s.values.length-1;i>=0;i--){
      if(s.values[i]!=null){
        g += `<text class="dlabel" x="${x(i)+8}" y="${y(s.values[i])+3.5}" fill="${s.colour}">${esc(fmt(s.values[i]))}</text>`;
        break;
      }
    }
  }
  cats.forEach((c,i)=>{
    const bw = cats.length<2?innerW:innerW/(cats.length-1);
    g += `<rect class="hitarea" x="${x(i)-bw/2}" y="${padT}" width="${bw}" height="${plotH}" data-i="${i}"/>`;
  });
  g += `<line class="crosshair" id="chx" x1="0" y1="${padT}" x2="0" y2="${padT+plotH}" style="opacity:0"/>`;

  host.innerHTML =
    (series.length>1 ? `<div class="legend">`+series.map(s=>
      `<span><i style="background:${s.colour}"></i>${esc(s.label)}</span>`).join('')+`</div>` : '')+
    `<div class="chart"><svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(opts.aria||'Chart')}">${g}</svg></div>`;

  const chart = host.querySelector('.chart'), tip = tipFor(chart);
  const cross = chart.querySelector('#chx');
  chart.querySelectorAll('.hitarea').forEach(h=>{
    h.addEventListener('mouseenter',()=>{
      const i = +h.dataset.i;
      cross.setAttribute('x1',x(i)); cross.setAttribute('x2',x(i)); cross.style.opacity='1';
      const rows = series.map(s=>s.values[i]==null?'':
        `<div class="tr"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.colour};margin-right:5px"></i>${esc(s.label)}</span><b>${esc(fmtFull(s.values[i]))}</b></div>`).join('');
      const r = chart.getBoundingClientRect(), hb = h.getBoundingClientRect();
      showTip(chart,tip,hb.left-r.left+hb.width/2,padT+26,
        `<div class="ty">${esc(cats[i])}</div>${rows||'<div class="tr mut">No data</div>'}`);
    });
    h.addEventListener('mouseleave',()=>{ hideTip(tip); cross.style.opacity='0'; });
  });
}

/* ----------------------------------------------------------------
   Ranked horizontal bars, as HTML (crisp text, no label clipping).
   rows: [{label,value,extra,onClick}]
   ---------------------------------------------------------------- */
function rankedBars(host, rows, opts){
  opts = opts||{};
  const fmt = opts.fmt||eurShort;
  const max = rows.reduce((m,r)=>Math.max(m, r.value||0), 0) || 1;
  host.innerHTML = '<div class="bars">'+rows.map((r,i)=>
    `<div class="barrow${r.onClick?' clickable':''}" data-i="${i}" title="${esc(r.label)} — ${esc(fmt(r.value))}">
       <span class="bn">${esc(r.label)}</span>
       <span class="btrack"><span class="bfill" style="width:${Math.max((r.value/max)*100,0.6).toFixed(2)}%;background:${r.colour||opts.colour||'var(--s1)'}"></span></span>
       <span class="bv">${esc(fmt(r.value))}</span>
     </div>`).join('')+'</div>';
  if(rows.some(r=>r.onClick)){
    host.querySelectorAll('.barrow').forEach(el=>{
      const r = rows[+el.dataset.i];
      if(r.onClick) el.addEventListener('click',r.onClick);
    });
  }
}

/* Small inline sparkline for a row of values. */
function sparkline(values, w, h, colour){
  const v = values.filter(x=>x!=null);
  if(v.length<2) return '';
  const max = Math.max(...v.map(Math.abs))||1;
  const n = values.length;
  let d='', open=false;
  values.forEach((x,i)=>{
    if(x==null){ open=false; return; }
    const px = (w*i)/(n-1), py = h-(Math.abs(x)/max)*(h-2)-1;
    d += (open?' L':' M')+px.toFixed(1)+' '+py.toFixed(1); open=true;
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="vertical-align:middle">
    <path d="${d.trim()}" fill="none" stroke="${colour||'var(--s1)'}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
</script>
