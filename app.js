'use strict';
/* POD·LIST — 純前端 PWA
   資料來源：iTunes Search API（search / lookup?entity=podcastEpisode，皆有 CORS *）
   清單儲存：localStorage 為本機快取，GitHub Contents API 為跨裝置同步（token 只存本機） */

const $ = s => document.querySelector(s);
const LS_DATA = 'podlist.data', LS_GH = 'podlist.gh', LS_POS = 'podlist.pos', LS_LAST = 'podlist.last', LS_RATE = 'podlist.rate';
const ITUNES = 'https://itunes.apple.com';

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}
/* ---------- SVG 圖示（24 格；描邊跟主題的 --ic-w，.f 為實心） ---------- */
const SKIP = 'M18.9 10.05A7.5 7.5 0 1 1 12 5.5h3M12.6 2.9l2.6 2.6-2.6 2.6';
const IC = {
  play: '<path class="f" d="M8 5.5v13a1 1 0 0 0 1.53.85l10.4-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect class="f" x="6" y="4.8" width="4.6" height="14.4" rx="1.2"/><rect class="f" x="13.4" y="4.8" width="4.6" height="14.4" rx="1.2"/>',
  next: '<path class="f" d="M4.5 6.3v11.4a.9.9 0 0 0 1.4.75l8.5-5.7a.9.9 0 0 0 0-1.5L5.9 5.55a.9.9 0 0 0-1.4.75z"/><rect class="f" x="16.6" y="5" width="2.9" height="14" rx="1"/>',
  prev: '<g transform="translate(24 0) scale(-1 1)"><path class="f" d="M4.5 6.3v11.4a.9.9 0 0 0 1.4.75l8.5-5.7a.9.9 0 0 0 0-1.5L5.9 5.55a.9.9 0 0 0-1.4.75z"/><rect class="f" x="16.6" y="5" width="2.9" height="14" rx="1"/></g>',
  fwd30: `<path d="${SKIP}"/><text x="12" y="15.8" text-anchor="middle">30</text>`,
  back15: `<g transform="translate(24 0) scale(-1 1)"><path d="${SKIP}"/></g><text x="12" y="15.8" text-anchor="middle">15</text>`,
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L20 20"/>',
  list: '<path d="M4 6.5h12M4 12h9M4 17.5h6"/><path class="f" d="M15.5 13.2v6.1a.6.6 0 0 0 .92.5l4.6-3.05a.6.6 0 0 0 0-1L16.42 12.7a.6.6 0 0 0-.92.5z"/>',
  sliders: '<path d="M4 7.5h9M18.5 7.5H20M4 16.5h1.5M11 16.5h9"/><circle cx="15.8" cy="7.5" r="2.4"/><circle cx="8.2" cy="16.5" r="2.4"/>',
  chevLeft: '<path d="M14.5 5l-7 7 7 7"/>',
  chevDown: '<path d="M5 9l7 7 7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  up: '<path d="M12 19V5.5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v13.5M6 13l6 6 6-6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  star: '<path d="M12 3.8l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.82 6.9 19.5l.97-5.68L3.75 9.8l5.7-.83z"/>',
  starFill: '<path class="f" d="M12 3.8l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.82 6.9 19.5l.97-5.68L3.75 9.8l5.7-.83z"/>'
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = IC[name];              // 只吃上面的常數，不接外部字串
  return svg;
}
document.querySelectorAll('[data-ic]').forEach(el => el.prepend(icon(el.dataset.ic)));

const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const jset = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtT = s => {
  s = Math.max(0, Math.floor(s || 0));
  const hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const fmtD = iso => iso ? iso.slice(0, 10) : '';
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2200);
}

/* ---------- 資料 ---------- */
const BUILD = '6';
const emptyData = () => ({ version: 1, updatedAt: 0, shows: [], lists: [] });
const key = x => String(x && x.id);
function uniq(arr) {                    // 依 id 去重，保留先出現的
  const seen = new Set();
  return (arr || []).filter(x => x && x.id != null && !seen.has(key(x)) && seen.add(key(x)));
}
function sanitize(d) {                  // 任何進入 data 的來源（本機、匯入、GitHub）都過這一關
  d.shows = uniq(d.shows);
  d.lists = (d.lists || []).filter(l => l && l.id).map(l => (l.items = uniq(l.items), l));
  return d;
}
let data = sanitize(Object.assign(emptyData(), jget(LS_DATA, {})));
let pos = jget(LS_POS, {});            // 各單集播放位置，只存本機（避免每幾秒就 commit）

