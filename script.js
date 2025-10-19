// ============= IPTV Player – RESCUE SCRIPT (baseline propre) =============
// Ce fichier remplace intégralement script.js pour déblocage rapide.
// Fonctions: coller URL, importer M3U, lister chaînes (logos, groupes), jouer HLS/MP4/MP3/MPD/YouTube.
// ========================================================================
// état par défaut : son actif


// --- Sécurité & logs ---
window.addEventListener('error', e => console.error('[IPTV:error]', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', e => console.error('[IPTV:promise]', e.reason));

// --- Elements ---
const input = document.getElementById('urlInput');
const loadBtn = document.getElementById('loadBtn');
const fileInput = document.getElementById('fileInput');
const themeBtn = document.getElementById('themeToggle');
const listDiv = document.getElementById('list');
const video = document.getElementById('videoPlayer');
const audio = document.getElementById('audioPlayer');
const iframe = document.getElementById('ytPlayer');
const noSource = document.getElementById('noSource');
const playerSection = document.getElementById('playerSection');
const searchInput = document.getElementById('searchInput');
const catBar = document.getElementById('catBar');

const tabs = {
  channels: document.getElementById('tab-channels'),
  favorites: document.getElementById('tab-favorites'),
  history: document.getElementById('tab-history'),
  playlists: document.getElementById('tab-playlists'),
};

const nowTitle = document.getElementById('nowTitle');
const copyBtn  = document.getElementById('copyBtn');
const openBtn  = document.getElementById('openBtn');

// --- Storage helpers ---
const LS = { fav:'iptv.favorites', hist:'iptv.history', last:'iptv.lastUrl', theme:'theme', playlists:'iptv.playlists' };
const loadLS = (k, d) => { try { const v = localStorage.getItem(k); return v?JSON.parse(v):d; } catch { return d; } };
const saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// --- State ---
let channels = [];              // {name,url,group,logo}
let favorites = loadLS(LS.fav, []);
let historyList = loadLS(LS.hist, []);
let categories = ['ALL'];
let categoryFilter = 'ALL';
let channelFilter = '';
let mode = 'channels';
let defaultPlaylists = [];      // chargé à la demande
let userPlaylists = loadLS(LS.playlists, []);

// --- Utils ---
function escapeHtml(s){
  const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  return (s ?? '').toString().replace(/[&<>"']/g, m => map[m]);
}
function classify(url){
  const u = (url||'').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.endsWith('.m3u') || u.includes('.m3u8')) return 'hls';
  if (u.endsWith('.mp4')) return 'mp4';
  if (u.endsWith('.mp3')) return 'mp3';
  if (u.endsWith('.mpd')) return 'dash';
  return 'unknown';
}
const extractYT = (url) => { const m = url.match(/[?&]v=([^&]+)/); return m?m[1]:url.split('/').pop(); };
const PLACEHOLDER_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="10" fill="#111"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="34">📺</text></svg>`);

// --- UI helpers ---
function setPlaying(on){
  try {
    playerSection && playerSection.classList.toggle('playing', !!on);
    if (noSource) noSource.style.display = on ? 'none' : 'flex';
  } catch {}
}
function resetPlayers(){
  const ps = document.getElementById('playerSection');
  const v  = document.getElementById('videoPlayer');
  const yt = document.getElementById('ytPlayer');
  const au = document.getElementById('audioPlayer');

  try { if (window.currentHls) { window.currentHls.destroy(); window.currentHls = null; } } catch(e){}
  try { if (window.currentDash){ window.currentDash.reset();  window.currentDash = null; } } catch(e){}

  [v, yt, au].forEach(el => {
    if (!el) return;
    try { if (el.tagName === 'VIDEO') el.pause(); } catch(_){}
    try { if (el.tagName === 'IFRAME') el.src = ''; else el.removeAttribute('src'); } catch(_){}
    el.style.display = 'none';
  });

  if (ps) ps.classList.remove('playing');
}

function updateNowBar(nameOrUrl, url){
  nowTitle && (nowTitle.textContent = nameOrUrl || url || 'Flux');
  if (openBtn) openBtn.href = url || '#';
  if (copyBtn) copyBtn.onclick = async () => { try { await navigator.clipboard.writeText(url); } catch {} };
}

// --- Players ---
function playHls(url){
  video.style.display = 'block';
  setPlaying(true);
  try {
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls();
      hls.on(window.Hls.Events.ERROR, (evt, data) => {
        console.warn('[HLS.js error]', data);
        if (data?.fatal) { hls.destroy(); video.src = url; }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url; // Safari iOS lit HLS nativement
    }
  } catch (e) {
    console.error('[playHls]', e);
    video.src = url;
  }
  updateNowBar(undefined, url);
}
function playDash(url){
  video.style.display = 'block';
  setPlaying(true);
  const DASH = window.dashjs?.MediaPlayer;
  if (DASH && typeof DASH.create === 'function') {
    const p = DASH.create();
    p.initialize(video, url, true);
  } else {
    video.src = url; // fallback
  }
  updateNowBar(undefined, url);
}
function playVideo(url){
  video.style.display = 'block';
  setPlaying(true);
  video.src = url;
  updateNowBar(undefined, url);
}
function playAudio(url){
  audio.style.display = 'block';
  setPlaying(true);
  audio.src = url;
  updateNowBar(undefined, url);
}
function playYouTube(url){
  iframe.style.display = 'block';
  setPlaying(true);
  iframe.src = `https://www.youtube.com/embed/${extractYT(url)}?autoplay=1`;
  updateNowBar(undefined, url);
}
function playByType(url){
  const v  = document.getElementById('videoPlayer');
  const yt = document.getElementById('ytPlayer');
  const au = document.getElementById('audioPlayer');
  const ps = document.getElementById('playerSection');

  const u = (url||'').trim();
  const isYouTube = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(u);
  const isMP3 = /\.mp3($|\?)/i.test(u);
  const isMP4 = /\.mp4($|\?)/i.test(u);
  const isHLS = /\.m3u8($|\?)/i.test(u);
  const isDASH= /\.mpd($|\?)/i.test(u);

  function showPlaying(){ if (ps) ps.classList.add('playing'); }

  // YouTube (iframe)
  if (isYouTube && yt){
    yt.src = u.replace('watch?v=','embed/').replace('&t=','?start=');
    yt.allow = 'autoplay; encrypted-media; picture-in-picture';
    yt.style.display = 'block';
    showPlaying(); return;
  }

  // Audio MP3
  if (isMP3 && au){
    au.src = u;
    au.style.display = 'block';
    try { au.play().catch(()=>{}); } catch(_){}
    showPlaying(); return;
  }

  // MP4 direct
  if (isMP4 && v){
    v.src = u;
    v.style.display = 'block';
    try { v.muted = false; v.play().catch(()=>{}); } catch(_){}
    showPlaying(); return;
  }

  // HLS (m3u8)
  if (isHLS && v){
    v.style.display = 'block';
    if (window.Hls && window.Hls.isSupported()){
      try {
        const hls = new Hls({ enableWorker: true });
        window.currentHls = hls;
        hls.attachMedia(v);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(u));
      } catch(_){}
    } else {
      v.src = u; // Safari natif
    }
    try { v.muted = false; v.play().catch(()=>{}); } catch(_){}
    showPlaying(); return;
  }

  // DASH (mpd)
  if (isDASH && v && window.dashjs){
    v.style.display = 'block';
    try {
      const p = dashjs.MediaPlayer().create();
      window.currentDash = p;
      p.initialize(v, u, true);
    } catch(_){}
    showPlaying(); return;
  }

  // fallback → tente dans la <video>
  if (v){
    v.src = u;
    v.style.display = 'block';
    try { v.muted = false; v.play().catch(()=>{}); } catch(_){}
    showPlaying();
  }
}


// --- M3U ---
function parseM3U(text){
  text = String(text||'').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).map(l => l.trim());
  let name='', group='Autres', logo='';
  channels = []; categories = ['ALL'];

  for (let i=0; i<lines.length; i++){
    const l = lines[i];
    if (!l) continue;
    if (l.startsWith('#EXTINF')){
      const nm = l.match(/,(.*)$/); name = nm ? nm[1].trim() : 'Chaîne';
      const gm = l.match(/group-title="([^"]+)"/i); group = gm?gm[1]:'Autres';
      const lg = l.match(/tvg-logo="([^"]+)"/i) || l.match(/logo="([^"]+)"/i); logo = lg?lg[1]:'';
      if (!categories.includes(group)) categories.push(group);
    } else if (/^https?:\/\//i.test(l)){
      channels.push({ name, url:l, group, logo: logo || PLACEHOLDER_LOGO });
    }
  }
  categoryFilter = 'ALL';
  switchTab('channels');
}

