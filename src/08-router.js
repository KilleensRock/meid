<script>
/* ================================================================
   Chrome and routing. Only plain #name hashes are used, plus
   #org-<id> for a profile.
   ================================================================ */
'use strict';

const VIEWS = [
  {id:'explore',  label:'Register'},
  {id:'analyse',  label:'Analyse'},
  {id:'funding',  label:'State funding'},
  {id:'coverage', label:'Coverage'},
  {id:'about',    label:'About'},
];

const SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
const MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/></svg>';

function initChrome(){
  const nav = document.getElementById('nav');
  nav.innerHTML = VIEWS.map(v=>`<button data-v="${v.id}">${esc(v.label)}</button>`).join('');
  nav.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click',()=>{ location.hash = b.dataset.v; });
  });

  const tb = document.getElementById('themebtn');
  const stored = (()=>{ try{ return localStorage.getItem('b2theme'); }catch(e){ return null; } })();
  if(stored) document.documentElement.dataset.theme = stored;
  const paint = () => {
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
    tb.innerHTML = dark ? SUN : MOON;
  };
  paint();
  tb.addEventListener('click',()=>{
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try{ localStorage.setItem('b2theme', document.documentElement.dataset.theme); }catch(e){}
    paint();
    RESIZERS.forEach(f=>{ try{f();}catch(e){} });   // charts re-read their tokens
  });

  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', ev=>{
    if(ev.key==='/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){
      const q = document.getElementById('q');
      if(q){ ev.preventDefault(); q.focus(); q.select(); }
      else { location.hash='explore'; setTimeout(()=>{ const f=document.getElementById('q'); if(f) f.focus(); },60); }
    }
    if(ev.key==='Escape'){ const q=document.getElementById('q'); if(q && document.activeElement===q){ q.blur(); } }
  });
}

function route(){
  if(!DB.ready) return;
  const h = (location.hash||'').replace(/^#/,'') || 'explore';
  clearResize();
  if(h.startsWith('org-')){
    setNav(null);
    viewOrg(h.slice(4));
    window.scrollTo(0,0);
    return;
  }
  const view = VIEWS.find(v=>v.id===h) ? h : 'explore';
  setNav(view);
  ({explore:viewExplore, analyse:viewAnalyse, funding:viewFunding,
    coverage:viewCoverage, about:viewAbout})[view]();
  window.scrollTo(0,0);
}
function setNav(active){
  document.querySelectorAll('#nav button').forEach(b=>{
    if(b.dataset.v===active) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
}

/* When a background file lands, refresh whatever is on screen so the
   new columns appear without the user doing anything. */
function onDataArrived(what){
  const h = (location.hash||'').replace(/^#/,'') || 'explore';
  if(h.startsWith('org-')){
    if(what==='ext' || what==='fin' || what==='funding') viewOrg(h.slice(4));
    return;
  }
  if(h==='explore' || h==='' ){ if(document.getElementById('scroller')) refreshExplore(); return; }
  if(h==='analyse' && what==='fin') viewAnalyse();
  if(h==='funding' && what==='funding') viewFunding();
  if(h==='coverage' && what==='fin') viewCoverage();
}

boot();
</script>
</body>
</html>