function commit() {                     // 任何清單異動後呼叫
  data.updatedAt = Date.now();
  jset(LS_DATA, data);
  schedulePush();
}

/* ---------- GitHub 同步 ---------- */
// 預設指向專用的 private repo；清單只有帳號本人讀得到
let gh = Object.assign({ owner: 'loneangle-claw', repo: 'pod-list-data', branch: 'main', path: 'playlists.json', token: '' }, jget(LS_GH, {}));
let ghSha = null, pushTimer = null, pushing = false, dirty = false;
const ghReady = () => gh.owner && gh.repo && gh.path && gh.token;
const ghUrl = () => `https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/contents/${gh.path.split('/').map(encodeURIComponent).join('/')}`;
const ghHeaders = () => ({ Authorization: `Bearer ${gh.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
const b64enc = str => {
  const b = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

function badge(state, text) { const b = $('#syncBadge'); b.className = 'badge ' + state; b.textContent = text; }
async function ghErr(r) { return new Error(`GitHub ${r.status} ${(await r.json().catch(() => ({}))).message || ''}`); }

async function ghFetchRemote() {        // 回傳 {data, sha}；檔案不存在回 {data:null, sha:null}
  const r = await fetch(`${ghUrl()}?ref=${encodeURIComponent(gh.branch)}&t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
  if (r.status === 404) return { data: null, sha: null };
  if (!r.ok) throw await ghErr(r);
  const j = await r.json();
  return { data: JSON.parse(b64dec(j.content)), sha: j.sha };
}
async function ghPut() {
  const body = { message: `pod-list: update ${new Date().toISOString()}`, content: b64enc(JSON.stringify(data, null, 1)), branch: gh.branch };
  if (ghSha) body.sha = ghSha;
  const r = await fetch(ghUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) { const e = new Error('sha'); e.conflict = true; throw e; }
  if (!r.ok) throw await ghErr(r);
  ghSha = (await r.json()).content.sha;
}
async function push() {
  if (!ghReady()) return;
  if (pushing) { dirty = true; return; }
  pushing = true; badge('busy', '同步中…');
  try {
    try { await ghPut(); }
    catch (e) {                          // sha 過期：重抓 sha 後以本機版本覆寫（last-write-wins）
      if (!e.conflict) throw e;
      ghSha = (await ghFetchRemote()).sha;
      await ghPut();
    }
    badge('ok', '已同步'); $('#ghMsg').textContent = '';
  } catch (e) { badge('err', '同步失敗'); $('#ghMsg').textContent = String(e.message || e); }
  pushing = false;
  if (dirty) { dirty = false; push(); }
}
function schedulePush() {
  if (!ghReady()) return;
  badge('busy', '待同步');
  clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500);
}
async function pull(force) {            // 遠端較新就採用遠端；本機較新（或遠端還沒有檔）就推上去
  if (!ghReady()) { badge('', '本機'); return; }
  badge('busy', '同步中…');
  try {
    const rem = await ghFetchRemote();
    ghSha = rem.sha;
    const rt = rem.data ? (rem.data.updatedAt || 0) : -1, lt = data.updatedAt || 0;
    if (rem.data && (force || rt > lt)) {
      data = sanitize(Object.assign(emptyData(), rem.data));
      jset(LS_DATA, data); renderAll();
      badge('ok', '已同步');
    } else if (lt > rt) await push();
    else badge('ok', '已同步');
    if (!$('#syncBadge').classList.contains('err')) $('#ghMsg').textContent = '';
  } catch (e) { badge('err', '同步失敗'); $('#ghMsg').textContent = String(e.message || e); }
}

/* ---------- 導覽 ---------- */
const VIEWS = ['search', 'show', 'lists', 'list', 'settings'];
const PARENT = { show: 'search', list: 'lists' };
const TITLES = { search: 'POD·LIST', lists: '我的清單', settings: '設定' };
let curView = 'search', curShow = null, curListId = null, curEpisodes = [];
function nav(v, title) {
  curView = v;
  for (const n of VIEWS) $('#view-' + n).hidden = n !== v;
  $('#btnBack').hidden = !PARENT[v];
  $('#title').textContent = title || TITLES[v] || '';
  const tab = PARENT[v] || v;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#main').scrollTop = 0;
}
$('#btnBack').onclick = () => {
  const p = PARENT[curView];
  if (p === 'lists') renderLists(); else renderMyShows();
  nav(p);
};
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  if (b.dataset.tab === 'lists') renderLists();
  if (b.dataset.tab === 'search') renderMyShows();
  nav(b.dataset.tab);
});