// --- Rendu ---
function renderCategories(){
  if (!catBar) return;
  if (categories.length <= 1) { catBar.innerHTML = ''; return; }
  catBar.innerHTML = categories.map(c => `<button class="cat ${c===categoryFilter?'active':''}" data-cat="${c}">${escapeHtml(c)}</button>`).join('');
  catBar.querySelectorAll('button').forEach(btn=>{
    btn.onclick = () => { categoryFilter = btn.dataset.cat; renderList(); };
  });
}
function renderLogo(logo){
  if (!logo) return `<span class="ph">📺</span>`;
  const safe = (logo.startsWith('http') || logo.startsWith('data:')) ? logo : PLACEHOLDER_LOGO;
  return `<img src="${safe}" alt="logo" onerror="this.src='${PLACEHOLDER_LOGO}'">`;
}
function isFav(url){ return favorites.some(f => f.url === url); }
function toggleFavorite(it){
  if (isFav(it.url)) favorites = favorites.filter(f => f.url !== it.url);
  else favorites.unshift({ name: it.name || it.url, url: it.url, logo: it.logo || '' });
  saveLS(LS.fav, favorites);
}
function addHistory(url){
  historyList = [url, ...historyList.filter(u=>u!==url)].slice(0,30);
  saveLS(LS.hist, historyList);
}
function renderPlaylists(){
  listDiv.innerHTML = '';
  const wrap = document.createElement('div'); wrap.style.padding = '8px';

  const bar = document.createElement('div'); bar.style.display='flex'; bar.style.gap='8px'; bar.style.margin='6px';
  bar.innerHTML = `<button id="plReload">Charger playlists.json</button>`;
  wrap.appendChild(bar);
  bar.querySelector('#plReload').onclick = () => ensureDefaultPlaylistsLoaded(true);

  const h1 = document.createElement('h3'); h1.textContent='Listes par défaut'; h1.style.margin='6px 0'; h1.style.opacity='.8';
  wrap.appendChild(h1);

  const def = document.createElement('div');
  (defaultPlaylists.length ? defaultPlaylists : [{name:'(aucune – clique “Charger playlists.json”)', url:''}]).forEach(p=>{
    const it = document.createElement('div'); it.className='item';
    it.innerHTML = `<div class="left"><span class="logo-sm"><span class="ph">📚</span></span><div class="meta"><div class="name">${escapeHtml(p.name||p.url)}</div></div></div>`;
    if (p.url) {
      it.onclick = async () => {
        try{
          const res = await fetch(p.url);
          if (!res.ok) throw new Error('HTTP '+res.status);
          const txt = await res.text();
          parseM3U(txt);
        }catch(e){ console.error('[playlist]', e); }
      };
    }
    def.appendChild(it);
  });
  wrap.appendChild(def);

  const h2 = document.createElement('h3'); h2.textContent='Mes listes'; h2.style.margin='10px 0 6px'; h2.style.opacity='.8';
  wrap.appendChild(h2);

  const mine = document.createElement('div');
  userPlaylists.forEach((p, idx)=>{
    const it = document.createElement('div'); it.className='item';
    it.innerHTML = `
      <div class="left">
        <span class="logo-sm"><span class="ph">🗂️</span></span>
        <div class="meta"><div class="name">${escapeHtml(p.name||p.url)}</div></div>
      </div>
      <div><button class="btn-small" data-idx="${idx}" data-act="del">🗑️</button></div>`;
    it.onclick = async (e) => {
      if (e.target.dataset.act === 'del') return;
      try{
        const res = await fetch(p.url);
        if (!res.ok) throw new Error('HTTP '+res.status);
        const txt = await res.text();
        parseM3U(txt);
      }catch(e){ console.error('[playlist:mine]', e); }
    };
    it.querySelector('[data-act="del"]').onclick = (e)=>{
      e.stopPropagation();
      userPlaylists.splice(idx,1);
      saveLS(LS.playlists, userPlaylists);
      renderPlaylists();
    };
    mine.appendChild(it);
  });
  wrap.appendChild(mine);

  const form = document.createElement('div'); form.style.marginTop='10px';
  form.innerHTML = `
    <input id="plName" placeholder="Nom de la liste" style="margin-bottom:6px;">
    <input id="plUrl" placeholder="URL de la liste M3U">
    <button id="plAdd">Ajouter</button>`;
  wrap.appendChild(form);
  form.querySelector('#plAdd').onclick = () => {
    const name = form.querySelector('#plName').value.trim();
    const url  = form.querySelector('#plUrl').value.trim();
    if (!url) return;
    userPlaylists.unshift({ name: name || url, url });
    saveLS(LS.playlists, userPlaylists);
    renderPlaylists();
  };

  listDiv.appendChild(wrap);
}
function renderList(){
  // reset UI
  listDiv.innerHTML = '';
  if (mode === 'channels') { 
    renderCategories(); 
  } else { 
    catBar.innerHTML = ''; 
  }

  // --- Barre outils de l'historique ---
  if (mode === 'history') {
    const bar = document.createElement('div');
    bar.className = 'history-toolbar';
    bar.innerHTML = `
      <button id="btnClearHistory" class="btn-danger" title="Effacer tout l'historique">🧹 Effacer l'historique</button>
    `;
    bar.querySelector('#btnClearHistory').onclick = () => {
      if (confirm('Effacer tout l’historique ?')) clearHistory();
    };
    listDiv.appendChild(bar);
  }

  // --- Source de données ---
  let data = [];
  if (mode === 'channels')  data = channels;
  if (mode === 'favorites') data = favorites;
  if (mode === 'history')   data = historyList.map(u => ({ url: u, name: u }));
  if (mode === 'playlists') { renderPlaylists(); return; }

  if (mode === 'channels' && categoryFilter !== 'ALL') {
    data = data.filter(x => x.group === categoryFilter);
  }
  if (channelFilter) {
    data = data.filter(x => (x.name || x.url).toLowerCase().includes(channelFilter.toLowerCase()));
  }

  // --- Rendu des items ---
  data.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item';
    const title = item.name || item.url;
    const group = item.group || '';
    const logo  = item.logo || '';

    div.setAttribute('data-url', item.url || '');
    div.innerHTML = `
      <div class="left">
        <span class="logo-sm">${renderLogo(logo)}</span>
        <div class="meta">
          <div class="name">${escapeHtml(title)}</div>
          ${ group ? `<div class="sub" style="font-size:.8em;opacity:.7">${escapeHtml(group)}</div>` : '' }
        </div>
      </div>
      <span class="star">${isFav(item.url) ? '★' : '☆'}</span>
    `;

    // ---- CLICK: comportement identique à "Favoris"
    div.onclick = () => {
      const ps = document.getElementById('playerSection');
      const noSource = document.getElementById('noSource');
      try { resetPlayers(); } catch(_){}
      if (noSource) noSource.style.display = 'none';
      if (ps) ps.classList.add('playing');

      playByType(item.url);
      try { updateNowBar(title, item.url); } catch(_){}
      try { if (typeof addHistory === 'function') addHistory(item.url); } catch(_){}

      // Nudge autoplay si <video> est active
      try {
        const v = document.getElementById('videoPlayer');
        if (v && v.style.display === 'block') {
          v.muted = false;
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        }
      } catch(_){}
    };

    // ---- Favoris (sans déclencher la lecture)
    const star = div.querySelector('.star');
    if (star) {
      star.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(item);
        renderList();
      };
    }

    listDiv.appendChild(div);
  });

  // Ping des liens visibles (optionnel)
  try {
    if (typeof pingVisibleList === 'function' && (mode === 'channels' || mode === 'history')) {
      pingVisibleList(6);
    }
  } catch(_){}

  if (!data.length) {
    listDiv.innerHTML += '<p style="opacity:.6;padding:10px;">Aucune donnée.</p>';
  }
}
try { document.dispatchEvent(new Event('list:rendered')); } catch {}


// --- Tabs ---
function switchTab(t){
  mode = t;
  Object.values(tabs).forEach(b => b && b.classList.remove('active'));
  tabs[t] && tabs[t].classList.add('active');
  renderList();
  if (t==='playlists') ensureDefaultPlaylistsLoaded();
}
tabs.channels && (tabs.channels.onclick = ()=>switchTab('channels'));
tabs.favorites && (tabs.favorites.onclick = ()=>switchTab('favorites'));
tabs.history && (tabs.history.onclick   = ()=>switchTab('history'));
tabs.playlists && (tabs.playlists.onclick=()=>switchTab('playlists'));

