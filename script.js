let teams = [];
let idCounter = 0;
let prevOrder = [];
const API_URL = "https://script.google.com/macros/s/AKfycbwatUeWFm1RvsuB4iESaiikDJuZH-HBoiCViHfhy9blV3F7n5BAsKblEL-i6HznOpko3g/exec";
// ── Persistence ──────────────────────────────────────────────────────────────

async function fetchTeams() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    teams = data.map((t, index) => ({
      id: index + 1,
      teamId: String(t["Team ID"]),
      name: t["Team Name"],
      points: Number(t["Total Points"]) || 0,
      added: index
    }));

    render(true);

  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

// ── Team Management ───────────────────────────────────────────────────────────

// function addTeam() {
//   const idEl   = document.getElementById('teamId');
//   const nameEl = document.getElementById('teamName');
//   const ptsEl  = document.getElementById('teamPoints');
//   const teamId = idEl.value.trim();
//   const name   = nameEl.value.trim();
//   const pts    = Math.max(0, parseInt(ptsEl.value) || 0);

//   if (!teamId) { idEl.focus(); shake(idEl); return; }
//   if (!name)   { nameEl.focus(); shake(nameEl); return; }

//   teams.push({ id: ++idCounter, teamId, name, points: pts, added: Date.now() });

//   idEl.value   = '';
//   nameEl.value = '';
//   ptsEl.value  = '';
//   idEl.focus();
//   save();
//   render(true);
// }

// function changePoints(id, delta, event) {
//   const t = teams.find(t => t.id === id);
//   if (!t) return;
//   t.points = Math.max(0, t.points + delta);
//   save();
//   spawnDelta(event, delta);
//   render(false, id);
// }

function applyPoints(id, event) {
  const input = document.getElementById(`manual-${id}`);
  if (!input) return;
  const val = parseInt(input.value);
  if (isNaN(val) || val === 0) { input.focus(); return; }
  changePoints(id, val, event);
  input.value = '';
}

// function removeTeam(id) {
//   teams = teams.filter(t => t.id !== id);
//   save();
//   render(true);
// }

// ── Animations & Effects ──────────────────────────────────────────────────────

function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight; // force reflow
  el.style.animation = 'shake 0.3s ease';
  el.addEventListener('animationend', () => el.style.animation = '', { once: true });
}