/* ---------- 搜尋 / 節目 ---------- */
async function itunes(path, params) {
  const r = await fetch(`${ITUNES}/${path}?${new URLSearchParams(params)}`);
  if (!r.ok) throw new Error('iTunes API ' + r.status);
  return (await r.json()).results || [];
}
const showOf = r => ({ id: r.collectionId, name: r.collectionName, artist: r.artistName || '', art: r.artworkUrl600 || r.artworkUrl100 || '' });
const epOf = (r, show) => ({
  id: r.trackId, title: r.trackName || '(無標題)', show: r.collectionName || show.name, showId: r.collectionId || show.id,
  url: (r.episodeUrl || r.previewUrl || '').replace(/^http:/, 'https:'),
  art: r.artworkUrl160 || r.artworkUrl600 || show.art, ms: r.trackTimeMillis || 0, date: r.releaseDate || ''
});

$('#country').value = localStorage.getItem('podlist.country') || 'TW';
$('#searchForm').onsubmit = async e => {
  e.preventDefault();
  const term = $('#q').value.trim();
  if (!term) return;
  localStorage.setItem('podlist.country', $('#country').value);
  const box = $('#results');
  box.replaceChildren(h('div', { class: 'empty' }, '搜尋中…'));
  $('#resultHead').hidden = false;
  try {
    const rs = await itunes('search', { term, media: 'podcast', entity: 'podcast', country: $('#country').value, limit: 40 });
    box.replaceChildren(...(rs.length ? rs.map(r => showRow(showOf(r), r.trackCount)) : [h('div', { class: 'empty' }, '找不到節目')]));
  } catch (err) { box.replaceChildren(h('div', { class: 'empty' }, '搜尋失敗：' + err.message)); }
};
function showRow(s, count) {
  return h('div', { class: 'item tap', onclick: () => openShow(s) },
    h('img', { src: s.art, loading: 'lazy', alt: '' }),
    h('div', { class: 'meta' }, h('div', { class: 't' }, s.name), h('div', { class: 's' }, s.artist + (count ? ` · ${count} 集` : ''))));
}
function renderMyShows() {
  $('#myShowsWrap').hidden = !data.shows.length;
  $('#myShows').replaceChildren(...data.shows.map(s =>
    h('button', { class: 'chip', onclick: () => openShow(s) }, h('img', { src: s.art, loading: 'lazy', alt: '' }), h('span', {}, s.name))));
}
async function openShow(s) {
  curShow = s; curEpisodes = [];
  $('#epFilter').value = '';
  nav('show', s.name); renderShowHead();
  $('#episodes').replaceChildren(h('div', { class: 'empty' }, '載入單集中…'));
  try {
    const rs = await itunes('lookup', { id: s.id, entity: 'podcastEpisode', limit: 200, country: $('#country').value });
    if (curShow !== s) return;
    curEpisodes = rs.filter(r => r.wrapperType === 'podcastEpisode').map(r => epOf(r, s)).filter(e => e.url);
    renderEpisodes();
  } catch (err) { $('#episodes').replaceChildren(h('div', { class: 'empty' }, '載入失敗：' + err.message)); }
}
function renderShowHead() {
  const s = curShow, fav = data.shows.some(x => x.id === s.id);
  const toggle = () => {
    if (fav) data.shows = data.shows.filter(x => x.id !== s.id); else data.shows.push(s);
    commit(); renderShowHead();
  };
  $('#showHead').replaceChildren(h('img', { src: s.art, alt: '' }),
    h('div', {}, h('div', { class: 't' }, s.name), h('div', { class: 's' }, s.artist),
      h('button', { class: 'btn sm', onclick: toggle }, icon(fav ? 'starFill' : 'star'), fav ? '已加入我的節目' : '加入我的節目')));
}
function visibleEpisodes() {            // 篩選後的單集，也是「全部加入」與播放佇列的範圍
  const kw = $('#epFilter').value.trim().toLowerCase();
  return kw ? curEpisodes.filter(e => e.title.toLowerCase().includes(kw)) : curEpisodes;
}
function renderEpisodes() {
  const eps = visibleEpisodes();
  const msg = curEpisodes.length ? '沒有符合的單集' : '這個節目沒有可播放的單集';
  const b = $('#btnAddAll');
  b.replaceChildren(icon('plus'), `全部${eps.length ? ' ' + eps.length : ''}`);
  b.disabled = !eps.length;
  $('#episodes').replaceChildren(...(eps.length ? eps.map(e => epRow(e, { queue: eps })) : [h('div', { class: 'empty' }, msg)]));
}
$('#epFilter').oninput = renderEpisodes;
$('#btnAddAll').onclick = () => { const eps = visibleEpisodes(); if (eps.length) pickList(eps); };