// --- Controls ---
loadBtn && (loadBtn.onclick = ()=>{
  const v = (input.value||'').trim();
  if (!v) return;
  resetPlayers();
  if (noSource) noSource.style.display = 'none';
  playByType(v);
  updateNowBar(v, v);
  addHistory(v);
});
fileInput && (fileInput.onchange = async (e)=>{
  const f = e.target.files?.[0]; if (!f) return;
  const txt = await f.text();
  parseM3U(txt);
});
searchInput && (searchInput.oninput = (e) => {
  channelFilter = e.target.value || '';
  renderList();
});

// --- Playlists par défaut (à la demande) ---
async function ensureDefaultPlaylistsLoaded(force){
  if (defaultPlaylists.length && !force) return;
  try{
    const res = await fetch('playlists.json', { cache:'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    defaultPlaylists = (data.playlists||[]).filter(x => x.url);
  }catch(e){
    console.warn('[playlists.json]', e);
    defaultPlaylists = [];
  }finally{
    if (mode==='playlists') renderPlaylists();
  }
}

// --- Init ---
(function init(){
  // thème
  const t = loadLS(LS.theme, 'dark');
  if (t==='light') document.body.classList.add('light');

  // dernière URL (pas d’autoplay, juste remplir le champ)
  const last = loadLS(LS.last, '');
  if (last && input) input.value = last;

  // rendu initial (aucun fetch ici)
  renderList();

  // fermer le splash quoi qu'il arrive (2s)
  const splash = document.getElementById('splash');
  setTimeout(()=>{ if (splash){ splash.classList.add('hidden'); setTimeout(()=>splash.remove(),600);} }, 2000);

  console.log('[IPTV] RESCUE script chargé');
})();
// --- Ajuste la hauteur disponible pour le player (Chaînes & co.)
function updatePlayerLayout() {
  try {
    const root = document.documentElement;
    const header = document.querySelector('header');
    const headerH = header ? header.offsetHeight : 0;
    root.style.setProperty('--header-h', headerH + 'px');
  } catch (e) { console.warn('[layout]', e); }
}

// Appels initiaux + écoute redimensionnement/orientation
window.addEventListener('resize', updatePlayerLayout);
window.addEventListener('orientationchange', updatePlayerLayout);
document.addEventListener('DOMContentLoaded', updatePlayerLayout);
// petit tick pour after-paint (polices chargées etc.)
setTimeout(updatePlayerLayout, 50);

// --- Ferme le splash dans tous les cas ---
(function killSplash(){
  const s = document.getElementById('splash');
  if (!s) return;
  const hide = () => { s.classList.add('hidden'); setTimeout(()=>s.remove?.(), 600); };
  setTimeout(hide, 2200);                           // auto-hide
  document.addEventListener('DOMContentLoaded', hide, { once:true });
  window.addEventListener('load', hide, { once:true });
  s.addEventListener('click', hide, { once:true });  // clic = fermer
})();

// Petit toast (optionnel) pour confirmer l'action
function showToast(msg){
  try {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  } catch {}
}

// Effacer l'historique (mémoire + écran)
function clearHistory(){
  try {
    historyList = [];
    saveLS(LS.hist, historyList);   // LS.hist = 'iptv.history'
    if (mode === 'history') renderList();
    showToast('Historique effacé ✅');
  } catch(e){
    console.error('[clearHistory]', e);
  }
}

// === Thème clair/sombre — init SAFE (anti-conflit) =======================
(() => {
  // Empêche une double initialisation si le code est chargé 2x
  if (window.__IPTV_THEME_INIT__) return;
  window.__IPTV_THEME_INIT__ = true;

  const LSKEY = 'theme';
  const btn = document.getElementById('themeToggle');

  const apply = (t) => {
    const isLight = t === 'light';
    document.body.classList.toggle('light', isLight);
    try { localStorage.setItem(LSKEY, isLight ? 'light' : 'dark'); } catch {}
    if (btn) btn.textContent = isLight ? '☀️' : '🌙';
  };

  // init: préférence sauvegardée > préférence système > sombre
  let t = 'dark';
try {
  const saved = localStorage.getItem(LSKEY);
  if (saved === 'light' || saved === 'dark') t = saved;  // sinon, on garde 'dark'
} catch {}
apply(t);

  // handler unique (écrase les anciens avec onclick)
  if (btn) {
    btn.onclick = () => apply(document.body.classList.contains('light') ? 'dark' : 'light');
  }
})();

// === Bouton Plein écran (dans la nowBar) ==================================
(() => {
  const actions = document.querySelector('#nowBar .nowbar-actions') || document.getElementById('nowBar');
  if (!actions) return;

  // Crée le bouton
  const fsBtn = document.createElement('button');
  fsBtn.id = 'fsBtn';
  fsBtn.title = 'Plein écran';
  fsBtn.textContent = '⤢'; // icône simple, compatible partout
  fsBtn.style.minWidth = '38px'; // pour matcher la taille des autres
  actions.appendChild(fsBtn);

  // Utilitaires
  const playerSection = document.getElementById('playerSection');
  const video = document.getElementById('videoPlayer');
  const audio = document.getElementById('audioPlayer');

  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const setLabel = () => { fsBtn.textContent = isFullscreen() ? '⤡' : '⤢'; }; // ⤡ = quitter

  const activeMedia = () => {
    if (video && video.style.display === 'block') return video;
    if (audio && audio.style.display === 'block') return audio;
    return playerSection || document.documentElement;
  };

  const toggleFullscreen = async () => {
    try {
      if (isFullscreen()) {
        await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      } else {
        const target = activeMedia();
        // iOS Safari plein écran natif de la vidéo si possible
        if (target === video && video.webkitSupportsFullscreen && !document.pictureInPictureElement) {
          video.webkitEnterFullscreen(); // bascule plein écran iOS
        } else {
          await (target.requestFullscreen?.() || target.webkitRequestFullscreen?.());
        }
      }
    } catch (e) { console.warn('[fullscreen]', e); }
    setLabel();
  };

  fsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
  document.addEventListener('fullscreenchange', setLabel);
  document.addEventListener('webkitfullscreenchange', setLabel);
  setLabel();
})();

/* ===== Audio Tracks SAFE v3 — coller tout en bas, remplace les versions précédentes ===== */

/* Globals si absents */
if (typeof window.currentHls === 'undefined') window.currentHls = null;
if (typeof window.currentDash === 'undefined') window.currentDash = null;

/* 0) Sécurité : étend resetPlayers pour détruire HLS/DASH avant le reset existant */
if (typeof window.__orig_resetPlayers__ === 'undefined' && typeof resetPlayers === 'function') {
  window.__orig_resetPlayers__ = resetPlayers;
  resetPlayers = function(){
    try { if (window.currentHls && window.currentHls.destroy) { window.currentHls.destroy(); } } catch(e){}
    window.currentHls = null;
    try { if (window.currentDash && window.currentDash.reset) { window.currentDash.reset(); } } catch(e){}
    window.currentDash = null;
    try { window.__orig_resetPlayers__.call(this); } catch(e){}
  };
}

/* 1) Repatch playHls / playDash (robustes, sans syntaxe “moderne”) */
function playHls(url){
  try { video.style.display = 'block'; } catch(e){}
  try { if (typeof setPlaying === 'function') setPlaying(true); } catch(e){}

  try {
    if (window.Hls && window.Hls.isSupported && window.Hls.isSupported()) {
      try { if (window.currentHls && window.currentHls.destroy) window.currentHls.destroy(); } catch(e){}
      var hls = new window.Hls();
      window.currentHls = hls;

      try {
        hls.on(window.Hls.Events.ERROR, function(evt, data){
          if (data && data.fatal) {
            try { hls.destroy(); } catch(_){}
            window.currentHls = null;
            video.src = url;
          }
        });
        hls.on(window.Hls.Events.MANIFEST_PARSED, function(){ try { renderAudioMenu(); } catch(_){ } });
        hls.on(window.Hls.Events.AUDIO_TRACK_SWITCHED, function(){ try { highlightCurrentAudio(); } catch(_){ } });
      } catch(_){}

      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url; // Safari natif
      video.addEventListener('loadedmetadata', function(){ try { renderAudioMenu(); } catch(_){ } }, { once:true });
    }
  } catch (e) {
    try { console.error('[playHls]', e); } catch(_){}
    try { video.src = url; } catch(_){}
  }

  try { updateNowBar(undefined, url); } catch(_){}
}

function playDash(url){
  try { video.style.display = 'block'; } catch(e){}
  try { if (typeof setPlaying === 'function') setPlaying(true); } catch(e){}

  try {
    var DASH = (window.dashjs && window.dashjs.MediaPlayer) ? window.dashjs.MediaPlayer : null;
    if (DASH && typeof DASH.create === 'function') {
      try { if (window.currentDash && window.currentDash.reset) window.currentDash.reset(); } catch(_){}
      var p = DASH.create();
      window.currentDash = p;
      p.initialize(video, url, true);
      try {
        p.on(window.dashjs.MediaPlayer.events.STREAM_INITIALIZED, function(){ try { renderAudioMenu(); } catch(_){ } });
        p.on(window.dashjs.MediaPlayer.events.AUDIO_TRACK_CHANGED, function(){ try { highlightCurrentAudio(); } catch(_){ } });
      } catch(_){}
    } else {
      video.src = url; // fallback
      video.addEventListener('loadedmetadata', function(){ try { renderAudioMenu(); } catch(_){ } }, { once:true });
    }
  } catch (e) {
    try { console.error('[playDash]', e); } catch(_){}
    try { video.src = url; } catch(_){}
  }

  try { updateNowBar(undefined, url); } catch(_){}
}

/* 2) Helpers: lister/sélectionner pistes (HLS/DASH/natif) */
function listAudioTracks(){
  // HLS.js
  try {
    if (window.currentHls && window.currentHls.audioTracks) {
      var idx = (typeof window.currentHls.audioTrack === 'number') ? window.currentHls.audioTrack : -1;
      var a = [];
      for (var i=0; i<window.currentHls.audioTracks.length; i++){
        var t = window.currentHls.audioTracks[i] || {};
        a.push({
          id: i,
          label: t.name || t.lang || ('Piste ' + (i+1)),
          lang: t.lang || '',
          selected: i === idx,
          type: 'hls'
        });
      }
      return a;
    }
  } catch(_){}

  // dash.js
  try {
    if (window.currentDash && typeof window.currentDash.getTracksFor === 'function') {
      var tracks = window.currentDash.getTracksFor('audio') || [];
      var cur = window.currentDash.getCurrentTrack('audio');
      var out = [];
      for (var j=0; j<tracks.length; j++){
        var d = tracks[j] || {};
        var lab = d.lang || (d.labels && d.labels[0]) || d.role || 'Audio';
        var sel = !!(cur && (cur.id === d.id));
        out.push({ id: d, label: lab, lang: d.lang || '', selected: sel, type: 'dash' });
      }
      return out;
    }
  } catch(_){}

  // Natif (rare)
  try {
    if (video && video.audioTracks && video.audioTracks.length){
      var nat = [];
      for (var k=0; k<video.audioTracks.length; k++){
        var nt = video.audioTracks[k];
        nat.push({ id: k, label: nt.label || nt.language || ('Piste ' + (k+1)), lang: nt.language || '', selected: !!nt.enabled, type: 'native' });
      }
      return nat;
    }
  } catch(_){}

  return [];
}

function selectAudioTrack(track){
  if (!track) return;
  try {
    if (track.type === 'hls' && window.currentHls) {
      window.currentHls.audioTrack = track.id;
    } else if (track.type === 'dash' && window.currentDash) {
      window.currentDash.setCurrentTrack(track.id);
    } else if (track.type === 'native' && video && video.audioTracks) {
      for (var i=0; i<video.audioTracks.length; i++){
        video.audioTracks[i].enabled = (i === track.id);
      }
    }
  } catch(e){}
  try { highlightCurrentAudio(); } catch(_){}
}

/* 3) UI nowBar: bouton 🎧 + menu (sans templates/backticks) */
(function attachAudioBtn(){
  var actions = document.querySelector('#nowBar .nowbar-actions') || document.getElementById('nowBar');
  if (!actions) return;
  if (document.getElementById('audioBtn')) return;

  var wrap = document.createElement('div');
  wrap.style.position = 'relative';

  var btn = document.createElement('button');
  btn.id = 'audioBtn';
  btn.title = 'Piste audio';
  btn.textContent = '🎧 Audio';
  wrap.appendChild(btn);

  var menu = document.createElement('div');
  menu.id = 'audioMenu';
  menu.style.display = 'none';
  wrap.appendChild(menu);

  actions.appendChild(wrap);

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    menu.style.display = (menu.style.display === 'none' ? 'block' : 'none');
    if (menu.style.display === 'block') renderAudioMenu();
  });

  document.addEventListener('click', function(e){
    if (!wrap.contains(e.target)) menu.style.display = 'none';
  });
})();

