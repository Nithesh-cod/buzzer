/**
 * Outlier Hunt — Buzzer & Scoring server
 *
 * Roles (decided purely by the username typed on the login page):
 *   - "admin12112"       -> Admin      (lock/unlock buzzer, see buzz order, see point table, reset)
 *   - "pointbreak12112"  -> Point Maker (assign 1 or 2 points to a team)
 *   - anything else      -> Team/Student (a big buzzer; the typed name is the team name)
 *
 * All ordering ("who buzzed first") is decided by the SERVER at the moment the
 * press arrives, so it is fair no matter what each phone's clock says.
 *
 * State is kept in memory (no database). This is intentional: it is simple and
 * extremely fast, and easily handles 100+ students on one process. Restarting
 * the server clears everything (use the Admin "Reset scores" button between games).
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Generous ping settings so flaky phone WiFi doesn't drop players.
  pingTimeout: 25000,
  pingInterval: 20000,
  // Keep only websocket+polling (defaults) — Socket.IO auto-falls back if needed.
});

const ADMIN_USER = 'admin12112';
const POINTMAKER_USER = 'pointbreak12112';
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));

// ---------------------------------------------------------------------------
// In-memory game state
// ---------------------------------------------------------------------------
let buzzerLocked = true;            // start locked; admin unlocks each round
let round = 1;
let seqCounter = 0;                 // increments on every accepted buzz
const buzzOrder = [];               // [{ team, seq, at }] in press order
const buzzedTeams = new Set();      // team names that already buzzed THIS round
const scores = new Map();           // teamName -> total points (persists across rounds)

// socket.id -> { role, name }
const clients = new Map();

function roleForUsername(username) {
  const u = String(username || '').trim();
  if (u.toLowerCase() === ADMIN_USER) return { role: 'admin', name: 'Admin' };
  if (u.toLowerCase() === POINTMAKER_USER) return { role: 'pointmaker', name: 'Point Maker' };
  if (!u) return null;
  return { role: 'team', name: u };
}

function scoreboard() {
  // Sorted high -> low for display.
  return [...scores.entries()]
    .map(([team, points]) => ({ team, points }))
    .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team));
}

function connectedTeams() {
  const set = new Set();
  for (const c of clients.values()) if (c.role === 'team') set.add(c.name);
  return [...set];
}

function publicState() {
  return {
    buzzerLocked,
    round,
    buzzOrder: buzzOrder.map((b, i) => ({ position: i + 1, team: b.team })),
    scoreboard: scoreboard(),
    connectedTeams: connectedTeams(),
  };
}

let broadcastQueued = false;
function broadcastState() {
  // Coalesce bursts (100 buzzes in the same tick) into a single emit.
  if (broadcastQueued) return;
  broadcastQueued = true;
  setImmediate(() => {
    broadcastQueued = false;
    io.emit('state', publicState());
  });
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('login', (username, ack) => {
    try {
      const who = roleForUsername(username);
      if (!who) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Please enter a name.' });
        return;
      }

      // If a team name is already taken by another live socket, still allow it
      // (same team could reconnect) — we just track by socket.
      clients.set(socket.id, who);
      socket.data.role = who.role;
      socket.data.name = who.name;

      // Make sure the team appears on the scoreboard with 0 if new.
      if (who.role === 'team' && !scores.has(who.name)) scores.set(who.name, 0);

      if (typeof ack === 'function') {
        ack({ ok: true, role: who.role, name: who.name, state: publicState() });
      }
      broadcastState();
    } catch (e) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Login failed.' });
    }
  });

  // ----- Student action -----
  socket.on('buzz', (ack) => {
    const me = clients.get(socket.id);
    if (!me || me.role !== 'team') return;
    if (buzzerLocked) {
      if (typeof ack === 'function') ack({ ok: false, locked: true });
      return;
    }
    if (buzzedTeams.has(me.name)) {
      // Already buzzed this round — ignore duplicate presses.
      if (typeof ack === 'function') {
        const pos = buzzOrder.findIndex((b) => b.team === me.name) + 1;
        ack({ ok: true, already: true, position: pos });
      }
      return;
    }
    buzzedTeams.add(me.name);
    seqCounter += 1;
    buzzOrder.push({ team: me.name, seq: seqCounter, at: Date.now() });
    const position = buzzOrder.length;
    if (typeof ack === 'function') ack({ ok: true, position });
    broadcastState();
  });

  // ----- Admin actions -----
  socket.on('admin:setLock', (locked) => {
    const me = clients.get(socket.id);
    if (!me || me.role !== 'admin') return;
    buzzerLocked = !!locked;
    io.emit('lockChanged', { buzzerLocked });
    broadcastState();
  });

  socket.on('admin:resetRound', () => {
    const me = clients.get(socket.id);
    if (!me || me.role !== 'admin') return;
    buzzOrder.length = 0;
    buzzedTeams.clear();
    buzzerLocked = true; // safest default between rounds
    round += 1;
    io.emit('roundReset', { round });
    broadcastState();
  });

  socket.on('admin:resetScores', () => {
    const me = clients.get(socket.id);
    if (!me || me.role !== 'admin') return;
    for (const key of scores.keys()) scores.set(key, 0);
    broadcastState();
  });

  // ----- Point maker action -----
  socket.on('points:assign', ({ team, points } = {}, ack) => {
    const me = clients.get(socket.id);
    if (!me || me.role !== 'pointmaker') return;
    const p = Number(points);
    if (!team || (p !== 1 && p !== 2)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid input.' });
      return;
    }
    scores.set(team, (scores.get(team) || 0) + p);
    if (typeof ack === 'function') ack({ ok: true });
    broadcastState();
  });

  socket.on('disconnect', () => {
    clients.delete(socket.id);
    broadcastState();
  });
});

// Never let an unexpected error kill the process mid-event.
process.on('uncaughtException', (err) => console.error('uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));

server.listen(PORT, () => {
  console.log(`\n  Outlier Hunt Buzzer running:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<YOUR-LAN-IP>:${PORT}   (share this with students)\n`);
});