function epRow(e, { queue, listId }) {
  const sub = [listId ? e.show : null, fmtD(e.date), e.ms ? fmtT(e.ms / 1000) : null, pos[e.id] > 5 ? `已聽到 ${fmtT(pos[e.id])}` : null].filter(Boolean).join(' · ');
  const stop = fn => ev => { ev.stopPropagation(); fn(); };
  const acts = listId
    ? [h('button', { class: 'icon-btn', 'aria-label': '上移', onclick: stop(() => moveItem(listId, e.id, -1)) }, icon('up')),
       h('button', { class: 'icon-btn', 'aria-label': '下移', onclick: stop(() => moveItem(listId, e.id, 1)) }, icon('down')),
       h('button', { class: 'icon-btn', 'aria-label': '移除', onclick: stop(() => removeItem(listId, e.id)) }, icon('close'))]
    : [(() => {
        const inNames = data.lists.filter(l => l.items.some(x => key(x) === key(e))).map(l => l.name);
        return h('button', { class: 'icon-btn add' + (inNames.length ? ' in' : ''), 'aria-label': '加入清單', title: inNames.length ? '已在：' + inNames.join('、') : '加入清單', onclick: stop(() => pickList(e)) }, icon(inNames.length ? 'check' : 'plus'));
      })()];
  const isNow = nowEp() && nowEp().id === e.id;
  return h('div', { class: 'item tap' + (isNow ? ' now' : ''), 'data-ep': e.id, onclick: () => playQueue(queue, queue.indexOf(e)) },
    h('span', { class: 'idx' }, String(queue.indexOf(e) + 1)),
    h('img', { src: e.art, loading: 'lazy', alt: '' }),
    h('div', { class: 'meta' }, h('div', { class: 't' }, e.title), h('div', { class: 's' }, sub)),
    h('div', { class: 'acts' }, acts));
}