function renderAudioMenu(){
  var menu = document.getElementById('audioMenu');
  if (!menu) return;

  var tracks = listAudioTracks();
  if (!tracks.length) {
    menu.innerHTML = '<div class="am-empty">Aucune piste détectée</div>';
    return;
  }

  var html = [];
  for (var i=0; i<tracks.length; i++){
    var t = tracks[i];
    var cls = t.selected ? 'am-item sel' : 'am-item';
    var langHtml = t.lang ? (' <span class="am-lang">(' + escapeHtml(t.lang) + ')</span>') : '';
    html.push('<button class="' + cls + '" data-i="' + i + '">' + escapeHtml(t.label) + langHtml + '</button>');
  }
  menu.innerHTML = html.join('');

  var items = menu.querySelectorAll('.am-item');
  for (var j=0; j<items.length; j++){
    (function(idx){
      items[idx].onclick = function(ev){
        ev.stopPropagation();
        var chosen = tracks[idx];
        selectAudioTrack(chosen);
        menu.style.display = 'none';
      };
    })(j);
  }
}

function highlightCurrentAudio(){
  var menu = document.getElementById('audioMenu');
  if (!menu) return;
  var tracks = listAudioTracks();
  var items = menu.querySelectorAll('.am-item');
  for (var i=0; i<items.length; i++){
    var sel = !!(tracks[i] && tracks[i].selected);
    if (sel) items[i].classList.add('sel'); else items[i].classList.remove('sel');
  }
}
/* ===== /Audio Tracks SAFE v3 ===== */

/* ===== Subs + Audio Memory SAFE v1 — coller tout en bas ===== */

/* Globals (si absents) */
if (typeof window.currentHls === 'undefined') window.currentHls = null;
if (typeof window.currentDash === 'undefined') window.currentDash = null;

/* === Mémoire des préférences par URL ===================================== */
var PREFS_LS_KEY = 'iptv.prefs'; // { [url]: { audio:{type,id,lang,label}, subs:{type,id,lang,label,on} } }

function loadPrefs() {
  try {
    var raw = localStorage.getItem(PREFS_LS_KEY);
    if (!raw) return {};
    var obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch(e) { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_LS_KEY, JSON.stringify(p || {})); } catch(e){}
}
function getPrefs(url) {
  var all = loadPrefs();
  return all[url] || {};
}
function setAudioPref(url, track) {
  if (!url || !track) return;
  var all = loadPrefs();
  all[url] = all[url] || {};
  all[url].audio = { type: track.type || '', id: track.id || null, lang: track.lang || '', label: track.label || '' };
  savePrefs(all);
}
function setSubsPref(url, trackOrOff) {
  if (!url) return;
  var all = loadPrefs();
  all[url] = all[url] || {};
  if (trackOrOff && trackOrOff.id !== undefined) {
    all[url].subs = { type: trackOrOff.type || '', id: trackOrOff.id, lang: trackOrOff.lang || '', label: trackOrOff.label || '', on: true };
  } else {
    all[url].subs = { on: false }; // off
  }
  savePrefs(all);
}

/* util d’échappement HTML (si pas déjà présent) */
if (typeof window.escapeHtml !== 'function') {
  window.escapeHtml = function (s) {
    try {
      return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
    } catch(e){ return ''; }
  };
}

/* === AUDIO (mémoire) : écoute changements existants ====================== */
/* Rem: Audio SAFE v3 gère déjà listAudioTracks/selectAudioTrack.
   On hooke juste la mémorisation au moment du switch. */
function rememberCurrentAudio(url) {
  try {
    var tracks = (typeof listAudioTracks === 'function') ? listAudioTracks() : [];
    for (var i=0;i<tracks.length;i++){
      if (tracks[i].selected) { setAudioPref(url, tracks[i]); break; }
    }
  } catch(e){}
}

