let teams = [];
let idCounter = 0;
let prevOrder = [];
const API_URL = "https://script.google.com/macros/s/AKfycbwatUeWFm1RvsuB4iESaiikDJuZH-HBoiCViHfhy9blV3F7n5BAsKblEL-i6HznOpko3g/exec";

// ── Picker Wheel Toggle ───────────────────────────────────────────────────────

function toggleWheel() {
  const overlay  = document.getElementById('wheelOverlay');
  const pageWrap = document.getElementById('pageWrap');
  const btn      = document.getElementById('wheelBtn');
  const isOpen   = overlay.classList.contains('visible');

  if (isOpen) {
    overlay.classList.remove('visible');
    pageWrap.classList.remove('blurred');
    btn.classList.remove('active');
    btn.querySelector('.wheel-fab-label').textContent = 'SPIN';
  } else {
    overlay.classList.add('visible');
    pageWrap.classList.add('blurred');
    btn.classList.add('active');
    btn.querySelector('.wheel-fab-label').textContent = 'CLOSE';
  }
}

function handleOverlayClick(event) {
  // Close only if clicking the backdrop, not the modal itself
  if (event.target === document.getElementById('wheelOverlay')) {
    toggleWheel();
  }
}

// ── Persistence (Google Sheets) ───────────────────────────────────────────────

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

// ── Animations & Effects ──────────────────────────────────────────────────────

function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight;
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

  document.getElementById('statTeams').textContent = teams.length;

  if (teams.length === 0) {
    lb.innerHTML = `<div class="empty-state"><span class="empty-icon">🏆</span><p>Add teams to begin the competition</p></div>`;
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
          <div class="progress-wrap">
            <div class="progress-bar" style="width:${pct}%"></div>
          </div>
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
      if (pEl) {
        pEl.classList.remove('points-pop');
        pEl.offsetHeight;
        pEl.classList.add('points-pop');
      }
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

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Keyboard: close modal on Escape ──────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('wheelOverlay');
    if (overlay.classList.contains('visible')) toggleWheel();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

fetchTeams();
setInterval(fetchTeams, 10000); // refresh every 10 seconds