/* ---------- 清單 ---------- */
const getList = id => data.lists.find(l => l.id === id);
function renderLists() {
  const rows = data.lists.map(l => {
    const total = l.items.reduce((a, e) => a + (e.ms || 0), 0) / 1000;
    return h('div', { class: 'item tap', onclick: () => openList(l.id) },
      h('img', { src: (l.items[0] || {}).art || 'icon-192.png', alt: '' }),
      h('div', { class: 'meta' }, h('div', { class: 't' }, l.name), h('div', { class: 's' }, `${l.items.length} 集` + (total ? ` · ${fmtT(total)}` : ''))));
  });
  $('#lists').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, '還沒有清單，先在上面建立一個')]));
}
function openList(id) {
  const l = getList(id);
  if (!l) return;
  curListId = id; nav('list', l.name); renderListItems();
}
function renderListItems() {
  const l = getList(curListId);
  if (!l) return;
  const rows = l.items.map(e => epRow(e, { queue: l.items, listId: l.id }));
  $('#listItems').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, '清單是空的，到「搜尋」找節目，按單集右邊的 ＋ 加進來')]));
}
function createList(name) {
  name = (name || '').trim();
  if (!name) return null;
  const l = { id: uid(), name, items: [] };
  data.lists.push(l); commit();
  return l;
}
$('#btnNewList').onclick = () => { if (createList($('#newListName').value)) { $('#newListName').value = ''; renderLists(); } };
$('#newListName').onkeydown = e => { if (e.key === 'Enter') $('#btnNewList').click(); };
$('#btnRename').onclick = () => openSheet('清單改名', body => {
  const l = getList(curListId), inp = h('input', { type: 'text', value: l.name, maxlength: 40 });
  const ok = () => { const v = inp.value.trim(); if (v) { l.name = v; commit(); $('#title').textContent = v; } closeSheet(); };
  body.append(inp, h('div', { class: 'row', style: 'margin:12px 0 0' },
    h('button', { class: 'btn primary', onclick: ok }, '確定'), h('button', { class: 'btn', onclick: closeSheet }, '取消')));
});
$('#btnClearList').onclick = () => openSheet('清空這個清單的單集？', body => {
  const clear = () => { getList(curListId).items = []; commit(); closeSheet(); renderListItems(); };
  body.append(h('div', { class: 'row', style: 'margin:0' },
    h('button', { class: 'btn danger', onclick: clear }, '清空'), h('button', { class: 'btn', onclick: closeSheet }, '取消')));
});
$('#btnDelList').onclick = () => openSheet('刪除這個清單？', body => {
  const del = () => { data.lists = data.lists.filter(l => l.id !== curListId); commit(); closeSheet(); renderLists(); nav('lists'); };
  body.append(h('div', { class: 'row', style: 'margin:0' },
    h('button', { class: 'btn danger', onclick: del }, '刪除'), h('button', { class: 'btn', onclick: closeSheet }, '取消')));
});
$('#btnPlayAll').onclick = () => { const l = getList(curListId); if (l && l.items.length) playQueue(l.items, 0, true); };
function moveItem(listId, epId, d) {
  const it = getList(listId).items, i = it.findIndex(e => e.id === epId), j = i + d;
  if (j < 0 || j >= it.length) return;
  [it[i], it[j]] = [it[j], it[i]];
  commit(); renderListItems();
}
function removeItem(listId, epId) {
  const l = getList(listId);
  l.items = l.items.filter(e => e.id !== epId);
  commit(); renderListItems();
}
function addTo(l, eps) {                 // eps 可以是一集或一整批
  const list = uniq([].concat(eps));     // 先把這批自己的重複去掉
  const have = new Set(l.items.map(key)); // 再擋掉清單裡已經有的
  const fresh = list.filter(e => !have.has(key(e)));
  if (!fresh.length) return toast(list.length > 1 ? `這 ${list.length} 集都已在「${l.name}」裡` : `「${l.name}」裡已經有這集`);
  l.items.push(...fresh); commit();
  const dup = list.length - fresh.length;
  toast(`已加入「${l.name}」${fresh.length} 集` + (dup ? `（略過 ${dup} 集重複）` : ''));
  if (curView === 'show') renderEpisodes();   // 讓 ＋ 立刻變成 ✓
}
function pickList(eps) {
  const n = [].concat(eps).length;
  openSheet(n > 1 ? `把 ${n} 集加入清單` : '加入清單', body => {
    for (const l of data.lists)
      body.append(h('button', { class: 'opt', onclick: () => { addTo(l, eps); closeSheet(); } }, l.name + ' ', h('small', {}, `${l.items.length} 集`)));
    const inp = h('input', { type: 'text', placeholder: '或建立新清單…', maxlength: 40 });
    const mk = () => { const l = createList(inp.value); if (l) { addTo(l, eps); closeSheet(); } };
    body.append(h('div', { class: 'row', style: 'margin:4px 0 0' }, inp, h('button', { class: 'btn primary', onclick: mk }, '建立並加入')));
  });
}
function openSheet(title, build) {
  const b = $('#sheetBody');
  b.replaceChildren(h('h3', {}, title));
  build(b);
  $('#sheet').showModal();
}
function closeSheet() { $('#sheet').close(); }
$('#sheet').addEventListener('click', e => { if (e.target === $('#sheet')) closeSheet(); });

/* ---------- 播放器（迷你列 + 全螢幕播放畫面） ---------- */
const audio = $('#audio');
let queue = [], qi = -1, seeking = false, lastSave = 0;
const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];
let rate = Number(localStorage.getItem(LS_RATE)) || 1;
function nowEp() { return queue[qi]; }
const bigArt = u => (u || '').replace(/\/\d+x\d+bb\./, '/600x600bb.');
const dur = () => isFinite(audio.duration) && audio.duration ? audio.duration : (nowEp() ? nowEp().ms / 1000 : 0);