/* === SOUS-TITRES : liste / sélection (HLS, DASH, natif) ================== */
function listSubtitleTracks(){
  /* HLS.js */
  try {
    if (window.currentHls && window.currentHls.subtitleTracks) {
      var idx = (typeof window.currentHls.subtitleTrack === 'number') ? window.currentHls.subtitleTrack : -1;
      var arr = [];
      for (var i=0;i<window.currentHls.subtitleTracks.length;i++){
        var t = window.currentHls.subtitleTracks[i] || {};
        arr.push({
          id: i,
          label: t.name || t.lang || ('Sous-titres ' + (i+1)),
          lang: t.lang || '',
          selected: i === idx,
          type: 'hls'
        });
      }
      return arr;
    }
  } catch(e){}

  /* dash.js */
  try {
    if (window.currentDash && typeof window.currentDash.getTracksFor === 'function') {
      var tracks = window.currentDash.getTracksFor('text') || [];
      var cur = window.currentDash.getCurrentTrack && window.currentDash.getCurrentTrack('text');
      var out = [];
      for (var j=0;j<tracks.length;j++){
        var d = tracks[j] || {};
        var lab = d.lang || (d.labels && d.labels[0]) || d.role || 'Sous-titres';
        var sel = !!(cur && (cur.id === d.id));
        out.push({ id: d, label: lab, lang: d.lang || '', selected: sel, type: 'dash' });
      }
      return out;
    }
  } catch(e){}

  /* Natif */
  try {
    if (video && video.textTracks && video.textTracks.length){
      var arrN = [];
      // mode: "disabled" | "hidden" | "showing"
      for (var k=0;k<video.textTracks.length;k++){
        var tt = video.textTracks[k];
        var sel = tt.mode === 'showing';
        arrN.push({
          id: k,
          label: tt.label || tt.language || ('Sous-titres ' + (k+1)),
          lang: tt.language || '',
          selected: sel,
          type: 'native'
        });
      }
      return arrN;
    }
  } catch(e){}

  return [];
}

function selectSubtitleTrack(track){
  /* OFF (désactiver) */
  if (!track) {
    try {
      /* HLS: pas d’index “-1”, on masque les pistes natives si exposées */
      if (window.currentHls) {
        // Masquer via textTracks vidéo
        if (video && video.textTracks) {
          for (var i=0;i<video.textTracks.length;i++){ video.textTracks[i].mode = 'disabled'; }
        }
      }
    } catch(e){}
    try {
      if (window.currentDash) {
        // dash.js: désactiver = setTextTrack(null)
        if (typeof window.currentDash.setTextTrack === 'function') {
          window.currentDash.setTextTrack(null);
        }
      }
    } catch(e){}
    try {
      if (video && video.textTracks) {
        for (var i2=0;i2<video.textTracks.length;i2++){ video.textTracks[i2].mode = 'disabled'; }
      }
    } catch(e){}
    return;
  }

  /* HLS.js */
  if (track.type === 'hls' && window.currentHls) {
    try { window.currentHls.subtitleTrack = track.id; } catch(e){}
    // Affiche via native TextTracks si présents
    try {
      if (video && video.textTracks) {
        for (var i3=0;i3<video.textTracks.length;i3++){
          video.textTracks[i3].mode = (i3 === track.id) ? 'showing' : 'disabled';
        }
      }
    } catch(e){}
    return;
  }

  /* dash.js */
  if (track.type === 'dash' && window.currentDash) {
    try { window.currentDash.setTextTrack(track.id); } catch(e){}
    return;
  }

  /* Natif */
  if (track.type === 'native' && video && video.textTracks) {
    try {
      for (var i4=0;i4<video.textTracks.length;i4++){
        video.textTracks[i4].mode = (i4 === track.id) ? 'showing' : 'disabled';
      }
    } catch(e){}
  }
}

/* Mémoriser le sous-titre courant */
function rememberCurrentSubs(url){
  try {
    var trs = listSubtitleTracks();
    var on = false, chosen = null;
    for (var i=0;i<trs.length;i++){
      if (trs[i].selected) { on = true; chosen = trs[i]; break; }
    }
    if (on) setSubsPref(url, chosen); else setSubsPref(url, null);
  } catch(e){}
}

/* Appliquer préférences audio + subs au chargement d’un flux */
function applySavedPrefs(url){
  var p = getPrefs(url) || {};
  /* Audio */
  try {
    if (p.audio && typeof selectAudioTrack === 'function') {
      // on retrouve la piste par id/lang/label si l’id direct ne marche pas
      var listA = listAudioTracks();
      var targetA = null;
      var i;
      for (i=0;i<listA.length;i++){
        var a = listA[i];
        if (p.audio.id !== null && a.id === p.audio.id) { targetA = a; break; }
      }
      if (!targetA && p.audio && p.audio.lang) {
        for (i=0;i<listA.length;i++){ if (listA[i].lang && listA[i].lang === p.audio.lang) { targetA = listA[i]; break; } }
      }
      if (!targetA && p.audio && p.audio.label) {
        for (i=0;i<listA.length;i++){ if (listA[i].label === p.audio.label) { targetA = listA[i]; break; } }
      }
      if (targetA) selectAudioTrack(targetA);
    }
  } catch(e){}

  /* Subs */
  try {
    if (p.subs && p.subs.on) {
      var listS = listSubtitleTracks();
      var targetS = null;
      var j;
      for (j=0;j<listS.length;j++){
        var s = listS[j];
        if (p.subs.id !== null && (s.id === p.subs.id)) { targetS = s; break; }
      }
      if (!targetS && p.subs && p.subs.lang) {
        for (j=0;j<listS.length;j++){ if (listS[j].lang && listS[j].lang === p.subs.lang) { targetS = listS[j]; break; } }
      }
      if (!targetS && p.subs && p.subs.label) {
        for (j=0;j<listS.length;j++){ if (listS[j].label === p.subs.label) { targetS = listS[j]; break; } }
      }
      if (targetS) selectSubtitleTrack(targetS);
    } else {
      // off
      selectSubtitleTrack(null);
    }
  } catch(e){}
}

/* === UI nowBar : bouton CC + menu ======================================= */
(function attachSubsBtn(){
  var actions = document.querySelector('#nowBar .nowbar-actions') || document.getElementById('nowBar');
  if (!actions) return;
  if (document.getElementById('subsBtn')) return;

  var wrap = document.createElement('div');
  wrap.style.position = 'relative';

  var btn = document.createElement('button');
  btn.id = 'subsBtn';
  btn.title = 'Sous-titres';
  btn.textContent = 'CC';
  wrap.appendChild(btn);

  var menu = document.createElement('div');
  menu.id = 'subsMenu';
  menu.style.display = 'none';
  wrap.appendChild(menu);

  actions.appendChild(wrap);

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    menu.style.display = (menu.style.display === 'none' ? 'block' : 'none');
    if (menu.style.display === 'block') renderSubsMenu();
  });

  document.addEventListener('click', function(e){
    if (!wrap.contains(e.target)) menu.style.display = 'none';
  });
})();

/* Menu de sous-titres */
function renderSubsMenu(){
  var menu = document.getElementById('subsMenu');
  if (!menu) return;

  var list = listSubtitleTracks();
  var html = [];

  // Option OFF
  var anySel = false;
  for (var i=0;i<list.length;i++){ if (list[i].selected) { anySel = true; break; } }
  html.push('<button class="sm-item ' + (anySel ? '' : 'sel') + '" data-i="-1">Désactivés</button>');

  for (var j=0;j<list.length;j++){
    var t = list[j];
    var cls = 'sm-item' + (t.selected ? ' sel' : '');
    var langHtml = t.lang ? (' <span class="sm-lang">(' + escapeHtml(t.lang) + ')</span>') : '';
    html.push('<button class="' + cls + '" data-i="' + j + '">' + escapeHtml(t.label) + langHtml + '</button>');
  }

  menu.innerHTML = html.join('');

  var items = menu.querySelectorAll('.sm-item');
  for (var k=0;k<items.length;k++){
    (function(idx){
      items[idx].onclick = function(ev){
        ev.stopPropagation();
        var url = (typeof getCurrentUrl === 'function') ? getCurrentUrl() : null;
        if (idx === 0) { // OFF
          selectSubtitleTrack(null);
          if (url) setSubsPref(url, null);
          menu.style.display = 'none';
          highlightCurrentSubs();
          return;
        }
        var tracks = listSubtitleTracks();
        var chosen = tracks[idx - 1];
        selectSubtitleTrack(chosen);
        if (url) setSubsPref(url, chosen);
        menu.style.display = 'none';
        highlightCurrentSubs();
      };
    })(k);
  }
}

/* Mise en évidence de la sélection courante */
function highlightCurrentSubs(){
  var menu = document.getElementById('subsMenu');
  if (!menu) return;
  var list = listSubtitleTracks();
  var items = menu.querySelectorAll('.sm-item');
  var anySel = false, i;
  for (i=0;i<list.length;i++){ if (list[i].selected) { anySel = true; break; } }
  // item 0 = OFF
  if (items.length) {
    if (!anySel) items[0].classList.add('sel'); else items[0].classList.remove('sel');
  }
  for (i=0;i<list.length;i++){
    var it = items[i+1];
    if (!it) continue;
    if (list[i].selected) it.classList.add('sel'); else it.classList.remove('sel');
  }
}

