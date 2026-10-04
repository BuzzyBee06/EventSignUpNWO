const KEY = 'eventSignupData';
const STATUS = { full: 'Full', added: 'Full (extra)', subSure: 'Sub (sure)', subUnsure: 'Sub (unsure)', subExtra: 'Sub (extra)', wanted: 'Wanted, no space' };
const CLS = { full: 'f', added: 'a', subSure: 's', subUnsure: 'u', subExtra: 'a', withdrew: 'x', abstain: 'x', wanted: 'w' };
const ATT = { showed: 'Showed', noshow: 'No-show', locked: 'Locked out', excused: 'Excused' };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const rankOf = p => p.rank || (p.r4 ? 'R4' : '');
const rankVal = p => ({ R5: 2, R4: 1 }[rankOf(p)] || 0);

let data = load();
(function migrateOrder() {
  let changed = false;
  let next = data.players.reduce((m, p) => Math.max(m, p.order || 0), 0) + 1;
  [...data.players].sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
    if (p.order === undefined) { p.order = next++; changed = true; }
  });
  if (changed) localStorage.setItem(KEY, JSON.stringify(data));
})();
function nextOrder() { return data.players.reduce((m, p) => Math.max(m, p.order || 0), 0) + 1; }

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { players: [], events: [] }; }
  catch (e) { return { players: [], events: [] }; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(data)); render(); }

