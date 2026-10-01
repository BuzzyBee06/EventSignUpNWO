const STATUS = { full: 'Full', added: 'Full (extra)', subSure: 'Sub (sure)', subUnsure: 'Sub (unsure)', subExtra: 'Sub (extra)', wanted: 'Wanted, no space' };
const CLS = { full: 'f', added: 'a', subSure: 's', subUnsure: 'u', subExtra: 'a', withdrew: 'x', abstain: 'x', wanted: 'w' };
const ATT = { showed: 'Showed', noshow: 'No-show', locked: 'Locked out', excused: 'Excused' };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const rankOf = p => p.rank || (p.r4 ? 'R4' : '');
const rankVal = p => ({ R5: 2, R4: 1 }[rankOf(p)] || 0);
const deployed = st => ['full', 'added', 'subSure', 'subUnsure', 'subExtra'].includes(st);

let data = { players: [], events: [] };

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
  const pts = [], missed = [];
  recent.forEach(ev => {
    const e = ev.entries[pid];
    if (!e || !e.status) { missed.push(ev); return; }
    const p = points(e);
    if (p !== null) pts.push(p);
  });
  return { pts, missed };
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

function render() {
  const q = $('search').value.trim().toLowerCase();
  const showFormer = $('showFormer').checked;
  const events = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  const players = data.players
    .filter(p => showFormer || !p.left)
    .filter(p => !q || [p.name, p.id, ...p.oldNames].some(x => String(x).toLowerCase().includes(q)))
    .sort((a, b) => (Number(!!a.left) - Number(!!b.left)) || (rankVal(b) - rankVal(a)) || ((a.order || 0) - (b.order || 0)));
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
    h += `<th colspan="2" class="evStart evCol">${esc(ev.type)}<br>${ev.date}<br>${line('L1')}<br>${line('L2')}<br><button type="button" class="exportEvBtn" data-e="${ev.id}">Export list</button></th>`;
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
    h += `<tr><td class="p1"><span class="editName" data-id="${esc(p.id)}" title="Click for player details">${esc(p.name)}</span>${rankOf(p) ? '<span class="tag">' + rankOf(p) + '</span>' : ''}${p.left ? '<span class="tag">left</span>' : ''}<span class="id">${esc(p.id)}</span></td>`;
    h += `<td class="p2 scoreLink" data-id="${esc(p.id)}" data-scope="all" title="${tip(s)}">${pct(s)}${cnt(s)}</td><td class="p3 scoreLink" data-id="${esc(p.id)}" data-scope="last5" title="${tip(l5.pts, l5.missed.length)}">${pct(l5.pts)}${cnt(l5.pts, l5.missed.length)}</td>`;
    h += `<td class="p4 perfLink" data-id="${esc(p.id)}" title="Click for performance notes">${perf.length ? perf.map(x => x.mark === 'star' ? '\u2605' : '\u2691').join(' ') : '<span style="color:#aaa">-</span>'}</td>`;
    events.forEach(ev => {
      const e = ev.entries[p.id] || {};
      const suLabel = e.status ? `${e.legion || ''} ${STATUS[e.status] || (e.status === 'withdrew' ? 'Withdrew' : e.status === 'abstain' ? 'Abstention' : '')}` : '';
      h += `<td class="${CLS[e.status] || ''} evStart evCol">${esc(suLabel)}${e.flex ? '<span class="flexBtn on" style="display:inline-block;pointer-events:none">flex</span>' : ''}</td>`;
      const ac = e.att === 'showed' ? 'ok' : e.att === 'noshow' ? 'no' : e.att ? 'x' : '';
      const markIcon = e.mark === 'star' ? '\u2605' : e.mark === 'flag' ? '\u2691' : '';
      h += `<td class="${ac} evCol">${esc(ATT[e.att] || '')}${markIcon ? `<span class="markBtn has-${e.mark}${e.comment ? ' has-comment' : ''}" style="pointer-events:none" title="${e.comment ? esc(e.comment) : ''}">${markIcon}</span>` : ''}</td>`;
    });
    h += '</tr>';
  });
  $('grid').innerHTML = h + '</tbody>';
}