/* === Intégration : appliquer préférences quand un flux démarre ========== */
/* Si tu as une fonction qui renvoie l’URL courante, expose-la :
   window.getCurrentUrl = function(){ ... } ;  Sinon, applySavedPrefs(url) est
   déjà appelée ci-dessous à partir de playHls/playDash via events. */

/* Hook évènements pour mémoriser les choix utilisateur */
(function hookTrackEvents(){
  try {
    if (window.currentHls && window.currentHls.on) {
      window.currentHls.on(window.Hls.Events.AUDIO_TRACK_SWITCHED, function(){ 
        var u = (typeof getCurrentUrl === 'function') ? getCurrentUrl() : null;
        if (u) rememberCurrentAudio(u);
      });
      window.currentHls.on(window.Hls.Events.SUBTITLE_TRACK_SWITCH, function(){
        var u = (typeof getCurrentUrl === 'function') ? getCurrentUrl() : null;
        if (u) rememberCurrentSubs(u);
      });
    }
  } catch(e){}
  try {
    if (window.currentDash && window.currentDash.on) {
      window.currentDash.on(window.dashjs.MediaPlayer.events.AUDIO_TRACK_CHANGED, function(){
        var u = (typeof getCurrentUrl === 'function') ? getCurrentUrl() : null;
        if (u) rememberCurrentAudio(u);
      });
      window.currentDash.on(window.dashjs.MediaPlayer.events.TEXT_TRACK_CHANGED, function(){
        var u = (typeof getCurrentUrl === 'function') ? getCurrentUrl() : null;
        if (u) rememberCurrentSubs(u);
      });
    }
  } catch(e){}
})();

/* Appliquer prefs après parsing/manif */
(function hookApplyPrefs(){
  // On remplace légerement playHls/playDash déjà présents en leur ajoutant applySavedPrefs
  var _playHls = (typeof playHls === 'function') ? playHls : null;
  var _playDash = (typeof playDash === 'function') ? playDash : null;

  if (_playHls) {
    playHls = function(url){
      _playHls(url);
      // attendre un peu que les tracks existent
      setTimeout(function(){ try { applySavedPrefs(url); renderSubsMenu(); } catch(e){} }, 600);
    };
  }
  if (_playDash) {
    playDash = function(url){
      _playDash(url);
      setTimeout(function(){ try { applySavedPrefs(url); renderSubsMenu(); } catch(e){} }, 600);
    };
  }
})();

// === NowBar FS fix — reconstruit 2 boutons distincts & handlers propres ===
(function fixNowBarFS(){
  var nowBar = document.getElementById('nowBar');
  if (!nowBar) return;
  var actions = nowBar.querySelector('.nowbar-actions') || nowBar;

  // 1) Supprime tous les anciens boutons FS (doublons/handlers fantômes)
  Array.prototype.slice.call(actions.querySelectorAll('#fsBtn, #fsPageBtn')).forEach(function(b){ b.remove(); });
  Array.prototype.slice.call(actions.querySelectorAll('button, a')).forEach(function(b){
    var t = (b.textContent || '').trim();
    var ttl = (b.title || '').toLowerCase();
    var looksFS = (t === '⤢' || t === '⤡' || t === '🗖' || t === '🗗' || ttl.indexOf('plein écran') !== -1);
    if (looksFS && !b.id) b.remove();
  });

  // 2) Crée deux nouveaux boutons "neufs" (aucun listener hérité)
  var fsVideoBtn = document.createElement('button');
  fsVideoBtn.id = 'fsBtn';
  fsVideoBtn.title = 'Plein écran (vidéo)';
  fsVideoBtn.textContent = '⤢';
  fsVideoBtn.style.minWidth = '38px';

  var fsPageBtn = document.createElement('button');
  fsPageBtn.id = 'fsPageBtn';
  fsPageBtn.title = 'Plein écran (page)';
  fsPageBtn.textContent = '🗖';
  fsPageBtn.style.minWidth = '38px';

  actions.appendChild(fsVideoBtn);
  actions.appendChild(fsPageBtn);

  // 3) Handlers distincts
  var doc = document;
  var docEl = document.documentElement;
  var videoEl = document.getElementById('videoPlayer');
  var playerSection = document.getElementById('playerSection');

  function isFS(){ return !!(doc.fullscreenElement || doc.webkitFullscreenElement); }
  function currentFSTarget(){ return doc.fullscreenElement || doc.webkitFullscreenElement || null; }

  function setLabels(){
    var tgt = currentFSTarget();
    var videoFs = (tgt === videoEl || tgt === playerSection);
    var pageFs  = (tgt === docEl || tgt === doc.body);

    // Vidéo: ⤢ entrer / ⤡ quitter
    fsVideoBtn.textContent = videoFs ? '⤡' : '⤢';
    fsVideoBtn.title = videoFs ? 'Quitter plein écran (vidéo)' : 'Plein écran (vidéo)';

    // Page: 🗖 entrer / 🗗 quitter
    fsPageBtn.textContent = pageFs ? '🗗' : '🗖';
    fsPageBtn.title = pageFs ? 'Quitter plein écran (page)' : 'Plein écran (page)';
  }

  function targetForVideoFS(){
    // Si la <video> est visible, on la cible; sinon, le conteneur player
    if (videoEl && videoEl.style && videoEl.style.display === 'block') return videoEl;
    return playerSection || videoEl || docEl;
  }

  fsVideoBtn.onclick = function(e){
    e.stopPropagation();
    try {
      // iOS Safari: plein écran natif de la vidéo si possible (n'affecte pas la page)
      if (videoEl && typeof videoEl.webkitEnterFullscreen === 'function' && !isFS()) {
        videoEl.webkitEnterFullscreen();
        setLabels();
        return;
      }
      if (isFS()) {
        (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen && doc.webkitExitFullscreen());
      } else {
        var tgt = targetForVideoFS();
        if (tgt.requestFullscreen) tgt.requestFullscreen();
        else if (tgt.webkitRequestFullscreen) tgt.webkitRequestFullscreen();
      }
    } catch(_) {}
    setLabels();
  };

  fsPageBtn.onclick = function(e){
    e.stopPropagation();
    try {
      if (isFS()) {
        (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen && doc.webkitExitFullscreen());
      } else {
        if (docEl.requestFullscreen) docEl.requestFullscreen();
        else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
      }
    } catch(_) {}
    setLabels();
  };

  doc.addEventListener('fullscreenchange', setLabels);
  doc.addEventListener('webkitfullscreenchange', setLabels);
  setLabels();
})();



/* ===== PING des liens (HEAD/GET avec timeout & badge UI) ===== */
function pingUrl(url, timeoutMs){
  return new Promise(function(resolve){
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var t = setTimeout(function(){ try{ ctrl && ctrl.abort(); }catch(_){ } resolve({state:'timeout', status:0, ms:timeoutMs}); }, timeoutMs||5000);
    var t0 = Date.now();
    fetch(url, { method:'HEAD', signal: ctrl?ctrl.signal:undefined, cache:'no-store' })
      .then(function(r){
        clearTimeout(t);
        resolve({ state:(r.ok?'ok':(r.status>=400?'bad':'warn')), status:r.status, ms:Date.now()-t0 });
      })
      .catch(function(){
        var ctrl2 = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var t2 = setTimeout(function(){ try{ ctrl2 && ctrl2.abort(); }catch(_){ } resolve({state:'timeout', status:0, ms:(Date.now()-t0)}); }, timeoutMs||5000);
        fetch(url, { method:'GET', signal: ctrl2?ctrl2.signal:undefined, cache:'no-store', mode:'no-cors' })
          .then(function(r){
            clearTimeout(t2);
            var st = (typeof r.status === 'number' ? r.status : 0);
            var state = r.ok ? 'ok' : (st>=400 ? 'bad' : 'warn');
            resolve({ state: state, status: st, ms:Date.now()-t0 });
          })
          .catch(function(){
            resolve({ state:'bad', status:0, ms:Date.now()-t0 });
          });
      });
  });
}
function pingVisibleList(concurrency){
  var list = document.getElementById('list');
  if (!list) return;
  var items = list.querySelectorAll('.item');
  var max = concurrency || 6;
  var q = [];
  for (var i=0;i<items.length;i++){
    (function(div){
      var url = div.getAttribute('data-url');
      if (!url) return;
      var badge = div.querySelector('.ping-badge');
      if (!badge) {
        var left = div.querySelector('.left') || div;
        badge = document.createElement('span'); badge.className = 'ping-badge ping-spin'; badge.title = 'Vérification…';
        left.appendChild(badge);
      } else {
        badge.className = 'ping-badge ping-spin'; badge.title = 'Vérification…';
      }
      q.push({div:div, url:url, badge:badge});
    })(items[i]);
  }
  var idx = 0, active = 0;
  function next(){
    if (idx >= q.length) return;
    while (active < max && idx < q.length){
      (function(job){
        idx++; active++;
        pingUrl(job.url, 5000).then(function(res){
          job.badge.classList.remove('ping-spin','ping-ok','ping-warn','ping-bad');
          var cls = 'ping-warn', tt = 'Inconnu';
          if (res.state === 'ok')   { cls='ping-ok';   tt='OK ' + res.status + ' ('+res.ms+'ms)'; }
          else if (res.state === 'bad'){ cls='ping-bad';  tt='Erreur ' + res.status + ' ('+res.ms+'ms)'; }
          else if (res.state === 'timeout'){ cls='ping-bad'; tt='Timeout ('+res.ms+'ms)'; }
          else { cls='ping-warn'; tt='Peut-être OK (CORS) ('+res.ms+'ms)'; }
          job.badge.classList.add(cls);
          job.badge.title = tt;
        }).catch(function(){ })
        .finally(function(){ active--; next(); });
      })(q[idx]);
    }
  }
  next();
}
(function attachVerifyButton(){
  var tabs = document.querySelector('.tabs');
  if (!tabs) return;
  if (document.getElementById('btnVerifyLinks')) return;
  var btn = document.createElement('button');
  btn.id = 'btnVerifyLinks';
  btn.textContent = 'Vérifier les liens';
  btn.title = 'Ping des liens visibles';
  btn.style.margin = '6px';
  btn.onclick = function(){ pingVisibleList(6); };
  tabs.parentNode.insertBefore(btn, tabs.nextSibling);
})();