function points(e) {
  const firm = e.status === 'full' || e.status === 'subSure';
  const soft = e.status === 'subUnsure' || e.status === 'added' || e.status === 'subExtra';
  if (!firm && !soft) return null;
  if (e.att === 'showed') return 1;
  if (!firm) return null;
  if (e.att === 'noshow') return 0;
  if (e.att === 'locked') return e.status === 'full' ? 0.5 : null;
  return null;
}
function lastWindow(pid, n) {
  const evs = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  const recent = evs.slice(-n);
  const pts = [], rows = [], missed = [];
  recent.forEach(ev => {
    const e = ev.entries[pid];
    if (!e || !e.status) { missed.push(ev); return; }
    const p = points(e);
    if (p !== null) pts.push(p);
    rows.push({ date: ev.date, type: ev.type, legion: e.legion, status: e.status, att: e.att, pts: p });
  });
  return { pts, missed, rows };
}
function scores(pid) {
  const list = [];
  [...data.events].sort((a, b) => a.date.localeCompare(b.date)).forEach(ev => {
    const e = ev.entries[pid];
    const p = e ? points(e) : null;
    if (p !== null) list.push(p);
  });
  return list;
}
function pct(list) {
  return list.length ? Math.round(100 * list.reduce((a, b) => a + b, 0) / list.length) + '%' : '-';
}
const cnt = (list, missed) => `<small class="cnt">${list.length} event${list.length === 1 ? '' : 's'}${missed ? `, no sign-up &times;${missed}` : ''}</small>`;
function tip(list, missed) {
  if (!list.length) return missed ? `No sign-ups in this window (${missed} event${missed === 1 ? '' : 's'})` : 'No events counted yet';
  const n = k => list.filter(x => x === k).length;
  return `Based on ${list.length} event${list.length === 1 ? '' : 's'}: ${n(1)} showed, ${n(0)} no-show` + (n(0.5) ? `, ${n(0.5)} locked out (half credit)` : '') + (missed ? `. No sign-up for ${missed} of the last 5 events (not held against them).` : '');
}
function decayedReliability(pid) {
  let wSum = 0, pSum = 0, k = 0;
  [...data.events].sort((a, b) => b.date.localeCompare(a.date)).forEach(ev => {
    const e = ev.entries[pid];
    const pts = e ? points(e) : null;
    if (pts === null) return;
    const w = Math.pow(0.85, k); k++;
    wSum += w; pSum += w * pts;
  });
  return wSum ? pSum / wSum : null;
}
function performanceDiff(pid) {
  const marks = performance(pid);
  return marks.filter(m => m.mark === 'star').length - marks.filter(m => m.mark === 'flag').length;
}
function performanceScore(pid) {
  return Math.min(1, Math.max(0, 0.5 + 0.15 * performanceDiff(pid)));
}
function blendScore(pid) {
  const rel = decayedReliability(pid);
  return 0.7 * (rel === null ? 0.5 : rel) + 0.3 * performanceScore(pid);
}
function bumpStreak(pid) {
  let streak = 0;
  for (const ev of [...data.events].sort((a, b) => b.date.localeCompare(a.date))) {
    const e = ev.entries[pid];
    if (!e || !e.status) continue;
    if (e.status === 'subSure') streak++; else break;
  }
  return streak;
}
function suggestOversubscribed(evId, legion, count) {
  const ev = data.events.find(x => x.id === evId);
  const inLegion = Object.entries(ev.entries).filter(([, e]) => e.legion === legion && ['full', 'added', 'subSure', 'subUnsure', 'subExtra'].includes(e.status));
  const cand = inLegion.map(([pid, e]) => data.players.find(p => p.id === pid)).filter(p => p && !rankOf(p));
  const withInfo = cand.map(p => ({ p, score: blendScore(p.id), streak: bumpStreak(p.id), status: ev.entries[p.id].status }));
  const byScore = (a, b) => (a.score - b.score) || (performanceDiff(a.p.id) - performanceDiff(b.p.id)) || (b.p.order - a.p.order);
  const extras = withInfo.filter(x => x.status === 'added' || x.status === 'subExtra').sort(byScore);
  const unsure = withInfo.filter(x => x.status === 'subUnsure').sort(byScore);
  const sure = withInfo.filter(x => x.status === 'full' || x.status === 'subSure');
  const notStreaked = sure.filter(x => x.streak < 3).sort(byScore);
  const streaked = sure.filter(x => x.streak >= 3).sort(byScore);
  const pool = [...extras, ...unsure, ...notStreaked, ...streaked];
  return pool.slice(0, count);
}
function suggestUndersubscribed(evId, legion, count) {
  const ev = data.events.find(x => x.id === evId);
  const other = legion === 'L1' ? 'L2' : 'L1';
  const already = new Set(Object.keys(ev.entries).filter(pid => ev.entries[pid].status && ev.entries[pid].legion === legion));
  const active = data.players.filter(p => !p.left);
  const wanted = active.filter(p => { const e = ev.entries[p.id]; return e && e.status === 'wanted' && e.legion === legion; });
  const flexOther = active.filter(p => { const e = ev.entries[p.id]; return e && e.legion === other && e.flex && deployed(e.status); });
  const untouched = active.filter(p => { const e = ev.entries[p.id]; return !e || !e.status; });
  const score = p => ({ p, score: blendScore(p.id) });
  const sortDesc = (a, b) => (b.score - a.score) || (performanceDiff(b.p.id) - performanceDiff(a.p.id)) || (a.p.order - b.p.order);
  const pool = [
    ...wanted.map(score).sort(sortDesc),
    ...flexOther.map(score).sort(sortDesc),
    ...untouched.map(score).sort(sortDesc)
  ].filter(x => !already.has(x.p.id));
  const picked = pool.slice(0, count);
  picked.forEach(x => { x.vacates = flexOther.includes(x.p) ? other : null; });
  return picked;
}
function performance(pid) {
  const out = [];
  [...data.events].sort((a, b) => a.date.localeCompare(b.date)).forEach(ev => {
    const e = ev.entries[pid];
    if (e && e.mark && deployed(e.status)) out.push({ date: ev.date, type: ev.type, mark: e.mark, comment: e.comment || '' });
  });
  return out;
}
function counts(ev) {
  const c = { L1: { f: 0, s: 0, r4: 0 }, L2: { f: 0, s: 0, r4: 0 } };
  for (const [pid, e] of Object.entries(ev.entries)) {
    const g = c[e.legion];
    if (!g) continue;
    if (e.status === 'full' || e.status === 'added') g.f++;
    else if (e.status === 'subSure' || e.status === 'subUnsure' || e.status === 'subExtra') g.s++;
    const p = data.players.find(x => x.id === pid);
    if (p && rankOf(p) && e.status !== 'withdrew' && e.status !== 'abstain') g.r4++;
  }
  return c;
}
function signupOptions(cur) {
  let h = '<option value=""></option>';
  ['L1', 'L2'].forEach(l => Object.keys(STATUS).forEach(s => {
    const v = l + '|' + s;
    h += `<option value="${v}"${cur === v ? ' selected' : ''}>${l} ${STATUS[s]}</option>`;
  }));
  return h + `<option value="L1|withdrew"${cur === 'L1|withdrew' ? ' selected' : ''}>Withdrew</option>`
    + `<option value="L1|abstain"${cur === 'L1|abstain' ? ' selected' : ''}>Abstention</option>`
    + ['L1', 'L2'].map(l => { const v = l + '|wanted'; return `<option value="${v}"${cur === v ? ' selected' : ''}>${l} Wanted, no space</option>`; }).join('');
}
const deployed = st => ['full','added','subSure','subUnsure','subExtra'].includes(st);
function attOptions(cur) {
  return '<option value=""></option>' + Object.keys(ATT).map(k => `<option value="${k}"${cur === k ? ' selected' : ''}>${ATT[k]}</option>`).join('');
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const showFormer = $('showFormer').checked;
  const events = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  const players = data.players
    .filter(p => showFormer || !p.left)
    .filter(p => !q || [p.name, p.id, ...p.oldNames].some(x => String(x).toLowerCase().includes(q)))
    .sort((a, b) => (Number(!!a.left) - Number(!!b.left)) || (rankVal(b) - rankVal(a)) || (a.order - b.order));
  const activeCount = data.players.filter(p => !p.left).length;

  let h = '<colgroup><col style="width:150px"><col style="width:70px"><col style="width:70px"><col style="width:60px">'
    + events.map(() => '<col style="width:100px"><col style="width:100px">').join('') + '</colgroup>';
  h += `<thead><tr><th class="p1">Player <span class="${activeCount > 100 ? 'bad' : ''}">(${activeCount} active)</span></th><th class="p2">All time</th><th class="p3">Last 5</th><th class="p4">Perf.</th>`;
  events.forEach(ev => {
    const c = counts(ev);
    const line = l => {
      const g = c[l], t = l === 'L1' ? ev.t1 : ev.t2;
      const over = g.f > 30 || g.s > 10;
      return `<span class="${over ? 'bad' : ''}">${l} ${t}: ${g.f}/30 full, ${g.s}/10 sub</span> <span class="${g.r4 ? '' : 'bad'}">R4/R5: ${g.r4}</span>`;
    };
    h += `<th colspan="2" class="evStart evCol"><span class="editEvent" data-e="${ev.id}" title="Click to edit this event">${esc(ev.type)}<br>${ev.date}</span><br>${line('L1')}<br>${line('L2')}<br><button type="button" class="exportEvBtn" data-e="${ev.id}">Export list</button> <button type="button" class="suggestEvBtn" data-e="${ev.id}">Suggestions</button></th>`;
  });
  h += '</tr></thead><tbody>';
  let dividerShown = false;
  players.forEach(p => {
    if (p.left && !dividerShown && players.some(x => !x.left)) {
      dividerShown = true;
      h += `<tr><td colspan="${4 + events.length * 2}" style="background:#f2f2f2;font-size:11px;color:#777;text-align:center;padding:4px">Former players</td></tr>`;
    }
    const s = scores(p.id);
    const l5 = lastWindow(p.id, 5);
    const perf = performance(p.id);
    const peers = players.filter(x => !x.left === !p.left && rankVal(x) === rankVal(p));
    const idxInPeers = peers.indexOf(p);
    const upBtn = `<button type="button" class="orderBtn" data-id="${esc(p.id)}" data-dir="up"${idxInPeers === 0 ? ' disabled' : ''} title="Move up">&uarr;</button>`;
    const downBtn = `<button type="button" class="orderBtn" data-id="${esc(p.id)}" data-dir="down"${idxInPeers === peers.length - 1 ? ' disabled' : ''} title="Move down">&darr;</button>`;
    h += `<tr><td class="p1"><span class="orderBtns">${upBtn}${downBtn}</span><span class="editName" data-id="${esc(p.id)}" title="Click for player details">${esc(p.name)}</span>${rankOf(p) ? '<span class="tag">' + rankOf(p) + '</span>' : ''}${p.left ? '<span class="tag">left</span>' : ''}<span class="id">${esc(p.id)}</span></td>`;
    h += `<td class="p2 scoreLink" data-id="${esc(p.id)}" data-scope="all" title="${tip(s)}">${pct(s)}${cnt(s)}</td><td class="p3 scoreLink" data-id="${esc(p.id)}" data-scope="last5" title="${tip(l5.pts, l5.missed.length)}">${pct(l5.pts)}${cnt(l5.pts, l5.missed.length)}</td>`;
    h += `<td class="p4 perfLink" data-id="${esc(p.id)}" title="Click for performance notes">${perf.length ? perf.map(x => x.mark === 'star' ? '★' : '⚑').join(' ') : '<span style="color:#aaa">-</span>'}</td>`;
    events.forEach(ev => {
      const e = ev.entries[p.id] || {};
      const cur = e.status ? (e.legion || 'L1') + '|' + e.status : '';
      h += `<td class="${CLS[e.status] || ''} evStart evCol"><select data-p="${esc(p.id)}" data-e="${ev.id}" data-k="su">${signupOptions(cur)}</select><button type="button" class="flexBtn${e.flex ? ' on' : ''}" data-p="${esc(p.id)}" data-e="${ev.id}" title="Happy to swap legion for this event">flex</button></td>`;
      const ac = e.att === 'showed' ? 'ok' : e.att === 'noshow' ? 'no' : e.att ? 'x' : '';
      const canAtt = deployed(e.status);
      const markIcon = e.mark === 'star' ? '★' : e.mark === 'flag' ? '⚑' : '+';
      const markCls = 'markBtn' + (e.mark ? ' has-' + e.mark : '') + (e.comment ? ' has-comment' : '');
      const markBtn = canAtt
        ? `<button type="button" class="${markCls}" data-p="${esc(p.id)}" data-e="${ev.id}" title="${e.comment ? esc(e.comment) : 'Add a star or flag'}">${markIcon}</button>`
        : `<button type="button" class="markBtn" disabled title="Only available once a player is signed up or added">${markIcon}</button>`;
      h += `<td class="${ac} evCol"><select data-p="${esc(p.id)}" data-e="${ev.id}" data-k="att"${canAtt ? '' : ' disabled title="Only available once a player is signed up or added"'}>${attOptions(canAtt ? (e.att || '') : '')}</select>${markBtn}</td>`;
    });
    h += '</tr>';
  });
  $('grid').innerHTML = h + '</tbody>';
}