function openModal(html) { $('modalBox').innerHTML = html; $('modalOverlay').hidden = false; }
function closeModal() { $('modalOverlay').hidden = true; $('modalBox').innerHTML = ''; }
$('modalOverlay').addEventListener('click', ev => { if (ev.target.id === 'modalOverlay') closeModal(); });

function playerModalHtml(p) {
  const chips = p.oldNames.map(n => `<span class="oldNameChip">${esc(n)}</span>`).join('') || '<span style="color:#888;font-size:12px">None recorded</span>';
  return `<h2>${esc(p.name)}</h2>
    <div class="row">${rankOf(p) ? `<span class="tag">${rankOf(p)}</span>` : ''}${p.left ? '<span class="tag">left the alliance</span>' : ''}<span style="color:#888;font-size:12px">ID ${esc(p.id)}</span></div>
    <div><strong style="font-size:12px">Past names</strong><div>${chips}</div></div>
    <div class="modal-actions"><button id="mClose" type="button">Close</button></div>`;
}
function openPlayerModal(p) {
  openModal(playerModalHtml(p));
  $('mClose').onclick = closeModal;
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
  if (scope === 'last5') rows = rowsForLast5(rows);
  openModal(scoreModalHtml(p, rows, scope));
  $('mClose').onclick = closeModal;
}
function rowsForLast5(rows) {
  const out = [];
  for (let i = rows.length - 1; i >= 0 && out.length < 5; i--) if (rows[i].pts !== null) out.unshift(rows[i]);
  return out;
}
function perfModalHtml(p, list) {
  const rows = list.map(r => `<tr><td>${r.date}</td><td>${esc(r.type)}</td><td>${r.mark === 'star' ? '\u2605 Star' : '\u2691 Flag'}</td><td>${esc(r.comment) || '<span style="color:#888">No comment</span>'}</td></tr>`).join('');
  return `<h2>${esc(p.name)} &mdash; performance notes</h2>
    <table><tr><th>Date</th><th>Event</th><th>Mark</th><th>Comment</th></tr>${rows || '<tr><td colspan="4">No stars or flags yet</td></tr>'}</table>
    <div class="modal-actions"><button id="mClose" type="button">Close</button></div>`;
}
function openPerfModal(p) {
  openModal(perfModalHtml(p, performance(p.id)));
  $('mClose').onclick = closeModal;
}

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

$('grid').addEventListener('click', ev => {
  const nameEl = ev.target.closest('.editName');
  if (nameEl) { const p = data.players.find(x => x.id === nameEl.dataset.id); if (p) openPlayerModal(p); return; }
  const scoreEl = ev.target.closest('.scoreLink');
  if (scoreEl) { const p = data.players.find(x => x.id === scoreEl.dataset.id); if (p) openScoreModal(p, scoreEl.dataset.scope); return; }
  const perfEl = ev.target.closest('.perfLink');
  if (perfEl) { const p = data.players.find(x => x.id === perfEl.dataset.id); if (p) openPerfModal(p); return; }
  const btn = ev.target.closest('.exportEvBtn');
  if (btn) exportEventList(btn.dataset.e);
});

$('search').addEventListener('input', render);
$('showFormer').addEventListener('change', render);

function scrollGridRight() { $('wrap').scrollLeft = $('wrap').scrollWidth; }

async function loadData() {
  $('status').textContent = 'Loading…';
  try {
    const res = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('not found');
    data = await res.json();
    $('status').textContent = 'Last updated: ' + new Date().toLocaleString();
    render();
    scrollGridRight();
  } catch (e) {
    $('status').textContent = '';
    $('grid').innerHTML = '<tr><td style="padding:16px;color:#b3261e">Could not load data.json. Make sure it has been exported and pushed alongside this page.</td></tr>';
  }
}
$('refreshBtn').onclick = loadData;
loadData();