/* ===== Stats overlay (codec, résolution, fps, bitrate, buffer) ===== */
(function StatsOverlay(){
  var video = document.getElementById('videoPlayer');
  var player = document.getElementById('playerSection');
  if (!video || !player) return;
  var actions = document.querySelector('#nowBar .nowbar-actions') || document.getElementById('nowBar');
  if (actions && !document.getElementById('statsBtn')) {
    var sb = document.createElement('button');
    sb.id = 'statsBtn'; sb.textContent = 'ℹ️ Stats'; sb.title = 'Afficher/Masquer les stats';
    actions.appendChild(sb);
    sb.onclick = function(e){ e.stopPropagation(); toggleStats(); };
  }
  var box = document.getElementById('statsOverlay');
  if (!box) {
    box = document.createElement('div');
    box.id = 'statsOverlay'; box.className = 'hidden';
    player.appendChild(box);
  }
  var timer = null, lastFrames = 0, lastTs = 0;
  function toggleStats(){ if (box.classList.contains('hidden')) start(); else stop(); }
  function start(){ box.classList.remove('hidden'); lastFrames=0; lastTs=0; if (timer) clearInterval(timer); timer=setInterval(update,1000); update(); }
  function stop(){ box.classList.add('hidden'); if (timer){ clearInterval(timer); timer=null; } }
  function formatBitrate(bps){ if (!bps||bps<=0) return '-'; var kb=bps/1000; if (kb<1000) return Math.round(kb)+' kb/s'; return (kb/1000).toFixed(2)+' Mb/s'; }
  function getBuffer(){ try{ var ct=video.currentTime, buf=0; for (var i=0;i<video.buffered.length;i++){ var a=video.buffered.start(i), b=video.buffered.end(i); if (ct>=a&&ct<=b){ buf=b-ct; break; } } return buf; }catch(e){ return 0; } }
  function getFPS(){
    try {
      if (video.getVideoPlaybackQuality) {
        var q = video.getVideoPlaybackQuality();
        var frames = q.totalVideoFrames || 0;
        var now = performance.now();
        if (!lastTs) { lastTs = now; lastFrames = frames; return 0; }
        var fps = (frames - lastFrames) * 1000 / (now - lastTs);
        lastTs = now; lastFrames = frames;
        return Math.max(0, Math.round(fps));
      }
    } catch(e){}
    return 0;
  }
  function getHLStats(){
    try {
      if (window.currentHls) {
        var h = window.currentHls;
        var bps = (h.bandwidthEstimate) ? h.bandwidthEstimate : (function(){
          var lvl = h.currentLevel;
          if (lvl>=0 && h.levels && h.levels[lvl]) return h.levels[lvl].bitrate || 0;
          return 0;
        })();
        return { lib:'HLS.js', bitrate:bps };
      }
    } catch(e){}
    return null;
  }
  function getDashStats(){
    try {
      if (window.currentDash) {
        var p = window.currentDash;
        var abr = p.getBitrateInfoListFor ? p.getBitrateInfoListFor('video') : null;
        var q = p.getQualityFor ? p.getQualityFor('video') : null;
        var bps = 0;
        if (abr && q!=null && abr[q]) bps = (abr[q].bitrate || 0) * 1000;
        return { lib:'dash.js', bitrate:bps };
      }
    } catch(e){}
    return null;
  }
  function update(){
    var w = video.videoWidth || 0, h = video.videoHeight || 0;
    var fps = getFPS();
    var buf = getBuffer();
    var lib = '-', bitrate = 0;
    var hs = getHLStats(); if (hs){ lib=hs.lib; bitrate=hs.bitrate; }
    var ds = getDashStats(); if (ds){ lib=ds.lib; bitrate=ds.bitrate; }
    var lines = [];
    lines.push('🎛️  <span class="title">Stats player</span>');
    lines.push('Lib: ' + lib);
    lines.push('Résolution: ' + (w&&h ? (w+'×'+h) : '-'));
    lines.push('FPS (approx): ' + (fps||'-'));
    lines.push('Bitrate: ' + formatBitrate(bitrate));
    lines.push('Buffer: ' + (buf>0 ? buf.toFixed(2)+' s' : '0 s'));
    box.innerHTML = lines.join('<br>');
  }
  window.showStats = start; window.hideStats = stop;
})();
// Regroupe les boutons de la nowBar dans .nowbar-actions pour l'alignement à droite
(() => {
  const bar = document.getElementById('nowBar');
  if (!bar) return;
  let actions = bar.querySelector('.nowbar-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'nowbar-actions';
    // déplace tous les boutons/links vers la droite
    const movers = Array.from(bar.querySelectorAll('button, a'));
    bar.appendChild(actions);
    movers.forEach(el => actions.appendChild(el));
  }
})();
// Normalise la structure de la nowBar (titre à gauche, actions à droite)
(function normalizeNowBar(){
  var bar = document.getElementById('nowBar');
  if (!bar) return;

  // 1) Crée le conteneur des actions s’il manque
  var actions = bar.querySelector('.nowbar-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'nowbar-actions';
    bar.appendChild(actions);
  }

  // 2) Assure un #nowTitle (créé si absent)
  var title = document.getElementById('nowTitle');
  if (!title) {
    title = document.createElement('span');
    title.id = 'nowTitle';
    // Récupère un éventuel texte titre perdu dans la barre
    var txt = '';
    Array.prototype.slice.call(bar.childNodes).forEach(function(n){
      if (n.nodeType === 3) txt += n.textContent.trim() + ' ';
    });
    if (txt.trim()) title.textContent = txt.trim();
    // Insère le titre tout au début
    bar.insertBefore(title, bar.firstChild);
  }

  // 3) Déplace tous les boutons/links dans .nowbar-actions (droite)
  Array.prototype.slice.call(bar.querySelectorAll('button, a'))
    .forEach(function(el){
      if (!actions.contains(el)) actions.appendChild(el);
    });

  // 4) Empêche que d’autres styles re-forcent l’alignement
  bar.style.setProperty('display','grid','important');
})();
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
    if (!prev){ prev = document.createElement('button'); prev.id='prevBtn';
prev.className = 'navBtn btn'; prev.className='navBtn'; prev.title='Chaîne précédente'; prev.textContent='⟨'; }
    let next = document.getElementById('nextBtn');
    if (!next){ next = document.createElement('button'); next.id='nextBtn';
next.className = 'navBtn btn'; next.className='navBtn'; next.title='Chaîne suivante'; next.textContent='⟩'; }
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