$('grid').addEventListener('focusin', ev => {
  if (ev.target.tagName !== 'SELECT') return;
  document.querySelectorAll('#grid tr.editing').forEach(tr => tr.classList.remove('editing'));
  ev.target.closest('tr').classList.add('editing');
  ev.target.classList.add('activeCell');
});
$('grid').addEventListener('focusout', ev => {
  if (ev.target.tagName !== 'SELECT') return;
  ev.target.classList.remove('activeCell');
});
$('grid').addEventListener('change', ev => {
  const t = ev.target;
  if (!t.dataset.k) return;
  const event = data.events.find(x => x.id === t.dataset.e);
  const e = event.entries[t.dataset.p] || (event.entries[t.dataset.p] = {});
  if (t.dataset.k === 'su') {
    const [legion, status] = t.value ? t.value.split('|') : ['', ''];
    e.legion = legion; e.status = status;
    if (!deployed(status)) { e.att = ''; e.mark = ''; e.comment = ''; }
  } else e.att = t.value;
  save();
});

$('search').addEventListener('input', render);
$('showFormer').addEventListener('change', render);
$('showPlayer').onclick = () => { $('playerForm').hidden = !$('playerForm').hidden; };

function openModal(html) { $('modalBox').innerHTML = html; $('modalOverlay').hidden = false; }
function closeModal() { $('modalOverlay').hidden = true; $('modalBox').innerHTML = ''; }
$('modalOverlay').addEventListener('click', ev => { if (ev.target.id === 'modalOverlay') closeModal(); });