function setPlayIcons() {
  document.querySelectorAll('.js-play').forEach(b => b.replaceChildren(icon(audio.paused ? 'play' : 'pause')));
}
function paintProgress(pct) {
  if (pct == null) { const d = dur(); pct = d ? Math.min(100, audio.currentTime / d * 100) : 0; }
  $('#seek').style.setProperty('--p', pct + '%');
  $('#pBar').style.setProperty('--p', pct + '%');
}
function loadEp(autoplay) {
  const e = nowEp();
  if (!e) return;
  $('#player').hidden = false;
  $('#pArt').src = e.art; $('#pTitle').textContent = e.title; $('#pSub').textContent = e.show;
  $('#npArt').src = bigArt(e.art); $('#npTitle').textContent = e.title; $('#npSub').textContent = e.show;
  document.documentElement.style.setProperty('--art', `url("${bigArt(e.art).replace(/["\\]/g, '')}")`);
  $('#pRate').textContent = rate + '×';
  audio.src = e.url;
  const p = pos[e.id] || 0;
  audio.addEventListener('loadedmetadata', () => {
    if (p > 10 && (!isFinite(audio.duration) || p < audio.duration - 30)) audio.currentTime = p;
    audio.playbackRate = rate;
  }, { once: true });
  if (autoplay) audio.play().catch(err => { if (err.name !== 'AbortError') toast('無法播放這一集'); });
  jset(LS_LAST, { queue, qi });
  setPlayIcons(); paintProgress(0); markNow(); mediaSession(e);
}
function playQueue(q, i, restart) {
  if (i < 0 || !q[i]) return;
  const same = !restart && nowEp() && nowEp().id === q[i].id;
  queue = q.slice(); qi = i;
  if (same) { audio.paused ? audio.play() : audio.pause(); jset(LS_LAST, { queue, qi }); return; }
  savePos(); loadEp(true);
}
function step(d) {
  const j = qi + d;
  if (j < 0 || j >= queue.length) return false;
  savePos(); qi = j; loadEp(true);
  return true;
}
function markNow() {
  document.querySelectorAll('.item[data-ep]').forEach(el => el.classList.toggle('now', !!nowEp() && el.dataset.ep === String(nowEp().id)));
}
function savePos() {
  const e = nowEp();
  if (!e || !audio.currentTime) return;
  pos[e.id] = Math.floor(audio.currentTime);
  jset(LS_POS, pos);
}

const toggle = () => audio.paused ? audio.play() : audio.pause();
const skip = s => audio.currentTime = Math.max(0, Math.min(audio.duration || 1e9, audio.currentTime + s));
$('#pBack').append(icon('back15')); $('#pFwd').append(icon('fwd30')); $('#pFwdMini').append(icon('fwd30'));
document.querySelectorAll('.js-play').forEach(b => b.onclick = toggle);
$('#pBack').onclick = () => skip(-15);
$('#pFwd').onclick = $('#pFwdMini').onclick = () => skip(30);
$('#pPrev').onclick = () => { if (audio.currentTime > 5 || !step(-1)) audio.currentTime = 0; };
$('#pNext').onclick = () => step(1);
$('#pRate').onclick = () => {
  rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
  audio.playbackRate = rate; $('#pRate').textContent = rate + '×';
  localStorage.setItem(LS_RATE, rate);
};
$('#pOpen').onclick = () => $('#np').hidden = false;
$('#npClose').onclick = () => $('#np').hidden = true;
$('#npAdd').onclick = () => { if (nowEp()) pickList(nowEp()); };
audio.onplay = audio.onpause = () => { setPlayIcons(); if (audio.paused) savePos(); };
audio.onended = () => {
  const e = nowEp();
  if (e) { delete pos[e.id]; jset(LS_POS, pos); }
  step(1);
};
audio.onerror = () => { if (audio.getAttribute('src')) toast('音檔載入失敗'); };
audio.ontimeupdate = () => {
  const d = dur();
  if (!seeking) { $('#seek').value = d ? audio.currentTime / d * 1000 : 0; paintProgress(); }
  $('#tCur').textContent = fmtT(audio.currentTime);
  $('#tRem').textContent = '-' + fmtT(Math.max(0, d - audio.currentTime));
  if (Date.now() - lastSave > 5000) { lastSave = Date.now(); savePos(); }
};
$('#seek').oninput = () => { seeking = true; paintProgress($('#seek').value / 10); };
$('#seek').onchange = () => {
  const d = audio.duration;
  if (isFinite(d) && d) audio.currentTime = $('#seek').value / 1000 * d;
  seeking = false;
};
addEventListener('pagehide', savePos);
setPlayIcons();

