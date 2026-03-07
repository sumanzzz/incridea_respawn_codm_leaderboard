// ── Firebase (compat SDK loaded via CDN in HTML) ─────────────────────────────
firebase.initializeApp({
  databaseURL: "https://respawn-codm-default-rtdb.asia-southeast1.firebasedatabase.app"
});
const db     = firebase.database();
const MM_REF = db.ref('matchmaker');

// Save full matchmaker state to Firebase
function fbSave() {
  const state = {
    currentMMType,
    randomRound,
    randomPool:  randomPool.map(t => t.id),
    playedPairs: [...playedPairs],
    matchups,
    robinGroupA,
    robinGroupB,
    robinTeamsA: robinTeamsA.map(t => t.id),
    robinTeamsB: robinTeamsB.map(t => t.id),
  };
  MM_REF.set(state).catch(err => console.error('Firebase save error:', err));
}

// Delete matchmaker state from Firebase (on reset)
function fbClear() {
  MM_REF.remove().catch(err => console.error('Firebase clear error:', err));
}

// Restore a team object from its id using the loaded teams array
function teamById(id) {
  return teams.find(t => t.id === id) || null;
}

// Restore matchup objects (re-link team references from ids)
function restoreMatchup(m) {
  return {
    ...m,
    teamA: teamById(m.teamA?.id ?? m.teamA) || m.teamA,
    teamB: m.teamB ? (teamById(m.teamB?.id ?? m.teamB) || m.teamB) : null,
  };
}

// ── State ─────────────────────────────────────────────────────────────────────
let teams = [];
let idCounter = 0;
let prevOrder = [];
let currentMMType = 'random';
let matchups = [];
let robinGroupA = [];
let robinGroupB = [];
let currentGroup = 'A';
let activeMiniMatchId = null;
let playedPairs = new Set();
let randomPool = [];
let randomRound = 1;
let robinTeamsA = [];
let robinTeamsB = [];

const API_URL = "https://script.google.com/macros/s/AKfycbwatUeWFm1RvsuB4iESaiikDJuZH-HBoiCViHfhy9blV3F7n5BAsKblEL-i6HznOpko3g/exec";

// ── Tab / Segmented Control ───────────────────────────────────────────────────

function switchTab(tab) {
  document.getElementById('tabLeaderboard').classList.toggle('active', tab === 'leaderboard');
  document.getElementById('tabMatchmaker').classList.toggle('active', tab === 'matchmaker');
  document.getElementById('segLeaderboard').classList.toggle('active', tab === 'leaderboard');
  document.getElementById('segMatchmaker').classList.toggle('active', tab === 'matchmaker');
  const slider = document.getElementById('segSlider');
  slider.classList.toggle('right', tab === 'matchmaker');
}

// ── Matchmaker Type Selection ─────────────────────────────────────────────────

function selectMMType(type) {
  currentMMType = type;
  document.getElementById('mmTypeRandom').classList.toggle('active', type === 'random');
  document.getElementById('mmTypeRobin').classList.toggle('active', type === 'robin');
}

// ── Generate Matchups ─────────────────────────────────────────────────────────

function generateMatchups() {
  const countInput = document.getElementById('mmTeamCount');
  const count = parseInt(countInput.value);

  if (!count || count < 2) { shake(countInput); return; }
  if (teams.length === 0) { alert('No teams loaded yet!'); return; }

  // Take top N teams sorted by points
  const sorted = [...teams].sort((a, b) => b.points - a.points || a.added - b.added);
  const pool = sorted.slice(0, Math.min(count, sorted.length));

  if (pool.length < 2) { alert('Need at least 2 teams!'); return; }

  if (currentMMType === 'random') {
    generateRandom(pool);
  } else {
    generateRobin(pool);
  }

  document.getElementById('mmConfig').style.display = 'none';
  document.getElementById('mmResults').style.display = 'block';
}

function generateRandom(pool) {
  // Fresh start — reset history
  playedPairs = new Set();
  randomPool = pool;
  randomRound = 1;
  buildRandomRound();

  document.getElementById('matchGrid').style.display = 'grid';
  document.getElementById('robinLayout').style.display = 'none';
  document.getElementById('generateAgainWrap').style.display = 'block';
  updateRandomHeader();
  renderMatchGrid(matchups, 'matchGrid');
  fbSave();
}