function playerModalHtml(p) {
  const chips = p.oldNames.map((n, i) => `<span class="oldNameChip">${esc(n)}<button data-rm="${i}" title="Remove">&times;</button></span>`).join('') || '<span style="color:#888;font-size:12px">None recorded</span>';
  return `<h2>Player details</h2>
    <div class="row"><label>Name <input id="mName" value="${esc(p.name)}"></label></div>
    <div class="row"><label>Rank
      <select id="mRank"><option value=""${!rankOf(p) ? ' selected' : ''}>Other</option><option${rankOf(p) === 'R4' ? ' selected' : ''}>R4</option><option${rankOf(p) === 'R5' ? ' selected' : ''}>R5</option></select>
    </label><span style="color:#888;font-size:12px">ID ${esc(p.id)}</span></div>
    <div class="row"><label><input type="checkbox" id="mLeft"${p.left ? ' checked' : ''}> No longer in alliance</label></div>
    <div><strong style="font-size:12px">Past names</strong><div id="mOldNames">${chips}</div></div>
    <div class="row"><input id="mAddOld" placeholder="Add a past name"><button id="mAddOldBtn" type="button">Add</button></div>
    <div class="modal-actions"><button id="mCancel" type="button">Cancel</button><button id="mSave" type="button">Save</button></div>`;
}
function openPlayerModal(p) {
  openModal(playerModalHtml(p));
  const oldNames = [...p.oldNames];
  $('mAddOldBtn').onclick = () => {
    const v = $('mAddOld').value.trim();
    if (v) { oldNames.push(v); $('mOldNames').innerHTML = oldNames.map((n, i) => `<span class="oldNameChip">${esc(n)}<button data-rm="${i}">&times;</button></span>`).join('') || '<span style="color:#888;font-size:12px">None recorded</span>'; $('mAddOld').value = ''; }
  };
  $('mOldNames').addEventListener('click', ev => {
    const b = ev.target.closest('[data-rm]');
    if (!b) return;
    oldNames.splice(Number(b.dataset.rm), 1);
    $('mOldNames').innerHTML = oldNames.map((n, i) => `<span class="oldNameChip">${esc(n)}<button data-rm="${i}">&times;</button></span>`).join('') || '<span style="color:#888;font-size:12px">None recorded</span>';
  });
  $('mCancel').onclick = closeModal;
  $('mSave').onclick = () => {
    p.name = $('mName').value.trim() || p.name;
    p.rank = $('mRank').value;
    p.left = $('mLeft').checked;
    p.oldNames = oldNames;
    save(); closeModal();
  };
}
function scoreModalHtml(p, list, scope) {
  const rows = list.map(r => `<tr><td>${r.date}</td><td>${esc(r.type)}</td><td>${r.legion || ''}</td><td>${STATUS[r.status] || r.status}</td><td>${ATT[r.att] || (r.status === 'withdrew' ? 'Withdrew' : r.status === 'abstain' ? 'Abstention' : r.status === 'wanted' ? 'Wanted, no space' : '')}</td><td>${r.pts === null ? 'not counted' : r.pts}</td></tr>`).join('');
  return `<h2>${esc(p.name)} &mdash; ${scope === 'last5' ? 'last 5 counted events' : 'all events'}</h2>
    <table><tr><th>Date</th><th>Event</th><th>Legion</th><th>Sign-up</th><th>Attendance</th><th>Score</th></tr>${rows || '<tr><td colspan="6">No events yet</td></tr>'}</table>
    <div class="modal-actions"><button id="mClose" type="button">Close</button></div>`;
}
function openScoreModal(p, scope) {
  let rows = [...data.events].sort((a, b) => a.date.localeCompare(b.date)).map(ev => {
    const e = ev.entries[p.id];
    if (!e || !e.status) return null;
    return { date: ev.date, type: ev.type, legion: e.legion, status: e.status, att: e.att, pts: points(e) };
  }).filter(Boolean);
  const counted = rows.filter(r => r.pts !== null);
  if (scope === 'last5') rows = counted.slice(-5).length ? rowsForLast5(rows) : [];
  openModal(scoreModalHtml(p, rows, scope));
  $('mClose').onclick = closeModal;
}
function rowsForLast5(rows) {
  const out = [];
  for (let i = rows.length - 1; i >= 0 && out.length < 5; i--) if (rows[i].pts !== null) out.unshift(rows[i]);
  return out;
}
function markModalHtml(p, ev, e) {
  const opt = (v, label) => `<label><input type="radio" name="mMark" value="${v}"${(e.mark || '') === v ? ' checked' : ''}> ${label}</label>`;
  return `<h2>${esc(p.name)} &mdash; ${esc(ev.type)} (${ev.date})</h2>
    <div class="row">${opt('', 'None')}${opt('star', '★ Star')}${opt('flag', '⚑ Flag')}</div>
    <div class="row" style="flex-direction:column;align-items:stretch"><label>Comment (optional)</label>
    <textarea id="mComment" rows="3" style="width:100%">${esc(e.comment || '')}</textarea></div>
    <div class="modal-actions"><button id="mCancel" type="button">Cancel</button><button id="mSave" type="button">Save</button></div>`;
}
function openMarkModal(pid, eid) {
  const p = data.players.find(x => x.id === pid);
  const ev = data.events.find(x => x.id === eid);
  const e = ev.entries[pid] || (ev.entries[pid] = {});
  openModal(markModalHtml(p, ev, e));
  $('mCancel').onclick = closeModal;
  $('mSave').onclick = () => {
    const val = $('modalBox').querySelector('input[name="mMark"]:checked').value;
    e.mark = val; e.comment = $('mComment').value.trim();
    save(); closeModal();
  };
}
function perfModalHtml(p, list) {
  const rows = list.map(r => `<tr><td>${r.date}</td><td>${esc(r.type)}</td><td>${r.mark === 'star' ? '★ Star' : '⚑ Flag'}</td><td>${esc(r.comment) || '<span style="color:#888">No comment</span>'}</td></tr>`).join('');
  return `<h2>${esc(p.name)} &mdash; performance notes</h2>
    <table><tr><th>Date</th><th>Event</th><th>Mark</th><th>Comment</th></tr>${rows || '<tr><td colspan="4">No stars or flags yet</td></tr>'}</table>
    <div class="modal-actions"><button id="mClose" type="button">Close</button></div>`;
}
function openPerfModal(p) {
  openModal(perfModalHtml(p, performance(p.id)));
  $('mClose').onclick = closeModal;
}
$('grid').addEventListener('click', ev => {
  const nameEl = ev.target.closest('.editName');
  if (nameEl) { const p = data.players.find(x => x.id === nameEl.dataset.id); if (p) openPlayerModal(p); return; }
  const scoreEl = ev.target.closest('.scoreLink');
  if (scoreEl) { const p = data.players.find(x => x.id === scoreEl.dataset.id); if (p) openScoreModal(p, scoreEl.dataset.scope); return; }
  const perfEl = ev.target.closest('.perfLink');
  if (perfEl) { const p = data.players.find(x => x.id === perfEl.dataset.id); if (p) openPerfModal(p); return; }
  const orderEl = ev.target.closest('.orderBtn');
  if (orderEl) {
    const p = data.players.find(x => x.id === orderEl.dataset.id);
    const peers = data.players
      .filter(x => !!x.left === !!p.left && rankVal(x) === rankVal(p))
      .sort((a, b) => a.order - b.order);
    const i = peers.indexOf(p);
    const j = orderEl.dataset.dir === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < peers.length) {
      const tmp = peers[i].order; peers[i].order = peers[j].order; peers[j].order = tmp;
      save();
    }
    return;
  }
  const markEl = ev.target.closest('.markBtn');
  if (markEl) { openMarkModal(markEl.dataset.p, markEl.dataset.e); return; }
  const flexEl = ev.target.closest('.flexBtn');
  if (flexEl) {
    const event = data.events.find(x => x.id === flexEl.dataset.e);
    const e = event.entries[flexEl.dataset.p] || (event.entries[flexEl.dataset.p] = {});
    e.flex = !e.flex;
    save();
  }
});
$('showEvent').onclick = () => {
  const f = $('eventForm');
  if (f.hidden || $('eEditId').value) {
    f.reset(); $('eEditId').value = ''; $('eSaveBtn').textContent = 'Save event'; f.hidden = false;
  } else f.hidden = true;
};

