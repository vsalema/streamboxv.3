/* === NowBar: safe update (only if missing) === */
if (typeof window.updateNowBar !== 'function') {
  window.updateNowBar = function updateNowBar(title, url){
    const bar = document.getElementById('nowBar');
    if (!bar) return;
    let titleEl = document.getElementById('nowTitle');
    if (!titleEl){
      titleEl = document.createElement('span');
      titleEl.id = 'nowTitle';
      const actionsRef = bar.querySelector('.nowbar-actions');
      actionsRef ? bar.insertBefore(titleEl, actionsRef) : bar.appendChild(titleEl);
    }
    titleEl.textContent = title || (url || '—');
    const openBtn = document.getElementById('openBtn');
    if (openBtn){ if (url){ openBtn.href = url; openBtn.style.display=''; } else { openBtn.removeAttribute('href'); } }
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn){
      copyBtn.onclick = async (e)=>{
        e.stopPropagation();
        try { await navigator.clipboard.writeText(url || ''); if (typeof toast==='function') toast('URL copiée'); } catch(_){}
      };
    }
    const fsBtn = document.getElementById('fsBtn');
    if (fsBtn){
      fsBtn.onclick = async (e)=>{
        e.stopPropagation();
        const el = document.getElementById('playerSection') || document.documentElement;
        try{ if (!document.fullscreenElement) await el.requestFullscreen(); else await document.exitFullscreen(); }catch(_){}
      };
    }
    try { window.currentUrl = url || ''; } catch(_){}
    try { document.dispatchEvent(new CustomEvent('nowbar:updated', { detail:{ title, url } })); } catch(_){}
  };
}

/* ===== Zapper v1 — stable, no overrides ===== */
const Zapper = (() => {
  let list = [];
  let idx = -1;
  function rebuild(){
    const items = Array.from(document.querySelectorAll('#list .item'));
    list = items.map(el => {
      const url = (el.dataset && el.dataset.url) ? el.dataset.url : '';
      const name = (el.dataset && el.dataset.name) ? el.dataset.name :
                   ((el.querySelector('.name') && el.querySelector('.name').textContent.trim()) || url);
      return url ? { url, name } : null;
    }).filter(Boolean);
    if (idx < 0 && list.length) idx = 0;
  }
  function mark(url){
    if (!list.length) rebuild();
    const i = list.findIndex(x => x.url === url);
    idx = (i >= 0 ? i : (list.length ? 0 : -1));
  }
  function playAt(i){
    if (!list.length) rebuild();
    const n = list.length; if (!n) return;
    if (i < 0) i = n - 1;
    if (i >= n) i = 0;
    idx = i;
    const ch = list[idx];
    if (!ch) return;
    const ps = document.getElementById('playerSection');
    const noSource = document.getElementById('noSource');
    try { resetPlayers(); } catch(_){}
    if (noSource) noSource.style.display = 'none';
    if (ps) ps.classList.add('playing');
    playByType(ch.url);
    try { updateNowBar(ch.name || ch.url, ch.url); } catch(_){}
    try { if (typeof addHistory === 'function') addHistory(ch.url); } catch(_){}
    try {
      const v = document.getElementById('videoPlayer');
      if (v && v.style.display === 'block') {
        v.muted = true;
        const p = v.play();
        if (p && p.catch) p.catch(()=>{});
      }
    } catch(_){}
  }
  function playNext(){ if (!list.length) rebuild(); if (!list.length) return; playAt(idx + 1); }
  function playPrev(){ if (!list.length) rebuild(); if (!list.length) return; playAt(idx - 1); }
  function ensureButtons(){
    const actions = document.querySelector('#nowBar .nowbar-actions');
    if (!actions) return;
    const copyBtn = document.getElementById('copyBtn');
    const anchor  = (copyBtn && actions.contains(copyBtn)) ? copyBtn : actions.firstChild;
    let prev = document.getElementById('prevBtn');
    if (!prev){ prev = document.createElement('button'); prev.id='prevBtn'; prev.className='navBtn'; prev.title='Chaîne précédente'; prev.textContent='⟨'; }
    let next = document.getElementById('nextBtn');
    if (!next){ next = document.createElement('button'); next.id='nextBtn'; next.className='navBtn'; next.title='Chaîne suivante'; next.textContent='⟩'; }
    actions.insertBefore(prev, anchor || null);
    actions.insertBefore(next, anchor || null);
    if (!prev.__wired){ prev.__wired = true; prev.addEventListener('click', (e)=>{ e.stopPropagation(); playPrev(); }); }
    if (!next.__wired){ next.__wired = true; next.addEventListener('click', (e)=>{ e.stopPropagation(); playNext(); }); }
  }
  document.addEventListener('list:rendered', () => { rebuild(); });
  document.addEventListener('nowbar:updated', () => { ensureButtons(); });
  function kick(){ rebuild(); ensureButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick); else kick();
  setTimeout(kick, 200); setTimeout(kick, 800);
  return { rebuild, mark, playAt, playNext, playPrev };
})();

/* === Zapper hook: delegate click on #list to track current index === */
(function(){
  function install(){
    const listEl = document.getElementById('list');
    if (!listEl || listEl.__zapperHooked) return;
    listEl.__zapperHooked = true;
    listEl.addEventListener('click', function(e){
      const it = e.target && e.target.closest ? e.target.closest('.item') : null;
      if (!it || !listEl.contains(it)) return;
      const url = it.dataset ? (it.dataset.url || '') : '';
      if (!url) return;
      try { if (window.Zapper && Zapper.mark) Zapper.mark(url); } catch(_){}
    }, { capture:true, passive:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 200);
})();

/* === Helper: signal list rendered — call this at the END of your renderList() === */
/* example: try { document.dispatchEvent(new Event('list:rendered')); } catch {} */