// Ensure nav buttons carry Crystal class 'btn' as well
(function(){
  var p = document.getElementById('prevBtn');
  if (p) { if (!p.classList.contains('btn')) p.classList.add('btn'); if (!p.classList.contains('navBtn')) p.classList.add('navBtn'); }
  var n = document.getElementById('nextBtn');
  if (n) { if (!n.classList.contains('btn')) n.classList.add('btn'); if (!n.classList.contains('navBtn')) n.classList.add('navBtn'); }
})();
// === Patch helper: réserve dynamiquement l'espace pour la nowBar ===
(function reserveForNowBar(){
  const nb = document.getElementById('nowBar');
  const main = document.querySelector('main');
  if (!nb || !main) return;
  function apply() {
    try{
      const h = nb.getBoundingClientRect().height || 64;
      main.style.paddingBottom = (h + 24) + 'px';
    }catch(_){}
  }
  apply();
  document.addEventListener('nowbar:updated', apply);
  window.addEventListener('resize', apply);
  setTimeout(apply, 300);
})();
// === Import rapide : utilise StreamBoost Lite s'il est présent =============
(function(){
  const btn = document.getElementById('btnImportFast');
  const input = document.getElementById('urlInput');
  if (!btn || !input || btn.__wiredFast) return;
  btn.__wiredFast = true;

  btn.addEventListener('click', async (e)=>{
    e.preventDefault(); e.stopPropagation();
    const url = (input.value || '').trim();
    if (!url){
      try{ toast('Entrez une URL M3U/M3U8'); }catch(_){ alert('Entrez une URL M3U/M3U8'); }
      return;
    }
    if (!window.StreamBoostLite){
      const legacy = document.getElementById('btnImportUrl');
      if (legacy) { legacy.click(); return; }
      if (typeof playByType === 'function'){ playByType(url); try{ updateNowBar(url, url); }catch(_){ } }
      return;
    }

    const listEl = document.getElementById('list');
    if (listEl) listEl.innerHTML = '';

    const onItems = StreamBoostLite.renderBatcher(
      listEl,
      StreamBoostLite.defaultRenderItem
    );
    function setNow(t){ try{ updateNowBar(t, url); }catch(_){ } }

    setNow('Import en cours…');

    try{
      await StreamBoostLite.importM3U(url, {
        onItems,
        onProgress(count){ setNow(`Import… ${count.toLocaleString('fr-FR')} chaînes`); },
        onDone({count, error}){
          setNow(error ? 'Erreur import' : `Import terminé — ${count.toLocaleString('fr-FR')} chaînes`);
          StreamBoostLite.enableLazyLogos(listEl);
        },
        chunkSize: 300
      });
    }catch(err){
      console.error('[Import rapide]', err);
      try{ toast('Erreur import'); }catch(_){}
    }
  });
})();
// Rafraîchir la page + placement entre "Importer fichier" et "Changer de thème"
(function setupRefreshBtn(){
  const btn = document.getElementById('btnRefresh');
  if (!btn || btn.__wired) return;
  btn.__wired = true;

  // Action: rechargement "dur" (bypass cache) si possible
  btn.addEventListener('click', () => {
    // hard reload : true -> bypass cache sur la plupart des navigateurs
    location.reload(true);
  });

  // Placement: entre Import Fichier et Changer de thème
  // Essaie de détecter les éléments de référence
  const controls = document.querySelector('.controls') || btn.parentElement;
  const importLabel = controls?.querySelector('.fileLabel, label[for="fileInput"], input[type="file"]');
  const themeBtn = controls?.querySelector('#btnTheme, #btnToggleTheme, [data-action="toggle-theme"]');

  if (controls && importLabel && themeBtn) {
    // Insère juste avant le bouton thème
    controls.insertBefore(btn, themeBtn);
  } else if (controls && importLabel) {
    // À défaut, juste après l'import fichier
    importLabel.insertAdjacentElement('afterend', btn);
  } // sinon on laisse le bouton où tu l'as mis en HTML

  // (Optionnel) Raccourci clavier: Alt+R
  document.addEventListener('keydown', (e)=>{
    if ((e.altKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      btn.click();
    }
  }, { passive: false });
})();

// === YouTube Autoplay + Unmute Patch (drop-in, no conflict) ===============
;(() => {
  if (window.__YT_AUTOPLAY_PATCH__) return;
  window.__YT_AUTOPLAY_PATCH__ = true;

  function extractYouTubeId(u){
    try{
      const url = new URL(u);
      if (url.hostname.includes('youtu.be')) return url.pathname.slice(1);
      if (url.searchParams.get('v')) return url.searchParams.get('v');
      const m = url.pathname.match(/\/(embed|shorts)\/([^\/?#&]+)/);
      if (m) return m[2];
    }catch{}
    const r = /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
    const m = String(u).match(r);
    return m ? m[1] : null;
  }
  window.extractYouTubeId = window.extractYouTubeId || extractYouTubeId;

  if (!window.__hadUserGesture){
    const mark = () => { window.__hadUserGesture = true; 
      window.removeEventListener('click', mark, true);
      window.removeEventListener('keydown', mark, true);
      window.removeEventListener('pointerdown', mark, true);
      window.removeEventListener('touchstart', mark, true);
    };
    window.addEventListener('click', mark, true);
    window.addEventListener('keydown', mark, true);
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('touchstart', mark, true);
  }

  function showYtUnmuteHint(){
    let b = document.getElementById('ytUnmute');
    if (!b) {
      b = document.createElement('button');
      b.id = 'ytUnmute';
      b.textContent = '🔊 Activer le son';
      b.style.cssText = 'position:absolute;right:12px;bottom:12px;z-index:1002;padding:8px 10px;border-radius:8px;font-weight:700;cursor:pointer;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(10px)';
      const ps = document.getElementById('playerSection');
      ps && ps.appendChild(b);
    }
    b.style.display = 'inline-flex';
    b.onclick = (e)=>{
      e.stopPropagation();
      try{
        const yt = document.getElementById('ytPlayer');
        yt?.contentWindow?.postMessage(JSON.stringify({event:'command', func:'unMute', args:[]}), '*');
        yt?.contentWindow?.postMessage(JSON.stringify({event:'command', func:'setVolume', args:[100]}), '*');
        yt?.contentWindow?.postMessage(JSON.stringify({event:'command', func:'playVideo', args:[]}), '*');
      }catch{}
      hideYtUnmuteHint();
      window.__hadUserGesture = true;
    };
  }
  function hideYtUnmuteHint(){
    const b = document.getElementById('ytUnmute');
    if (b) b.style.display = 'none';
  }

  function playYouTube(u){
    const id = extractYouTubeId(u);
    if (!id){ console.warn('[YT] ID introuvable', u); return; }

    const ps = document.getElementById('playerSection');
    const yt = document.getElementById('ytPlayer');
    const noSource = document.getElementById('noSource');

    try { window.resetPlayers && window.resetPlayers(); } catch {}
    if (noSource) noSource.style.display = 'none';
    ps && ps.classList.add('playing');

    const base = `https://www.youtube.com/embed/${id}`;
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      playsinline: '1',
      enablejsapi: '1',
      rel: '0',
      modestbranding: '1',
      origin: location.origin
    });

    try {
      const srcUrl = new URL(u);
      const list = srcUrl.searchParams.get('list');
      if (list) params.set('list', list);
    } catch {}

    yt.style.display = 'block';
    yt.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    yt.src = `${base}?${params.toString()}`;

    const send = (cmd, args=[]) => {
      try { yt.contentWindow.postMessage(JSON.stringify({ event:'command', func:cmd, args }), '*'); } catch {}
    };

    const onLoad = () => {
      send('playVideo');
      if (window.__hadUserGesture) {
        send('unMute'); send('setVolume',[100]); send('playVideo');
        hideYtUnmuteHint();
      } else {
        showYtUnmuteHint();
      }
    };
    yt.addEventListener('load', onLoad, { once:true });

    const unmuteOnce = () => {
      send('unMute'); send('setVolume',[100]); send('playVideo');
      hideYtUnmuteHint();
      window.removeEventListener('click', unmuteOnce, true);
      window.removeEventListener('keydown', unmuteOnce, true);
      window.removeEventListener('pointerdown', unmuteOnce, true);
      window.removeEventListener('touchstart', unmuteOnce, true);
    };
    window.addEventListener('click', unmuteOnce, true);
    window.addEventListener('keydown', unmuteOnce, true);
    window.addEventListener('pointerdown', unmuteOnce, true);
    window.addEventListener('touchstart', unmuteOnce, true);

    try { window.updateNowBar && window.updateNowBar(undefined, u); } catch {}
  }
  window.playYouTube = playYouTube;

  const _pbt = window.playByType;
  window.playByType = function(url){
    if (/(?:youtube\.com|youtu\.be)\//i.test(url||'')) {
      return playYouTube(url);
    }
    return _pbt ? _pbt(url) : null;
  };

  console.log('[YT Patch] Autoplay+Unmute prêt');
})();