$('playerForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = $('pName').value.trim(), id = $('pId').value.trim();
  const same = data.players.find(p => p.id === id);
  if (same) {
    const rejoin = same.left ? ' They are currently marked as no longer in the alliance, and OK will mark them active again.' : '';
    if (confirm(`ID ${id} already belongs to "${same.name}". Is this the same player with a new name? OK renames them (old name is kept).${rejoin} Cancel does nothing.`)) {
      if (same.name !== name) same.oldNames.push(same.name);
      same.name = name;
      same.left = false;
      if ($('pRank').value) same.rank = $('pRank').value;
      save(); ev.target.reset();
    }
    return;
  }
  data.players.push({ id, name, oldNames: [], rank: $('pRank').value, left: false, order: nextOrder() });
  save(); ev.target.reset();
});

$('showPaste').onclick = () => { $('pasteForm').hidden = !$('pasteForm').hidden; };
$('pasteForm').addEventListener('submit', ev => {
  ev.preventDefault();
  let added = 0, updated = 0, ignored = 0;
  $('pasteBox').value.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const cols = (line.includes('\t') ? line.split('\t') : line.split(',')).map(c => c.trim());
    const at = cols.map(c => /^\d+$/.test(c)).lastIndexOf(true);
    const before = cols.slice(0, Math.max(at, 0));
    const name = before[before.length - 1];
    const rk = (before.length > 1 ? before[0] : cols[at + 1] || '').toUpperCase();
    const id = cols[at];
    if (at < 1 || !name) { ignored++; return; }
    const rank = rk === 'R5' || rk === 'R4' ? rk : '';
    const same = data.players.find(p => p.id === id);
    if (same) { same.name = name; same.rank = rank; same.left = false; delete same.r4; updated++; return; }
    data.players.push({ id, name, oldNames: [], rank, order: nextOrder() });
    added++;
  });
  save(); ev.target.reset();
  alert(`${added} added, ${updated} updated (ID already in the tracker, so name and rank were refreshed), ${ignored} lines ignored (each line needs a name, then a numeric ID).`);
});