function mediaSession(e) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: e.title, artist: e.show, artwork: e.art ? [{ src: bigArt(e.art), sizes: '600x600' }] : [] });
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch {} };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('seekbackward', () => skip(-15));
  set('seekforward', () => skip(30));
  set('previoustrack', () => $('#pPrev').click());
  set('nexttrack', () => $('#pNext').click());
}

/* ---------- 外觀主題 ---------- */
const THEMES = { glass: '#0b0b0f', pop: '#FFF1DC', print: '#F3EEE3' };
function setTheme(t) {
  if (!THEMES[t]) t = 'glass';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('podlist.theme', t); } catch {}
  document.querySelector('meta[name=theme-color]').content = THEMES[t];
  document.querySelectorAll('[data-set-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.setTheme === t)));
}
document.querySelectorAll('[data-set-theme]').forEach(b => b.onclick = () => setTheme(b.dataset.setTheme));
setTheme(document.documentElement.dataset.theme);
// dock 高度隨主題與迷你播放器出現而變，內容區的下緣留白跟著它
new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', $('#dock').offsetHeight + 'px')).observe($('#dock'));

/* ---------- 設定 ---------- */
function fillGh() {
  $('#ghOwner').value = gh.owner; $('#ghRepo').value = gh.repo; $('#ghBranch').value = gh.branch;
  $('#ghPath').value = gh.path; $('#ghToken').value = gh.token;
}
function readGh() {
  gh = {
    owner: $('#ghOwner').value.trim(), repo: $('#ghRepo').value.trim(), branch: $('#ghBranch').value.trim() || 'main',
    path: $('#ghPath').value.trim().replace(/^\/+/, '') || 'playlists.json', token: $('#ghToken').value.trim()
  };
  jset(LS_GH, gh); ghSha = null;
}
const ghDone = msg => { if (!$('#syncBadge').classList.contains('err')) $('#ghMsg').textContent = msg; };
$('#btnSaveGh').onclick = async () => {
  readGh();
  if (!ghReady()) { $('#ghMsg').textContent = 'owner / repo / token 都要填'; return; }
  await pull(false); ghDone('同步完成');
};
$('#btnPull').onclick = async () => { readGh(); if (!ghReady()) return; await pull(true); ghDone('已用 GitHub 上的版本覆蓋本機'); };
$('#btnPush').onclick = async () => {
  readGh();
  if (!ghReady()) return;
  try { ghSha = (await ghFetchRemote()).sha; } catch {}
  await push(); ghDone('已上傳');
};
$('#btnExport').onclick = () => {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: 'pod-list-backup.json' });
  a.click(); URL.revokeObjectURL(a.href);
};
$('#btnImport').onclick = () => $('#fileImport').click();
$('#fileImport').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!Array.isArray(j.lists)) throw 0;
    data = sanitize(Object.assign(emptyData(), j)); commit(); renderAll(); toast('已匯入');
  } catch { toast('檔案格式不對'); }
  e.target.value = '';
};

/* ---------- 啟動 ---------- */
function renderAll() {
  renderMyShows(); renderLists();
  if (curView === 'list') { if (getList(curListId)) renderListItems(); else nav('lists'); }
}
fillGh(); renderAll();
const last = jget(LS_LAST, null);
if (last && last.queue && last.queue[last.qi]) { queue = last.queue; qi = last.qi; loadEp(false); }
pull(false);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !pushing && audio.paused) pull(false); });
/* 鎖住縮放：viewport 的 user-scalable=no 在 iOS Safari 分頁模式會被忽略（加到主畫面才生效），
   所以再補擋 iOS 專有的 gesture 事件；雙擊放大則由 CSS 的 touch-action:manipulation 處理。 */
for (const t of ['gesturestart', 'gesturechange', 'gestureend'])
  document.addEventListener(t, e => e.preventDefault(), { passive: false });

/* 版本與更新：GitHub Pages 的 max-age=600 會讓 HTML 與 JS 版本錯開，
   所以 index.html 以 ?v= 綁版本，並在偵測到新的 service worker 接手時自動重載一次。 */
$('#ver').textContent = BUILD;
$('#btnReload').onclick = async () => {
  try {
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } catch {}
  location.replace(location.pathname + '?r=' + Date.now());
};
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
}