function buildRandomRound() {
  // Try to pair everyone without repeating a matchup
  // Uses backtracking shuffle — tries up to 50 times then falls back gracefully
  const pool = randomPool;
  let attempts = 0;
  let best = null;

  while (attempts < 50) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const mid = Math.floor(shuffled.length / 2);
    const pairs = [];
    let valid = true;

    for (let i = 0; i < mid; i++) {
      const a = shuffled[i];
      const b = shuffled[mid + i];
      const key1 = `${Math.min(a.id, b.id)}|${Math.max(a.id, b.id)}`;
      if (playedPairs.has(key1)) { valid = false; break; }
      pairs.push({ a, b, key: key1 });
    }

    if (valid) { best = { pairs, shuffled, mid }; break; }
    attempts++;
  }

  // Use best found (or last attempt if all pairs exhausted)
  if (!best) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const mid = Math.floor(shuffled.length / 2);
    const pairs = [];
    for (let i = 0; i < mid; i++) {
      const a = shuffled[i];
      const b = shuffled[mid + i];
      const key = `${Math.min(a.id, b.id)}|${Math.max(a.id, b.id)}`;
      pairs.push({ a, b, key });
    }
    best = { pairs, shuffled, mid };
  }

  // Commit pairs to history and build matchups
  matchups = [];
  best.pairs.forEach(({ a, b, key }, i) => {
    playedPairs.add(key);
    matchups.push({ id: i + 1, teamA: a, teamB: b, map: null, winner: null });
  });

  // Handle odd team out
  if (best.shuffled.length % 2 !== 0) {
    matchups.push({
      id: best.mid + 1,
      teamA: best.shuffled[best.shuffled.length - 1],
      teamB: null, map: null, winner: null
    });
  }
}

function regenerateRandom() {
  randomRound++;
  buildRandomRound();
  updateRandomHeader();
  renderMatchGrid(matchups, 'matchGrid');
  fbSave();
  document.getElementById('mmResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateRandomHeader() {
  document.getElementById('mmResultsLabel').textContent = `ROUND ${randomRound} MATCHUPS`;
  document.getElementById('mmResultsSub').textContent =
    `${matchups.length} matchup${matchups.length !== 1 ? 's' : ''} · ${randomPool.length} teams · ${playedPairs.size} pairs played`;
}

function generateRobin(pool) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const half = Math.ceil(shuffled.length / 2);
  robinTeamsA = shuffled.slice(0, half);
  robinTeamsB = shuffled.slice(half);

  robinGroupA = buildRoundRobin(robinTeamsA, 'A');
  robinGroupB = buildRoundRobin(robinTeamsB, 'B');

  document.getElementById('mmResultsLabel').textContent = 'ROUND ROBIN';
  document.getElementById('mmResultsSub').textContent =
    `Group A: ${robinTeamsA.length} teams (${robinGroupA.length} matches) · Group B: ${robinTeamsB.length} teams (${robinGroupB.length} matches)`;
  document.getElementById('matchGrid').style.display = 'none';
  document.getElementById('robinLayout').style.display = 'block';
  document.getElementById('generateAgainWrap').style.display = 'none';
  renderRobinSideBySide();
  fbSave();
}

function buildRoundRobin(pool, prefix) {
  const result = [];
  let id = 1;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      result.push({ id: `${prefix}${id++}`, teamA: pool[i], teamB: pool[j], map: null });
    }
  }
  return result;
}

