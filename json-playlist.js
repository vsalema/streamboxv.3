/* 
 * json-playlist.js — playlists JSON & méta-listes (.m3u) sans dépendre de loadSource
 *
 * ➤ Intégration : placez APRÈS `scriptiptv.js` (ou seul) :
 *    <script src="./json-playlist.js" defer></script>
 *
 * ➤ Prend en charge :
 *    - JSON { meta, categories, channels }
 *    - Tableau direct de chaînes [{ name, url, ... }]
 *    - Méta-listes { playlists: [{ name, url(.m3u|.m3u8|.mpd|.mp4|.mp3|YouTube) }] }
 *      • Si l'URL est .m3u → on télécharge et on PARSE la M3U nous-mêmes
 *
 * ➤ Le bouton "Lire" accepte aussi une URL .json
 */
(function () {
  'use strict';

  // ===== Helpers & éléments =====
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var el = {
    player: document.getElementById('player'),
    nowbar: document.getElementById('nowbar'),
    channelLogo: document.getElementById('channelLogo'),
    nowPlaying: document.getElementById('nowPlaying'),
    nowUrl: document.getElementById('nowUrl'),
    zapTitle: document.getElementById('zapTitle'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    // Catégories
    cat: document.getElementById('categorySelect'),
    cat2: document.getElementById('categorySelect2'),
    inlineCat: document.getElementById('inlineCategorySelect'),
    // Listes
    list: document.getElementById('channelList'),
    list2: document.getElementById('channelList2'),
    inlineList: document.getElementById('inlineChannelList'),
    // Recherches
    search: document.getElementById('search'),
    search2: document.getElementById('search2'),
    inlineSearch: document.getElementById('inlineSearch'),
    // Sources + boutons
    sourceSel: document.getElementById('sourceSelect'),
    sourceSel2: document.getElementById('sourceSelect2'),
    btnLoadM3U: document.getElementById('btnLoadM3U'),
    btnLoadM3U2: document.getElementById('btnLoadM3U2'),
    inputUrl: document.getElementById('inputUrl'),
    btnPlay: document.getElementById('btnPlay')
  };

  var vjs = null;
  try { vjs = window.videojs ? window.videojs('player') : null; } catch (e) {}

  var state = {
    meta: {},
    channels: [],
    categories: [],
    filtered: [],
    index: -1
  };

  function isJsonUrl(url) { return /\.json(\?|#|$)/i.test(url || ''); }

  // ===== Détection de type =====
  function guessType(url) {
    if (!url) return '';
    if (/^yt:|youtube\.com|youtu\.be/i.test(url)) return 'youtube';
    if (/\.m3u8(\?|#|$)/i.test(url)) return 'hls';
    if (/\.m3u(\?|#|$)/i.test(url)) return 'm3u-list';
    if (/\.mpd(\?|#|$)/i.test(url)) return 'dash';
    if (/\.mp4(\?|#|$)/i.test(url)) return 'mp4';
    if (/\.mp3(\?|#|$)/i.test(url)) return 'mp3';
    return '';
  }

  function srcForPlayer(ch) {
    if (ch.type === 'm3u-list') return null; // non jouable
    if (ch.type === 'youtube') return { src: ch.url.replace(/^yt:/i, ''), type: 'video/youtube' };
    if (ch.type === 'dash') return { src: ch.url, type: 'application/dash+xml' };
    if (ch.type === 'hls') return { src: ch.url, type: 'application/x-mpegURL' };
    if (ch.type === 'mp4') return { src: ch.url, type: 'video/mp4' };
    if (ch.type === 'mp3') return { src: ch.url, type: 'audio/mpeg' };
    return { src: ch.url };
  }

  // ===== Catégories =====
  function buildCategories(channels, catsList) {
    var byLabel = {};
    if (Array.isArray(catsList)) {
      for (var i = 0; i < catsList.length; i++) {
        var c = catsList[i];
        var id = c.id || String((c.label || '')).toLowerCase().trim();
        if (id && !byLabel[id]) byLabel[id] = { id: id, label: c.label || id };
      }
    }
    for (var j = 0; j < channels.length; j++) {
      var ch = channels[j];
      var id2 = String(ch.category || 'Autres');
      var key = id2.toLowerCase();
      if (!byLabel[key]) byLabel[key] = { id: key, label: ch.category || 'Autres' };
    }
    var out = [{ id: '*', label: 'Toutes' }];
    Object.keys(byLabel).sort(function (a, b) {
      return byLabel[a].label.localeCompare(byLabel[b].label, 'fr');
    }).forEach(function (k) { out.push(byLabel[k]); });
    return out;
  }

  // ===== Parsing JSON =====
  function parseJsonPlaylist(obj) {
    // 1) Natif { meta, categories, channels } ou tableau direct
    var meta0 = obj && obj.meta ? obj.meta : {};
    var cats0 = obj && Array.isArray(obj.categories) ? obj.categories : [];
    var channels0 = [];
    if (obj && Array.isArray(obj.channels)) channels0 = obj.channels;
    else if (Array.isArray(obj)) channels0 = obj; // variante courte

    function toChannel(c, i) {
      var url = c.url || c.src || c.link || c.stream || c.stream_url || c.play || c.playurl;
      return {
        id: c.id || ('ch_' + i),
        name: c.name || c.title || c.channel || c.label || url || ('canal_' + i),
        url: url,
        logo: c.logo || c.icon || c.image || c.poster || '',
        category: c.category || c.group || c.cat || c.genre || c.type || 'Autres',
        group: c.group || c.country || '',
        type: c.type || guessType(url),
        headers: c.headers || {},
        _raw: c
      };
    }

    if (channels0.length) {
      var channels1 = [];
      for (var i = 0; i < channels0.length; i++) {
        var c0 = channels0[i];
        var hasUrl = c0 && (c0.url || c0.src || c0.link || c0.stream || c0.stream_url || c0.play || c0.playurl);
        var hasName = c0 && (c0.name || c0.title || c0.channel || c0.label);
        if (hasUrl && hasName) channels1.push(toChannel(c0, i));
      }
      return { meta: meta0, channels: channels1, categories: buildCategories(channels1, cats0) };
    }

    // 2) Méta-listes & variantes courantes
    var buckets = [];

    // a) { playlists: [ { name/title, url/link, logo, category } ] }
    if (obj && Array.isArray(obj.playlists)) {
      buckets.push({ key: 'playlists', items: obj.playlists });
    }

    // b) Objet avec tableaux par clé (catégories implicites)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      var keys = Object.keys(obj);
      var pureArrays = [];
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (Array.isArray(obj[key])) pureArrays.push([key, obj[key]]);
      }
      if (pureArrays.length && !obj.meta && !obj.channels && !obj.categories && !obj.playlists) {
        for (var p = 0; p < pureArrays.length; p++) {
          var pair = pureArrays[p];
          var keyName = pair[0];
          var arr = pair[1];
          for (var a = 0; a < arr.length; a++) {
            buckets.push({ key: keyName, items: [mergeObj(arr[a], { category: arr[a] && arr[a].category ? arr[a].category : keyName })] });
          }
        }
      }
    }

    // c) { groups/categories: [{ label/name, items|channels: [...] }] }
    var groups = obj && (obj.groups || obj.Categories || obj.categories);
    if (Array.isArray(groups)) {
      for (var g = 0; g < groups.length; g++) {
        var G = groups[g];
        var label = G.label || G.name || G.title || 'Autres';
        var items = Array.isArray(G.items) ? G.items : (Array.isArray(G.channels) ? G.channels : []);
        if (items.length) {
          buckets.push({ key: label, items: items.map(function (it) { return mergeObj(it, { category: it.category || label }); }) });
        }
      }
    }

    // d) { items | list | streams | lives }
    var generic = obj && (obj.items || obj.list || obj.streams || obj.lives);
    if (Array.isArray(generic)) buckets.push({ key: 'Autres', items: generic });

    // Normalisation
    var flat = [];
    for (var b = 0; b < buckets.length; b++) {
      var bucket = buckets[b];
      var its = bucket.items || [];
      for (var t = 0; t < its.length; t++) {
        var it = its[t];
        if (it && !it.category) it.category = bucket.key;
        flat.push(it);
      }
    }

    var channels = [];
    for (var z = 0; z < flat.length; z++) {
      var c = flat[z];
      var hasUrl2 = c && (c.url || c.src || c.link || c.stream || c.stream_url || c.play || c.playurl);
      var hasName2 = c && (c.name || c.title || c.channel || c.label);
      if (hasUrl2 && hasName2) channels.push(toChannel(c, z));
    }

    return { meta: obj && obj.meta ? obj.meta : {}, channels: channels, categories: buildCategories(channels, obj && obj.categories ? obj.categories : []) };
  }

  function mergeObj(a, b) {
    var out = {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
    for (var k2 in b) if (Object.prototype.hasOwnProperty.call(b, k2)) out[k2] = b[k2];
    return out;
  }

  // ===== Parser M3U =====
  function parseM3U(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    var cur = null;
    var attrRe = /(\w[\w-]*)="([^"]*)"/g; // tvg-id, tvg-logo, group-title, etc.

    for (var i = 0; i < lines.length; i++) {
      var line = (lines[i] || '').trim();
      if (!line) continue;
      if (line.indexOf('#EXTM3U') === 0) continue;
      if (line.indexOf('#EXTINF') === 0) {
        cur = { name: '', url: '', logo: '', group: '', category: '' };
        // Nom après la virgule
        var comma = line.indexOf(',');
        if (comma >= 0 && comma < line.length - 1) cur.name = line.slice(comma + 1).trim();
        // Attributs key="value"
        var m;
        attrRe.lastIndex = 0;
        while ((m = attrRe.exec(line)) !== null) {
          var k = (m[1] || '').toLowerCase();
          var v = m[2] || '';
          if (k === 'tvg-logo') cur.logo = v;
          if (k === 'group-title') { cur.group = v; cur.category = v; }
          if (k === 'tvg-name' && !cur.name) cur.name = v;
        }
        continue;
      }
      if (line.indexOf('#') === 0) continue; // autre commentaire

      // URL de flux
      if (cur) {
        cur.url = line;
        var type = guessType(cur.url);
        out.push({
          id: 'm3u_' + out.length,
          name: cur.name || cur.url,
          url: cur.url,
          logo: cur.logo,
          category: cur.category || 'Autres',
          group: cur.group || '',
          type: type || 'hls'
        });
        cur = null;
      }
    }
    return out;
  }

  async function loadM3UFromUrl(url) {
    try {
      var resp = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (resp.statusText || ''));
      var text = await resp.text();
      var channels = parseM3U(text);
      if (!channels.length) throw new Error('Aucun flux détecté dans la M3U');
      state.meta = { name: (url.split('/').pop() || 'M3U') };
      state.channels = channels;
      state.categories = buildCategories(channels, []);
      renderCategories();
      renderChannelLists();
      playAt(0);
    } catch (err) {
      console.error('[M3U]', err);
      alert('Chargement M3U impossible : ' + (err && err.message ? err.message : err));
    }
  }

  // ===== Rendu UI =====
  function renderCategories() {
    var opts = '';
    for (var i = 0; i < state.categories.length; i++) {
      var c = state.categories[i];
      opts += '<option value="' + c.id + '">' + c.label + '</option>';
    }
    if (el.cat) el.cat.innerHTML = opts;
    if (el.cat2) el.cat2.innerHTML = opts;
    if (el.inlineCat) el.inlineCat.innerHTML = opts;
  }

  function filterChannels() {
    var q = ((el.search && el.search.value) || (el.search2 && el.search2.value) || (el.inlineSearch && el.inlineSearch.value) || '').trim().toLowerCase();
    var cat = (el.cat && el.cat.value) || (el.cat2 && el.cat2.value) || (el.inlineCat && el.inlineCat.value) || '*';
    state.filtered = state.channels.filter(function (c) {
      var inCat = (cat === '*') || String(c.category || '').toLowerCase() === String(cat).toLowerCase();
      if (!q) return inCat;
      var hay = (c.name + ' ' + (c.group || '') + ' ' + (c.category || '') + ' ' + (c.url || '')).toLowerCase();
      return inCat && hay.indexOf(q) !== -1;
    });
  }

  function renderChannelLists() {
    filterChannels();
    function makeItem(ch, idx) {
      var logo = ch.logo ? ('<img src="' + ch.logo + '" class="me-2" alt="" style="width:24px;height:24px;object-fit:contain">') : '';
      var badge = ch.type === 'm3u-list' ? '<span class="badge text-bg-secondary ms-2">M3U</span>' : '';
      return '<button class="list-group-item list-group-item-action d-flex align-items-center" data-idx="' + idx + '">' +
             logo + '<span class="flex-grow-1 text-truncate">' + ch.name + '</span>' + badge + '</button>';
    }
    var html = state.filtered.length ? state.filtered.map(makeItem).join('') : '<div class="text-muted small p-2">Aucune chaîne</div>';
    if (el.list) el.list.innerHTML = html;
    if (el.list2) el.list2.innerHTML = html;
    if (el.inlineList) el.inlineList.innerHTML = html;

    qsa('[data-idx]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        var idx = Number(ev.currentTarget.getAttribute('data-idx'));
        playByFilteredIndex(idx);
      });
    });

    if (el.zapTitle) {
      var i = currentIndexInFiltered();
      el.zapTitle.textContent = i >= 0 ? (state.filtered[i] && state.filtered[i].name || '—') : '—';
    }
  }

  function currentIndexInFiltered() {
    var cur = state.channels[state.index];
    if (!cur) return -1;
    for (var i = 0; i < state.filtered.length; i++) {
      if (state.filtered[i].id === cur.id) return i;
    }
    return -1;
  }

  function playByFilteredIndex(idx) {
    var ch = state.filtered[idx];
    if (!ch) return;
    var realIndex = -1;
    for (var i = 0; i < state.channels.length; i++) {
      if (state.channels[i].id === ch.id) { realIndex = i; break; }
    }
    if (realIndex >= 0) playAt(realIndex);
  }

  // ===== Lecture =====
  function playAt(index) {
    var ch = state.channels[index];
    if (!ch) return;
    state.index = index;

    // Playlist M3U → on la charge et on remplace la liste par son contenu
    if (ch.type === 'm3u-list') {
      loadM3UFromUrl(ch.url);
      return;
    }

    var src = srcForPlayer(ch);

    if (vjs) {
      vjs.src(src);
      vjs.play().catch(function(){});
    } else if (el.player) {
      if (src && typeof src === 'object') el.player.src = src.src || '';
      else el.player.src = (src && src.src) || ch.url || '';
      if (el.player.play) { try { el.player.play(); } catch (e) {} }
    }

    // NOWBAR
    if (el.nowbar) el.nowbar.classList.remove('d-none');
    if (el.channelLogo) {
      if (ch.logo) { el.channelLogo.src = ch.logo; el.channelLogo.classList.remove('d-none'); }
      else { el.channelLogo.src = ''; el.channelLogo.classList.add('d-none'); }
    }
    if (el.nowPlaying) el.nowPlaying.textContent = ch.name || 'Lecture';
    if (el.nowUrl) el.nowUrl.textContent = ch.url || '';
    if (el.zapTitle) el.zapTitle.textContent = ch.name || '—';
  }

  // ===== Chargement JSON =====
  async function loadJsonFromUrl(url) {
    try {
      var resp = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + (resp.statusText || ''));
      var text = await resp.text();

      var obj;
      try {
        obj = JSON.parse(text);
      } catch (e) {
        console.error('[JSON] payload ≈', text.slice(0, 200));
        throw new Error('JSON invalide');
      }

      var parsed = parseJsonPlaylist(obj);
      state.meta = parsed.meta;
      state.channels = parsed.channels;
      state.categories = parsed.categories;

      renderCategories();
      renderChannelLists();

      if (!state.channels.length) {
        console.warn('[JSON] Zéro entrée exploitable', obj);
        alert('Le JSON est chargé, mais ne contient aucune entrée jouable (name/url manquants).');
        return;
      }
      playAt(0);
    } catch (err) {
      console.error('[JSON]', err);
      alert('Chargement JSON impossible : ' + (err && err.message ? err.message : err));
    }
  }

  // ===== Intégration UI existante =====
  function wireNav() {
    if (el.btnPrev) el.btnPrev.addEventListener('click', function () {
      var i = currentIndexInFiltered();
      var prev = i > 0 ? i - 1 : (state.filtered.length ? state.filtered.length - 1 : 0);
      playByFilteredIndex(prev);
    });
    if (el.btnNext) el.btnNext.addEventListener('click', function () {
      var i = currentIndexInFiltered();
      var next = i >= 0 ? ((i + 1) % (state.filtered.length || 1)) : 0;
      playByFilteredIndex(next);
    });

    [el.search, el.search2, el.inlineSearch].forEach(function (inp) {
      if (inp) inp.addEventListener('input', renderChannelLists);
    });
    [el.cat, el.cat2, el.inlineCat].forEach(function (sel) {
      if (sel) sel.addEventListener('change', renderChannelLists);
    });

    // Bouton "Lire" — accepte aussi une URL .json
    if (el.btnPlay) el.btnPlay.addEventListener('click', function () {
      var v = el.inputUrl && el.inputUrl.value ? el.inputUrl.value.trim() : '';
      if (!v) return;
      if (isJsonUrl(v)) loadJsonFromUrl(v);
      else {
        var ch = { id: 'single', name: v, url: v, type: guessType(v) };
        state.channels = [ch];
        state.categories = [{ id: '*', label: 'Toutes' }];
        renderCategories();
        renderChannelLists();
        playAt(0);
      }
    });
  }

  function interceptSourceButtons() {
    function handle(ev, sel) {
      var url = sel && sel.value;
      if (url && isJsonUrl(url)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        loadJsonFromUrl(url);
      }
    }
    if (el.btnLoadM3U) el.btnLoadM3U.addEventListener('click', function (ev) { handle(ev, el.sourceSel); }, true);
    if (el.btnLoadM3U2) el.btnLoadM3U2.addEventListener('click', function (ev) { handle(ev, el.sourceSel2); }, true);
  }

  // Import .json via bouton "Importer"
  var importInput = document.getElementById('importFile');
  if (importInput) {
    importInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/\.json$/i.test(file.name)) return; // laisser la logique existante gérer les backups non .json
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var obj = JSON.parse(String(reader.result || ''));
          if (Array.isArray(obj.channels) || Array.isArray(obj) || Array.isArray(obj.playlists)) {
            var parsed = parseJsonPlaylist(obj);
            state.meta = parsed.meta;
            state.channels = parsed.channels;
            state.categories = parsed.categories;
            renderCategories();
            renderChannelLists();
            if (state.channels.length) playAt(0);
          } else {
            alert('JSON valide, mais structure non reconnue (pas de channels / playlists).');
          }
        } catch (err) {
          console.error(err);
          alert('Fichier JSON invalide.');
        }
      };
      reader.readAsText(file);
    }, true);
  }

  // ===== Init =====
  wireNav();
  interceptSourceButtons();

  // API debug
  window.IPTV_JSON = {
    load: loadJsonFromUrl,
    parse: parseJsonPlaylist,
    parseM3U: parseM3U,
    loadM3U: loadM3UFromUrl,
    state: function () { 
      return {
        meta: state.meta,
        channels: state.channels.slice(),
        categories: state.categories.slice(),
        filtered: state.filtered.slice(),
        index: state.index
      };
    }
  };
})();