function spawnDelta(event, delta) {
  if (!event) return;
  const el = document.createElement('div');
  el.className   = 'delta-float';
  el.textContent = delta > 0 ? `+${delta}` : delta;
  el.style.color = delta > 0 ? '#00e5ff' : '#ff3c5f';
  el.style.left  = (event.clientX - 20) + 'px';
  el.style.top   = (event.clientY - 10) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function spawnConfetti(x, y) {
  const colors = ['#f5c842', '#ff3c5f', '#00e5ff', '#fff', '#ff8c00'];
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('div');
    el.className          = 'confetti-piece';
    el.style.left         = (x + (Math.random() - 0.5) * 60) + 'px';
    el.style.top          = y + 'px';
    el.style.background   = colors[Math.floor(Math.random() * colors.length)];
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    el.style.animationDuration = (0.8 + Math.random() * 0.7) + 's';
    el.style.animationDelay   = (Math.random() * 0.2) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(isStructural = false, changedId = null) {
  const sorted = [...teams].sort((a, b) => b.points - a.points || a.added - b.added);
  const lb     = document.getElementById('leaderboard');
  const maxPts = sorted[0]?.points || 1;

  // Update stats
  document.getElementById('statTeams').textContent = teams.length;

  if (teams.length === 0) {
    lb.innerHTML = `<div class="empty-state"><span class="empty-icon">🏆</span><p>Add teams to begin the competition</p></div>`;
    prevOrder = [];
    return;
  }

  // Check if rank 1 changed (for confetti)
  const newFirstId    = sorted[0]?.id;
  const oldFirstId    = prevOrder[0];
  const rankOneChanged = newFirstId !== oldFirstId && oldFirstId !== undefined;

  // Snapshot old positions for FLIP animation
  const existingCards = {};
  lb.querySelectorAll('.team-card').forEach(el => {
    existingCards[parseInt(el.dataset.id)] = el.getBoundingClientRect();
  });

  // Build HTML
  lb.innerHTML = sorted.map((team, i) => {
    const rank      = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const badgeClass = rank <= 3 ? `r${rank}` : 'rn';
    const pct       = maxPts > 0 ? (team.points / maxPts * 100) : 0;
    const crown     = rank === 1 ? '<span class="crown">👑</span>' : '';

    return `
      <div class="team-card ${rankClass}" data-id="${team.id}" data-rank="${rank}">
        ${crown}
        <div class="rank-badge ${badgeClass}">${rank}</div>
        <div class="team-info">
          <div class="team-name">${escHtml(team.name)}</div>
          <div class="team-id-badge">${escHtml(team.teamId)}</div>
          <div class="team-meta">#${rank} · ${team.points === 1 ? '1 pt' : team.points + ' pts'}</div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="points-area">
          <div class="points-display" id="pts-${team.id}">${team.points}</div>
          <div class="points-label">points</div>
          <div class="point-controls">
            <button class="ctrl-btn"       onclick="changePoints(${team.id},+1,event)"  title="+1">+</button>
            <button class="ctrl-btn"       onclick="changePoints(${team.id},+10,event)" title="+10">⬆</button>
            <button class="ctrl-btn minus" onclick="changePoints(${team.id},-1,event)"  title="-1">−</button>
            <button class="ctrl-btn del"   onclick="removeTeam(${team.id})"             title="Remove">✕</button>
          </div>
          <div class="manual-add">
            <input class="manual-input" type="number" id="manual-${team.id}" placeholder="±pts"
              onkeydown="if(event.key==='Enter') applyPoints(${team.id},event)" />
            <button class="apply-btn" onclick="applyPoints(${team.id},event)">APPLY</button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Apply FLIP animations
  lb.querySelectorAll('.team-card').forEach((card, i) => {
    const id = parseInt(card.dataset.id);

    if (!existingCards[id]) {
      // New card — slide in
      card.style.animation = `cardEnter 0.4s ${i * 0.04}s cubic-bezier(0.16,1,0.3,1) both`;
    } else {
      // Existing card — FLIP to new position
      const dy = existingCards[id].top - card.getBoundingClientRect().top;
      if (Math.abs(dy) > 2) {
        const moved = dy < 0 ? 'moving-down' : 'moving-up';
        card.style.transform  = `translateY(${dy}px)`;
        card.style.transition = 'none';
        card.offsetHeight; // force reflow
        card.style.transform  = '';
        card.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
        card.classList.add(moved);
        setTimeout(() => card.classList.remove(moved), 600);
      }
    }

    // Pop the points number that just changed
    if (changedId === id) {
      const pEl = document.getElementById(`pts-${id}`);
      if (pEl) {
        pEl.classList.remove('points-pop');
        pEl.offsetHeight; // force reflow
        pEl.classList.add('points-pop');
      }
    }
  });

  // Confetti on new rank 1
  if (rankOneChanged) {
    const firstCard = lb.querySelector('.rank-1');
    if (firstCard) {
      const r = firstCard.getBoundingClientRect();
      spawnConfetti(r.left + r.width / 2, r.top + r.height / 2);
    }
  }

  prevOrder = sorted.map(t => t.id);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

const idInput = document.getElementById('teamId');
const nameInput = document.getElementById('teamName');
const ptsInput = document.getElementById('teamPoints');

if (idInput) {
  idInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addTeam();
  });
}

if (nameInput) {
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addTeam();
  });
}

if (ptsInput) {
  ptsInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addTeam();
  });
}

fetchTeams();
setInterval(fetchTeams, 10000); // refresh every 10 sec