function buildMatchCard(m, idx) {
  const teamBHtml = m.teamB
    ? `<div class="match-team" style="text-align:right">
         <div class="match-team-id">${escHtml(m.teamB.teamId || '')}</div>
         <div class="match-team-name">${escHtml(m.teamB.name)}</div>
       </div>`
    : `<div class="match-team" style="text-align:right;opacity:0.4">
         <div class="match-team-name">BYE</div>
       </div>`;
  const mapHtml = m.map
    ? `<div class="match-map-display has-result"><span class="match-map-text">${escHtml(m.map)}</span></div>`
    : `<div class="match-map-display"><span class="match-map-text">No map selected</span></div>`;

  // Winner dropdown options
  const winnerHtml = m.teamB ? `
    <div class="match-winner-row">
      <span class="match-winner-label">🏆 Winner</span>
      <select class="match-winner-select ${m.winner ? 'has-winner' : ''}"
        onchange="setWinner('${m.id}', this.value)">
        <option value="">— Select winner —</option>
        <option value="${escHtml(m.teamA.name)}" ${m.winner === m.teamA.name ? 'selected' : ''}>${escHtml(m.teamA.name)}</option>
        <option value="${escHtml(m.teamB.name)}" ${m.winner === m.teamB.name ? 'selected' : ''}>${escHtml(m.teamB.name)}</option>
      </select>
    </div>` : '';

  return `
    <div class="match-card ${m.winner ? 'match-decided' : ''}" data-match-id="${m.id}" style="animation-delay:${idx * 0.05}s">
      <div class="match-num">Match ${m.id}</div>
      <div class="match-teams">
        <div class="match-team ${m.winner === m.teamA.name ? 'is-winner' : (m.winner ? 'is-loser' : '')}">
          <div class="match-team-id">${escHtml(m.teamA.teamId || '')}</div>
          <div class="match-team-name">${escHtml(m.teamA.name)}</div>
        </div>
        <div class="match-vs">VS</div>
        ${m.teamB ? `<div class="match-team ${m.winner === m.teamB.name ? 'is-winner' : (m.winner ? 'is-loser' : '')}" style="text-align:right">
          <div class="match-team-id">${escHtml(m.teamB.teamId || '')}</div>
          <div class="match-team-name">${escHtml(m.teamB.name)}</div>
        </div>` : `<div class="match-team" style="text-align:right;opacity:0.4"><div class="match-team-name">BYE</div></div>`}
      </div>
      <div class="match-footer">
        ${mapHtml}
        ${m.teamB ? `<button class="match-spin-btn" onclick="openMiniWheel('${m.id}')" title="Spin for map & mode">🎡</button>` : ''}
      </div>
      ${winnerHtml}
    </div>`;
}

function setWinner(matchId, winnerName) {
  const updateIn = (arr) => {
    const m = arr.find(m => String(m.id) === String(matchId));
    if (m) m.winner = winnerName || null;
  };
  updateIn(matchups);
  updateIn(robinGroupA);
  updateIn(robinGroupB);

  if (currentMMType === 'random') {
    renderMatchGrid(matchups, 'matchGrid');
  } else {
    renderRobinSideBySide();
  }
  fbSave();
}

function renderMatchGrid(matches, containerId) {
  const grid = document.getElementById(containerId);
  grid.innerHTML = matches.map((m, i) => buildMatchCard(m, i)).join('');
}

function renderRobinSideBySide() {
  // ── Team list header ──
  const teamListA = robinTeamsA.map(t => `
    <div class="robin-team-row">
      <span class="robin-team-id">${escHtml(t.teamId || '')}</span>
      <span class="robin-team-name">${escHtml(t.name)}</span>
    </div>`).join('');

  const teamListB = robinTeamsB.map(t => `
    <div class="robin-team-row">
      <span class="robin-team-id">${escHtml(t.teamId || '')}</span>
      <span class="robin-team-name">${escHtml(t.name)}</span>
    </div>`).join('');

  document.getElementById('robinTeamListA').innerHTML = teamListA;
  document.getElementById('robinTeamListB').innerHTML = teamListB;

  // ── Match rows with single centered match number ──
  const maxRows = Math.max(robinGroupA.length, robinGroupB.length);
  let rowsHtml = '';

  for (let i = 0; i < maxRows; i++) {
    const cardA = robinGroupA[i] ? buildMatchCard(robinGroupA[i], i) : '<div class="robin-empty-slot"></div>';
    const cardB = robinGroupB[i] ? buildMatchCard(robinGroupB[i], i) : '<div class="robin-empty-slot"></div>';
    rowsHtml += `
      <div class="robin-match-row">
        <div class="robin-match-row-header">
          <div class="robin-match-num-center">Match ${i + 1}</div>
        </div>
        <div class="robin-match-cols">
          <div class="robin-match-col">${cardA}</div>
          <div class="robin-match-col">${cardB}</div>
        </div>
      </div>`;
  }

  document.getElementById('robinMatchRows').innerHTML = rowsHtml;
}

function resetMatchmaker() {
  matchups = []; robinGroupA = []; robinGroupB = []; robinTeamsA = []; robinTeamsB = [];
  playedPairs = new Set(); randomPool = []; randomRound = 1;
  fbClear();
  document.getElementById('mmConfig').style.display = 'block';
  document.getElementById('mmResults').style.display = 'none';
  document.getElementById('matchGrid').style.display = 'grid';
  document.getElementById('robinLayout').style.display = 'none';
  document.getElementById('generateAgainWrap').style.display = 'none';
  document.getElementById('mmTeamCount').value = '';
}

// ── Mini Wheel (per match) ────────────────────────────────────────────────────