$('eventForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const editId = $('eEditId').value;
  if (editId) {
    const e = data.events.find(x => x.id === editId);
    e.type = $('eType').value; e.date = $('eDate').value; e.t1 = $('eT1').value; e.t2 = $('eT2').value;
    save(); $('eventForm').hidden = true; ev.target.reset(); $('eEditId').value = ''; $('eSaveBtn').textContent = 'Save event';
    return;
  }
  data.events.push({ id: 'e' + Date.now(), type: $('eType').value, date: $('eDate').value, t1: $('eT1').value, t2: $('eT2').value, entries: {} });
  save(); scrollGridRight(); ev.target.reset();
});
$('grid').addEventListener('click', ev => {
  const el = ev.target.closest('.editEvent');
  if (!el) return;
  const e = data.events.find(x => x.id === el.dataset.e);
  $('eEditId').value = e.id; $('eType').value = e.type; $('eDate').value = e.date; $('eT1').value = e.t1; $('eT2').value = e.t2;
  $('eSaveBtn').textContent = 'Save changes';
  $('eventForm').hidden = false;
  $('eventForm').scrollIntoView({ block: 'nearest' });
});

function exportEventList(eid) {
  const ev = data.events.find(x => x.id === eid);
  const group = (legion, kind) => Object.entries(ev.entries)
    .filter(([, e]) => e.legion === legion && kind.includes(e.status))
    .map(([pid]) => data.players.find(p => p.id === pid) || { name: pid })
    .sort((a, b) => (rankVal(b) - rankVal(a)) || ((a.order || 0) - (b.order || 0)))
    .map(p => rankOf(p) ? `${p.name} (${rankOf(p)})` : p.name);
  const full = ['full', 'added'], sub = ['subSure', 'subUnsure', 'subExtra'];
  let text = `${ev.type} - ${ev.date}\n`;
  ['L1', 'L2'].forEach(l => {
    text += `\n${l} (${l === 'L1' ? ev.t1 : ev.t2})\nFull join:\n` + (group(l, full).map(n => '- ' + n).join('\n') || '- (none)')
      + `\n\nSub:\n` + (group(l, sub).map(n => '- ' + n).join('\n') || '- (none)') + '\n';
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = `${ev.type.replace(/\s+/g, '-')}-${ev.date}-signups.txt`;
  a.click();
}
function suggestModalHtml(evId) {
  const ev = data.events.find(x => x.id === evId);
  return `<h2>Suggestions &mdash; ${esc(ev.type)} (${ev.date})</h2>
    <div class="row"><label>Legion <select id="sgLegion"><option value="L1">L1 (${ev.t1})</option><option value="L2">L2 (${ev.t2})</option></select></label>
    <label>Scenario <select id="sgScenario"><option value="over">Legion is oversubscribed (free up space)</option><option value="under">Legion is undersubscribed (fill space)</option></select></label>
    <label>How many <input id="sgCount" type="number" min="1" value="3" style="width:50px"></label>
    <button type="button" id="sgGo">Get suggestions</button></div>
    <div id="sgResults"></div>
    <div class="modal-actions"><button id="mClose" type="button">Close</button></div>`;
}
function resultRow(x, mode) {
  const p = x.p;
  const streakNote = x.streak >= 3 ? ' <span class="bad">(bumped 3+ times running)</span>' : '';
  const vacateNote = x.vacates ? ` &mdash; flexible, would free a spot in ${x.vacates}` : '';
  return `<tr><td>${esc(p.name)}${rankOf(p) ? ' <span class="tag">' + rankOf(p) + '</span>' : ''}</td><td>${Math.round(x.score * 100)}%</td><td>${mode === 'over' ? (STATUS[x.status] || x.status) : ''}${streakNote}${vacateNote}</td></tr>`;
}
function openSuggestModal(evId) {
  openModal(suggestModalHtml(evId));
  $('mClose').onclick = closeModal;
  $('sgGo').onclick = () => {
    const legion = $('sgLegion').value, mode = $('sgScenario').value, count = Math.max(1, parseInt($('sgCount').value, 10) || 1);
    const results = mode === 'over' ? suggestOversubscribed(evId, legion, count) : suggestUndersubscribed(evId, legion, count);
    const label = mode === 'over' ? 'Lowest-priority candidates to move to sub or remove' : 'Best candidates to add, highest first';
    $('sgResults').innerHTML = results.length
      ? `<p style="font-size:12px;color:#777;margin:8px 0 2px">${label}. ${mode === 'over' ? 'Players added without asking are considered first, then unsure sign-ups, then everyone else by score.' : 'Wanted and flexible players are prioritised ahead of the score.'}</p>
         <table><tr><th>Player</th><th>Score</th><th></th></tr>${results.map(x => resultRow(x, mode)).join('')}</table>`
      : '<p style="font-size:12px;color:#777">No eligible candidates found.</p>';
  };
}
$('grid').addEventListener('click', ev => {
  const btn = ev.target.closest('.exportEvBtn');
  if (btn) { exportEventList(btn.dataset.e); return; }
  const sgBtn = ev.target.closest('.suggestEvBtn');
  if (sgBtn) openSuggestModal(sgBtn.dataset.e);
});
$('exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'signup-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
};
$('exportGhBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'data.json';
  a.click();
};
$('importFile').addEventListener('change', ev => {
  const f = ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.players) || !Array.isArray(d.events)) throw new Error();
      if (confirm('Replace everything in the tracker with this backup?')) { data = d; save(); }
    } catch (e) { alert('That file is not a valid backup.'); }
  };
  r.readAsText(f);
});

function scrollGridRight() { $('wrap').scrollLeft = $('wrap').scrollWidth; }
render();
scrollGridRight();