function openMiniWheel(matchId) {
  activeMiniMatchId = matchId;
  document.getElementById('miniWheelMatchLabel').textContent = `// Match ${matchId}`;
  // Clear any previously selected chip
  document.querySelectorAll('.map-chip').forEach(c => c.classList.remove('selected'));
  const overlay = document.getElementById('miniWheelOverlay');
  const pageWrap = document.getElementById('pageWrap');
  overlay.classList.add('visible');
  pageWrap.classList.add('blurred');
}

function closeMiniWheel() {
  document.getElementById('miniWheelOverlay').classList.remove('visible');
  document.getElementById('pageWrap').classList.remove('blurred');
  activeMiniMatchId = null;
}

function handleMiniOverlayClick(event) {
  if (event.target === document.getElementById('miniWheelOverlay')) closeMiniWheel();
}

function selectMapChip(el, mapResult) {
  if (!activeMiniMatchId) return;

  // Briefly highlight the chip
  document.querySelectorAll('.map-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  // Short delay so user sees the selection before modal closes
  setTimeout(() => {
    const id = activeMiniMatchId;
    const updateIn = (arr) => {
      const m = arr.find(m => String(m.id) === String(id));
      if (m) m.map = mapResult;
    };
    updateIn(matchups);
    updateIn(robinGroupA);
    updateIn(robinGroupB);

    if (currentMMType === 'random') {
      renderMatchGrid(matchups, 'matchGrid');
    } else {
      renderRobinSideBySide();
    }
    fbSave();
    closeMiniWheel();
  }, 200);
}

function confirmMiniWheel() {
  // kept for keyboard shortcut compatibility but no longer used directly
}

// ── Global Wheel Toggle ───────────────────────────────────────────────────────

function toggleWheel() {
  const overlay  = document.getElementById('wheelOverlay');
  const pageWrap = document.getElementById('pageWrap');
  const btn      = document.getElementById('wheelBtn');
  const isOpen   = overlay.classList.contains('visible');

  if (isOpen) {
    overlay.classList.remove('visible');
    pageWrap.classList.remove('blurred');
    btn.classList.remove('active');
    btn.querySelector('.wheel-fab-label').textContent = 'MAP & MODE';
  } else {
    overlay.classList.add('visible');
    pageWrap.classList.add('blurred');
    btn.classList.add('active');
    btn.querySelector('.wheel-fab-label').textContent = 'CLOSE';
  }
}

function handleOverlayClick(event) {
  if (event.target === document.getElementById('wheelOverlay')) toggleWheel();
}

// ── Google Sheets fetch ───────────────────────────────────────────────────────

async function fetchTeams() {
  try {
    const res  = await fetch(API_URL);
    const data = await res.json();
    teams = data.map((t, index) => ({
      id:     index + 1,
      teamId: String(t["Team ID"]),
      name:   t["Team Name"],
      points: Number(t["Total Points"]) || 0,
      added:  index
    }));
    render(true);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

// ── Leaderboard Render ────────────────────────────────────────────────────────

function render(isStructural = false, changedId = null) {
  const sorted = [...teams].sort((a, b) => b.points - a.points || a.added - b.added);
  const lb     = document.getElementById('leaderboard');
  const maxPts = sorted[0]?.points || 1;

  document.getElementById('statTeams').textContent = teams.length;

  if (teams.length === 0) {
    lb.innerHTML = `<div class="empty-state"><span class="empty-icon">🏆</span><p>Fetching teams...</p></div>`;
    prevOrder = [];
    return;
  }

  const newFirstId     = sorted[0]?.id;
  const oldFirstId     = prevOrder[0];
  const rankOneChanged = newFirstId !== oldFirstId && oldFirstId !== undefined;

  const existingCards = {};
  lb.querySelectorAll('.team-card').forEach(el => {
    existingCards[parseInt(el.dataset.id)] = el.getBoundingClientRect();
  });

  lb.innerHTML = sorted.map((team, i) => {
    const rank       = i + 1;
    const rankClass  = rank <= 3 ? `rank-${rank}` : '';
    const badgeClass = rank <= 3 ? `r${rank}` : 'rn';
    const pct        = maxPts > 0 ? (team.points / maxPts * 100) : 0;
    const crown      = rank === 1 ? '<span class="crown">👑</span>' : '';
    return `
      <div class="team-card ${rankClass}" data-id="${team.id}" data-rank="${rank}">
        ${crown}
        <div class="rank-badge ${badgeClass}">${rank}</div>
        <div class="team-info">
          <div class="team-name">${escHtml(team.name)}</div>
          ${team.teamId ? `<div class="team-id-badge">${escHtml(team.teamId)}</div>` : ''}
          <div class="team-meta">#${rank} · ${team.points === 1 ? '1 pt' : team.points + ' pts'}</div>
          <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
        </div>
        <div class="points-area">
          <div class="points-display" id="pts-${team.id}">${team.points}</div>
          <div class="points-label">points</div>
        </div>
      </div>`;
  }).join('');

  lb.querySelectorAll('.team-card').forEach((card, i) => {
    const id = parseInt(card.dataset.id);
    if (!existingCards[id]) {
      card.style.animation = `cardEnter 0.4s ${i * 0.04}s cubic-bezier(0.16,1,0.3,1) both`;
    } else {
      const dy = existingCards[id].top - card.getBoundingClientRect().top;
      if (Math.abs(dy) > 2) {
        const moved = dy < 0 ? 'moving-down' : 'moving-up';
        card.style.transform  = `translateY(${dy}px)`;
        card.style.transition = 'none';
        card.offsetHeight;
        card.style.transform  = '';
        card.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
        card.classList.add(moved);
        setTimeout(() => card.classList.remove(moved), 600);
      }
    }
    if (changedId === id) {
      const pEl = document.getElementById(`pts-${id}`);
      if (pEl) { pEl.classList.remove('points-pop'); pEl.offsetHeight; pEl.classList.add('points-pop'); }
    }
  });

  if (rankOneChanged) {
    const firstCard = lb.querySelector('.rank-1');
    if (firstCard) {
      const r = firstCard.getBoundingClientRect();
      spawnConfetti(r.left + r.width / 2, r.top + r.height / 2);
    }
  }

  prevOrder = sorted.map(t => t.id);
}

// ── Effects ───────────────────────────────────────────────────────────────────

function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake 0.3s ease';
  el.addEventListener('animationend', () => el.style.animation = '', { once: true });
}

function spawnConfetti(x, y) {
  const colors = ['#f5c842', '#ff3c5f', '#00e5ff', '#fff', '#ff8c00'];
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = (x + (Math.random() - 0.5) * 60) + 'px';
    el.style.top  = y + 'px';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    el.style.animationDuration = (0.8 + Math.random() * 0.7) + 's';
    el.style.animationDelay   = (Math.random() * 0.2) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('miniWheelOverlay').classList.contains('visible')) { closeMiniWheel(); return; }
    if (document.getElementById('wheelOverlay').classList.contains('visible')) { toggleWheel(); return; }
  }
  // Enter key no longer used for mini wheel (chip selection auto-confirms)
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  await fetchTeams(); // load teams first so we can re-link references

  // Listen for Firebase matchmaker state (syncs across all users in real time)
  MM_REF.on('value', (snapshot) => {
    const state = snapshot.val();
    if (!state) return; // nothing saved yet

    // Restore primitive state
    currentMMType = state.currentMMType || 'random';
    randomRound   = state.randomRound   || 1;
    playedPairs   = new Set(state.playedPairs || []);

    // Restore matchups with full team objects
    matchups    = (state.matchups    || []).map(restoreMatchup);
    robinGroupA = (state.robinGroupA || []).map(restoreMatchup);
    robinGroupB = (state.robinGroupB || []).map(restoreMatchup);

    // Restore pool and robin team lists
    randomPool  = (state.randomPool  || []).map(teamById).filter(Boolean);
    robinTeamsA = (state.robinTeamsA || []).map(teamById).filter(Boolean);
    robinTeamsB = (state.robinTeamsB || []).map(teamById).filter(Boolean);

    // Show the results UI
    document.getElementById('mmConfig').style.display = 'none';
    document.getElementById('mmResults').style.display = 'block';

    if (currentMMType === 'random') {
      document.getElementById('matchGrid').style.display = 'grid';
      document.getElementById('robinLayout').style.display = 'none';
      document.getElementById('generateAgainWrap').style.display = 'block';
      updateRandomHeader();
      renderMatchGrid(matchups, 'matchGrid');
    } else {
      document.getElementById('matchGrid').style.display = 'none';
      document.getElementById('robinLayout').style.display = 'block';
      document.getElementById('generateAgainWrap').style.display = 'none';
      document.getElementById('mmResultsLabel').textContent = 'ROUND ROBIN';
      document.getElementById('mmResultsSub').textContent =
        `Group A: ${robinTeamsA.length} teams (${robinGroupA.length} matches) · Group B: ${robinTeamsB.length} teams (${robinGroupB.length} matches)`;
      renderRobinSideBySide();
    }
  });
}



init();
setInterval(fetchTeams, 10000);