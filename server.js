// ─── LOGGING: Alle Konsolenausgaben → connection.log ─────────────────────────
const _fs_log    = require('fs');
const _path_log  = require('path');
const _logStream = _fs_log.createWriteStream(_path_log.join(__dirname, 'connection.log'), { flags: 'a' });

function _writeToLog(level, args) {
  const ts = new Date().toISOString();
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  _logStream.write(`[${ts}] [${level}] ${msg}\n`);
}

const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log   = (...args) => { _origLog(...args);   _writeToLog('LOG',   args); };
console.warn  = (...args) => { _origWarn(...args);  _writeToLog('WARN',  args); };
console.error = (...args) => { _origError(...args); _writeToLog('ERROR', args); };
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const https      = require('https');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const { execSync } = require('child_process');
// sql.js — pure JavaScript SQLite, no native compilation needed

// ─── .env LOADER ─────────────────────────────────────────────────────────────
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq < 1) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    });
  } catch (e) {
    console.warn('[env] .env konnte nicht geladen werden:', e.message);
  }
}
loadEnvFile();

// ─── DATABASE (sql.js) ───────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'soullink.db');
let db = null;

async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS runs (
    passphrase TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    state      TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS rulesets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    content    TEXT NOT NULL DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )`);
  ensureRunsTableColumns();
  flushDB();
  console.log('[db] SQLite (sql.js) ready');
}
function ensureRunsTableColumns() {
  const info = db.exec("PRAGMA table_info('runs')");
  const cols = new Set((info[0]?.values || []).map(r => r[1]));
  if (!cols.has('run_password_hash')) db.run('ALTER TABLE runs ADD COLUMN run_password_hash TEXT');
  if (!cols.has('run_password_salt')) db.run('ALTER TABLE runs ADD COLUMN run_password_salt TEXT');
}

function flushDB() {
  try { fs.writeFileSync(DB_FILE, Buffer.from(db.export())); }
  catch(e) { console.error('[db] flush error', e.message); }
}

function dbGet(pp) {
  const res = db.exec('SELECT * FROM runs WHERE passphrase = ?', [pp]);
  if (!res.length||!res[0].values.length) return null;
  const cols=res[0].columns, row=res[0].values[0];
  return Object.fromEntries(cols.map((c,i)=>[c,row[i]]));
}
function dbInsert(pp, name, state, passwordHash = null, passwordSalt = null) {
  db.run('INSERT INTO runs (passphrase,name,state,run_password_hash,run_password_salt) VALUES (?,?,?,?,?)',[pp,name,state,passwordHash,passwordSalt]);
  flushDB();
}
function dbUpdate(pp, state) { db.run("UPDATE runs SET state=?,updated_at=strftime('%s','now') WHERE passphrase=?",[state,pp]); flushDB(); }
function dbList() {
  const res=db.exec('SELECT passphrase,name,created_at,updated_at,(run_password_hash IS NOT NULL AND run_password_hash<>\'\' ) AS is_protected FROM runs ORDER BY updated_at DESC');
  if(!res.length)return[];
  return res[0].values.map(row=>Object.fromEntries(res[0].columns.map((c,i)=>[c,row[i]])));
}
function dbRulesetList() {
  const res = db.exec('SELECT id,name,updated_at FROM rulesets ORDER BY lower(name) ASC');
  if (!res.length) return [];
  return res[0].values.map(row=>Object.fromEntries(res[0].columns.map((c,i)=>[c,row[i]])));
}
function dbRulesetGet(id) {
  const res = db.exec('SELECT id,name,content,created_at,updated_at FROM rulesets WHERE id=?', [id]);
  if (!res.length || !res[0].values.length) return null;
  const cols = res[0].columns, row = res[0].values[0];
  return Object.fromEntries(cols.map((c,i)=>[c,row[i]]));
}
function dbRulesetGetByName(name) {
  const res = db.exec('SELECT id,name,content,created_at,updated_at FROM rulesets WHERE lower(name)=lower(?)', [name]);
  if (!res.length || !res[0].values.length) return null;
  const cols = res[0].columns, row = res[0].values[0];
  return Object.fromEntries(cols.map((c,i)=>[c,row[i]]));
}
function dbRulesetUpsert(name, content) {
  const existing = dbRulesetGetByName(name);
  if (existing) {
    db.run("UPDATE rulesets SET content=?, updated_at=strftime('%s','now') WHERE id=?", [content, existing.id]);
    flushDB();
    return dbRulesetGet(existing.id);
  }
  db.run("INSERT INTO rulesets (name,content) VALUES (?,?)", [name, content]);
  flushDB();
  return dbRulesetGetByName(name);
}
function dbRulesetDelete(id) {
  const existing = dbRulesetGet(id);
  if (!existing) return false;
  db.run('DELETE FROM rulesets WHERE id=?', [id]);
  flushDB();
  return true;
}
function hashRunPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}
function createRunPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashRunPassword(password, salt) };
}
function verifyRunPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = hashRunPassword(password || '', salt);
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
function isRunProtectedRow(row) {
  return !!(row?.run_password_hash && row?.run_password_salt);
}


// ─── CONSTANTS & HELPERS ─────────────────────────────────────────────────────
const MAX_PLAYERS = 3, NUM_BOXES = 8, BOX_SIZE = 30;
function emptySlot() { return { pokeId: null, name: '', nickname: '', shiny: false, alive: true, missed: false }; }
function randomPassphrase() {
  const w = ['feuer','wasser','gras','blitz','eis','rock','geist','drache','fee','kampf','gift','boden','flug','psycho','stahl','normal'];
  const n = Math.floor(Math.random()*9000)+1000;
  return `${w[Math.floor(Math.random()*w.length)]}-${w[Math.floor(Math.random()*w.length)]}-${n}`;
}
function emptyRunState() {
  return {
    team: Array.from({length:3},()=>Array(6).fill(null).map(emptySlot)),
    box:  Array.from({length:3},()=>Array.from({length:NUM_BOXES},()=>Array(BOX_SIZE).fill(null))),
    routes: [{},{},{}], links: [], linkIdCounter: 1,
    selectedEdition: null, deathCounts: [0,0,0], totalDeathCounts: [0,0,0], badgeStates: [{},{},{}], levelCaps: {},
    runStatus: 'lobby', runCounter: 0, runStartedAt: null, runElapsed: 0, runHistory: [], runPassword: null,
    rulesText: '', rulesTitle: '', rulesetId: null, trainerCapsText: ''
  };
}
function locStr(loc) {
  if (loc==='team') return 'team';
  if (typeof loc==='object') { if ('box' in loc) return `box:${loc.box}:${loc.slot}`; if ('route' in loc) return `route:${loc.route}`; }
  return String(loc);
}
function locEq(a,b) { return locStr(a)===locStr(b); }
function getPokeAt(R,pi,location,slotIndex) {
  if (location==='team') return R.team[pi]?.[slotIndex]??null;
  if (typeof location==='object') { if ('box' in location) return R.box[pi]?.[location.box]?.[location.slot]??null; if ('route' in location) return R.routes[pi]?.[location.route]??null; }
  return null;
}
function setPokeAt(R,pi,location,slotIndex,poke) {
  if (location==='team') { R.team[pi][slotIndex]=poke; return; }
  if (typeof location==='object') { if ('box' in location) { R.box[pi][location.box][location.slot]=poke; return; } if ('route' in location) { R.routes[pi][location.route]=poke; return; } }
}
function normalizeRunState(state) {
  const base = emptyRunState();
  const R = (state && typeof state === 'object') ? state : {};
  if (!Array.isArray(R.team) || R.team.length !== 3) R.team = base.team;
  if (!Array.isArray(R.box) || R.box.length !== 3) R.box = base.box;
  if (!Array.isArray(R.routes) || R.routes.length !== 3) R.routes = base.routes;
  if (!Array.isArray(R.links)) R.links = [];
  if (typeof R.linkIdCounter !== 'number' || R.linkIdCounter < 1) R.linkIdCounter = 1;
  if (!Array.isArray(R.deathCounts) || R.deathCounts.length !== 3) R.deathCounts = [0,0,0];
  if (!Array.isArray(R.totalDeathCounts) || R.totalDeathCounts.length !== 3) R.totalDeathCounts = [0,0,0];
  if (!Array.isArray(R.badgeStates) || R.badgeStates.length !== 3) R.badgeStates = [{},{},{}];
  if (!R.levelCaps || typeof R.levelCaps !== 'object') R.levelCaps = {};
  if (!Array.isArray(R.runHistory)) R.runHistory = [];
  if (typeof R.runPassword !== 'string') R.runPassword = null;
  if (typeof R.rulesText !== 'string') R.rulesText = '';
  if (typeof R.rulesTitle !== 'string') R.rulesTitle = '';
  if (typeof R.rulesetId !== 'number') R.rulesetId = null;
  if (typeof R.trainerCapsText !== 'string') R.trainerCapsText = '';
  if (typeof R.runStatus !== 'string') R.runStatus = 'lobby';
  if (typeof R.runCounter !== 'number') R.runCounter = 0;
  if (typeof R.runStartedAt !== 'number') R.runStartedAt = null;
  if (typeof R.runElapsed !== 'number') R.runElapsed = 0;
  return R;
}
function clientStatePayload(R) {
  return {
    team:R.team,box:R.box,links:R.links,routes:R.routes,selectedEdition:R.selectedEdition,
    deathCounts:R.deathCounts,totalDeathCounts:R.totalDeathCounts||[0,0,0],badgeStates:R.badgeStates,
    levelCaps:R.levelCaps||{},runStatus:R.runStatus,runCounter:R.runCounter,runStartedAt:R.runStartedAt,
    runElapsed:R.runElapsed||0,runHistory:R.runHistory||[],runPassword:R.runPassword||null,
    rulesText:R.rulesText||'',rulesTitle:R.rulesTitle||'',rulesetId:R.rulesetId||null,trainerCapsText:R.trainerCapsText||''
  };
}
function nowRunElapsedSec(R) {
  let sec = R.runElapsed || 0;
  if (R.runStatus === 'active' && R.runStartedAt) {
    sec += Math.floor((Date.now() - R.runStartedAt) / 1000);
  }
  return Math.max(0, sec);
}
function summarizePoke(pk) {
  if (!pk) return null;
  return {
    pokeId: pk.pokeId ?? null,
    name: pk.name || '',
    nickname: pk.nickname || '',
    shiny: !!pk.shiny,
    missed: !!pk.missed
  };
}
function serializeLoc(location, slotIndex) {
  if (location === 'team') return { type: 'team', slotIndex };
  if (location && typeof location === 'object') {
    if ('box' in location) return { type: 'box', box: location.box, slot: location.slot };
    if ('route' in location) return { type: 'route', routeId: location.route };
  }
  return { type: String(location || '') };
}
function ensureRunBucket(R, runNumber) {
  if (!Array.isArray(R.runHistory)) R.runHistory = [];
  let bucket = R.runHistory.find(r => r.runNumber === runNumber);
  if (!bucket) {
    bucket = { runNumber, startedAt: null, endedAt: null, events: [] };
    R.runHistory.push(bucket);
    R.runHistory.sort((a,b)=>(a.runNumber||0)-(b.runNumber||0));
  }
  if (!Array.isArray(bucket.events)) bucket.events = [];
  return bucket;
}
function addRunEvent(R, type, details = {}, opts = {}) {
  const runNumber = opts.runNumber ?? R.runCounter ?? 0;
  if (!runNumber || runNumber < 1) return null;
  const bucket = ensureRunBucket(R, runNumber);
  const evt = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    type,
    at: Date.now(),
    elapsedSec: nowRunElapsedSec(R),
    details
  };
  bucket.events.push(evt);
  return evt;
}

// ─── RUN REGISTRY ────────────────────────────────────────────────────────────
const runs = new Map();
function getOrLoadRun(passphrase) {
  if (runs.has(passphrase)) return runs.get(passphrase);
  const row = dbGet(passphrase);
  if (!row) return null;
  const run = { state: normalizeRunState(JSON.parse(row.state)), users: {}, saveTimer: null };
  runs.set(passphrase, run);
  return run;
}
function saveRun(passphrase) {
  const run = runs.get(passphrase); if (!run) return;
  clearTimeout(run.saveTimer);
  run.saveTimer = setTimeout(() => dbUpdate(passphrase, JSON.stringify(run.state)), 500);
}

// ─── DEATH / REVIVE ──────────────────────────────────────────────────────────
function propagateDeath(R,triggerPi,triggerLoc,triggerSlot) {
  const affected = R.links.filter(lk=>lk.slots.some(s=>s.playerIndex===triggerPi&&locEq(s.location,triggerLoc)&&(triggerLoc!=='team'||s.slotIndex===triggerSlot)));
  if (!affected.length) return;
  affected.forEach(lk=>{
    lk.broken=true;
    const cs=lk.slots.find(s=>s.playerIndex===triggerPi&&locEq(s.location,triggerLoc)&&(triggerLoc!=='team'||s.slotIndex===triggerSlot));
    if (cs) { const cp=getPokeAt(R,cs.playerIndex,cs.location,cs.slotIndex); lk.culprit={playerIndex:cs.playerIndex,pokeId:cp?.pokeId,name:cp?.name,nickname:cp?.nickname}; }
    lk.slots.forEach(s=>{ const p=getPokeAt(R,s.playerIndex,s.location,s.slotIndex); if(p)p.alive=false; });
    addRunEvent(R,'link-died',{
      linkId: lk.id,
      trigger: {
        playerIndex: triggerPi,
        location: serializeLoc(triggerLoc, triggerSlot),
        pokemon: summarizePoke(getPokeAt(R, triggerPi, triggerLoc, triggerSlot))
      },
      culprit: lk.culprit ? {
        playerIndex: lk.culprit.playerIndex,
        pokeId: lk.culprit.pokeId ?? null,
        name: lk.culprit.name || '',
        nickname: lk.culprit.nickname || ''
      } : null,
      linkedPlayers: lk.slots.map(s=>({
        playerIndex: s.playerIndex,
        location: serializeLoc(s.location, s.slotIndex),
        pokemon: summarizePoke(getPokeAt(R,s.playerIndex,s.location,s.slotIndex))
      }))
    });
  });
}
function checkRevive(R,linkId) {
  const lk=R.links.find(l=>l.id===linkId); if(!lk||!lk.broken) return;
  if (lk.slots.every(s=>{ const p=getPokeAt(R,s.playerIndex,s.location,s.slotIndex); return p&&p.pokeId&&p.alive&&!p.missed; })) { lk.broken=false; delete lk.culprit; }
}
function checkRouteAutoLink(R,activePIs,routeId) {
  if (activePIs.length<2) return;
  const entries=activePIs.map(pi=>R.routes[pi]?.[routeId]);
  const allPresent=entries.every(e=>e&&e.pokeId), anyMissed=entries.some(e=>e&&e.missed);
  R.links=R.links.filter(lk=>lk.routeId!==routeId);
  if (allPresent&&!anyMissed) {
    const slots=activePIs.map(pi=>{
      const pk=R.routes[pi][routeId]; let bx=-1,sl=-1;
      outer: for(let b=0;b<NUM_BOXES;b++) for(let s=0;s<BOX_SIZE;s++) if(!R.box[pi][b][s]?.pokeId){bx=b;sl=s;break outer;}
      if (bx>=0) { R.box[pi][bx][sl]={...pk}; return {playerIndex:pi,location:{box:bx,slot:sl}}; }
      return {playerIndex:pi,location:{route:routeId}};
    });
    const linkId = R.linkIdCounter++;
    R.links.push({id:linkId,slots,broken:false,routeId});
    addRunEvent(R,'route-link-created',{
      routeId,
      linkId,
      players: activePIs.map(pi=>({
        playerIndex: pi,
        pokemon: summarizePoke(R.routes[pi]?.[routeId])
      }))
    });
  }
}

// ─── EXPRESS & SERVER SETUP ──────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── IP TRACKING ─────────────────────────────────────────────────────────────
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unbekannt'
  );
}

// Muss VOR express.static stehen, sonst wird index.html schon vorher ausgeliefert
app.use((req, res, next) => {
  const ip = getClientIP(req);
  const ts = new Date().toISOString();
  const accept = req.headers['accept'] || '';

  // Seitenaufruf: Browser lädt index.html (text/html im Accept-Header)
  if (req.method === 'GET' && accept.includes('text/html')) {
    console.log(`[IP-TRACKER] ${ts} | Seitenaufruf        | IP: ${ip}`);
  }

  // Erster API-Kontakt: /api/runs (wird beim Laden der Seite sofort aufgerufen)
  const apiLoginPaths = ['/api/runs', '/api/runs/join', '/api/runs/create'];
  if (apiLoginPaths.includes(req.path)) {
    console.log(`[IP-TRACKER] ${ts} | API ${req.method.padEnd(4)} ${req.path.padEnd(20)} | IP: ${ip}`);
  }

  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/maps', express.static(path.join(__dirname, 'maps')));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Always start an HTTP server for API + socket fallback (no cert issues)
const httpServer = http.createServer(app);

// Try to also start HTTPS (required for screen capture API in browser)
let httpsServer = null;
const certPath = path.join(__dirname, 'cert.pem');
const keyPath  = path.join(__dirname, 'key.pem');
try {
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`, { stdio: 'pipe' });
  }
  httpsServer = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app);
  console.log('[server] HTTPS server ready (for screen capture)');
} catch(e) {
  console.log('[server] HTTPS not available, HTTP only');
}

// Socket.IO attaches to both servers
const server = httpServer;
const io = new Server(server, { cors: { origin: '*' } });
if (httpsServer) {
  // Share the same Socket.IO instance on the HTTPS server too
  io.attach(httpsServer);
}

// ─── HTTP API ─────────────────────────────────────────────────────────────────
app.get('/api/runs', (_,res) => res.json(dbList()));
app.post('/api/runs/create', (req,res) => {
  const { name, passwordEnabled, runPassword } = req.body || {};
  if (!name) return res.status(400).json({error:'Name erforderlich'});
  const protectedRun = !!passwordEnabled;
  if (protectedRun && !String(runPassword || '').trim()) {
    return res.status(400).json({error:'Passwort erforderlich'});
  }
  let pp; do { pp=randomPassphrase(); } while(dbGet(pp));
  let passwordHash = null, passwordSalt = null;
  if (protectedRun) {
    const p = createRunPassword(String(runPassword));
    passwordHash = p.hash;
    passwordSalt = p.salt;
  }
  const initialState = emptyRunState();
  initialState.runPassword = protectedRun ? String(runPassword) : null;
  dbInsert(pp, name, JSON.stringify(initialState), passwordHash, passwordSalt);
  console.log(`[run created] "${name}" -> ${pp}`);
  res.json({passphrase:pp,name,isProtected:protectedRun});
});
app.post('/api/runs/join', (req,res) => {
  const row=dbGet(req.body?.passphrase?.trim());
  if (!row) return res.status(404).json({error:'Run nicht gefunden'});
  const isProtected = isRunProtectedRow(row);
  if (isProtected) {
    const pw = String(req.body?.runPassword || '');
    if (!verifyRunPassword(pw, row.run_password_salt, row.run_password_hash)) {
      return res.status(401).json({error:'Falsches Passwort'});
    }
  }
  res.json({passphrase:row.passphrase,name:row.name});
});
app.get('/api/runs/active', (_,res) => {
  const allRuns = dbList();
  const result = allRuns.map(row => {
    const run = runs.get(row.passphrase);
    const connectedUsers = run ? Object.values(run.users) : [];
    const playerCount = connectedUsers.filter(u => u.playerIndex >= 0).length;
    const spectatorCount = connectedUsers.filter(u => u.playerIndex < 0).length;
    return {
      passphrase: row.passphrase,
      name: row.name,
      isProtected: !!row.is_protected,
      playerCount,
      spectatorCount
    };
  });
  res.json(result);
});

app.get('/api/runs/slots/:passphrase', (req,res) => {
  const pp = req.params.passphrase?.trim();
  const row = dbGet(pp);
  if (!row) return res.status(404).json({error:'Run nicht gefunden'});
  const run = runs.get(pp);
  const usedPIs = run ? Object.values(run.users).map(u=>u.playerIndex).filter(i=>i>=0) : [];
  res.json({usedSlots: usedPIs,isProtected:isRunProtectedRow(row)});
});

// ─── RULESETS API ────────────────────────────────────────────────────────────
app.get('/api/rulesets', (_,res) => {
  res.json(dbRulesetList());
});

app.get('/api/rulesets/:id', (req,res) => {
  const id = parseInt(req.params.id,10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({error:'Ungültige Ruleset-ID'});
  const row = dbRulesetGet(id);
  if (!row) return res.status(404).json({error:'Ruleset nicht gefunden'});
  res.json(row);
});

app.post('/api/rulesets', (req,res) => {
  const name = String(req.body?.name || '').trim();
  const content = String(req.body?.content || '');
  if (!name) return res.status(400).json({error:'Name erforderlich'});
  if (name.length > 80) return res.status(400).json({error:'Name zu lang (max 80)'});
  const row = dbRulesetUpsert(name, content);
  res.json(row);
});

app.delete('/api/rulesets/:id', (req,res) => {
  const id = parseInt(req.params.id,10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({error:'Ungültige Ruleset-ID'});
  const ok = dbRulesetDelete(id);
  if (!ok) return res.status(404).json({error:'Ruleset nicht gefunden'});
  res.json({ok:true});
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function checkAdmin(req, res) {
  const pw = (req.headers['x-admin-password'] || req.body?.adminPassword || '').trim();
  if (pw !== ADMIN_PASSWORD) { res.status(401).json({error:'Falsches Passwort'}); return false; }
  return true;
}

app.post('/api/admin/verify', (req,res) => {
  if (!checkAdmin(req,res)) return;
  res.json({ok:true});
});

app.delete('/api/admin/runs/:passphrase', (req,res) => {
  if (!checkAdmin(req,res)) return;
  const pp = req.params.passphrase?.trim();
  if (!dbGet(pp)) return res.status(404).json({error:'Run nicht gefunden'});
  const run = runs.get(pp);
  if (run) {
    io.to(`run:${pp}`).emit('run-deleted');
    clearTimeout(run.saveTimer);
    runs.delete(pp);
  }
  db.run('DELETE FROM runs WHERE passphrase = ?', [pp]);
  flushDB();
  console.log(`[admin] Run gelöscht: ${pp}`);
  res.json({ok:true});
});

app.post('/api/admin/runs/:passphrase/password', (req,res) => {
  if (!checkAdmin(req,res)) return;
  const pp = req.params.passphrase?.trim();
  const row = dbGet(pp);
  if (!row) return res.status(404).json({error:'Run nicht gefunden'});

  const rawPassword = req.body?.runPassword;
  const password = typeof rawPassword === 'string' ? rawPassword.trim() : '';

  if (!password) {
    db.run("UPDATE runs SET run_password_hash=NULL, run_password_salt=NULL, updated_at=strftime('%s','now') WHERE passphrase=?", [pp]);
    const loadedRun = runs.get(pp);
    if (loadedRun) {
      loadedRun.state.runPassword = null;
      io.to(`run:${pp}`).emit('soullink-state', clientStatePayload(loadedRun.state));
      clearTimeout(loadedRun.saveTimer);
      dbUpdate(pp, JSON.stringify(loadedRun.state));
    } else {
      flushDB();
    }
    console.log(`[admin] Run-Passwort entfernt: ${pp}`);
    return res.json({ok:true,isProtected:false});
  }

  const p = createRunPassword(password);
  db.run("UPDATE runs SET run_password_hash=?, run_password_salt=?, updated_at=strftime('%s','now') WHERE passphrase=?", [p.hash, p.salt, pp]);
  const loadedRun = runs.get(pp);
  if (loadedRun) {
    loadedRun.state.runPassword = password;
    io.to(`run:${pp}`).emit('soullink-state', clientStatePayload(loadedRun.state));
    clearTimeout(loadedRun.saveTimer);
    dbUpdate(pp, JSON.stringify(loadedRun.state));
  } else {
    flushDB();
  }
  console.log(`[admin] Run-Passwort gesetzt: ${pp}`);
  res.json({ok:true,isProtected:true});
});

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let myPP = null;

  socket.on('join', ({name, passphrase, requestedPlayerIndex, runPassword}) => {
    const pp = passphrase?.trim();
    const row = dbGet(pp);
    if (!row) { socket.emit('run-not-found'); return; }
    if (isRunProtectedRow(row)) {
      const ok = verifyRunPassword(String(runPassword || ''), row.run_password_salt, row.run_password_hash);
      if (!ok) { socket.emit('run-auth-failed'); return; }
    }
    const run=getOrLoadRun(pp);
    if (!run) { socket.emit('run-not-found'); return; }
    if (isRunProtectedRow(row) && !run.state.runPassword) {
      run.state.runPassword = String(runPassword || '');
      saveRun(pp);
    }
    myPP=pp;
    const R=run.state, roomId=`run:${myPP}`;
    const usedPIs=Object.values(run.users).map(u=>u.playerIndex).filter(i=>i>=0);
    let pi;
    if (requestedPlayerIndex === -1) {
      // Explicit spectator request
      pi = -1;
    } else if (requestedPlayerIndex !== undefined && requestedPlayerIndex >= 0 && requestedPlayerIndex < MAX_PLAYERS && !usedPIs.includes(requestedPlayerIndex)) {
      // Requested slot is free — grant it
      pi = requestedPlayerIndex;
    } else {
      // Fallback: auto-assign first free slot, or spectator if full
      const activeCount = usedPIs.length;
      pi = activeCount >= MAX_PLAYERS ? -1 : ([0,1,2].find(i=>!usedPIs.includes(i))??-1);
    }
    const isRO = pi < 0;
    run.users[socket.id]={name,sharing:false,playerIndex:pi,readonly:isRO};
    socket.join(roomId);
    const peers=Object.entries(run.users).filter(([id])=>id!==socket.id).map(([id,u])=>({id,...u}));
    socket.emit('joined',{socketId:socket.id,peers,playerIndex:pi,readonly:isRO,...clientStatePayload(R)});
    socket.to(roomId).emit('peer-joined',{id:socket.id,name,sharing:false,playerIndex:pi,readonly:isRO});
    if(isRO) socket.to(roomId).emit('send-offer-to',{peerId:socket.id});
    broadcastRoom(roomId,run);
    console.log(`[join] ${name} P${pi} run=${myPP}${isRO?' [ro]':''}`);
  });

  const ctx = () => { if(!myPP) return null; const run=runs.get(myPP); if(!run) return null; return {run,R:run.state,roomId:`run:${myPP}`}; };
  const isRO = () => runs.get(myPP)?.users[socket.id]?.readonly===true;
  const bcast = (c) => { const R=c.R; io.to(c.roomId).emit('soullink-state',clientStatePayload(R)); };

  socket.on('offer',({to,offer})=>socket.to(to).emit('offer',{from:socket.id,offer}));
  socket.on('answer',({to,answer})=>socket.to(to).emit('answer',{from:socket.id,answer}));
  socket.on('ice-candidate',({to,candidate})=>socket.to(to).emit('ice-candidate',{from:socket.id,candidate}));
  socket.on('ice-status',({to,status})=>{ if(status==='failed'||status==='disconnected'){socket.emit('use-relay',{peerId:to});io.to(to).emit('use-relay',{peerId:socket.id});}});
  socket.on('relay-frame',({to,frame})=>io.to(to).emit('relay-frame',{from:socket.id,frame}));
  socket.on('send-offer-to',({peerId})=>io.to(peerId).emit('send-offer-to',{peerId:socket.id}));

  socket.on('sharing-state',({sharing})=>{ if(isRO()) return; const c=ctx();if(!c)return; c.run.users[socket.id].sharing=sharing; socket.to(c.roomId).emit('peer-sharing-state',{id:socket.id,sharing}); bcast(c); saveRun(myPP); });
  socket.on('set-edition',({edition})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; R.selectedEdition=edition; for(let i=0;i<3;i++){Object.keys(R.routes[i]).forEach(k=>delete R.routes[i][k]);R.badgeStates[i]={};} R.links=R.links.filter(lk=>!lk.routeId); R.levelCaps={}; bcast(c);saveRun(myPP); });

  socket.on('clear-edition-data',({edition})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R;
    R.selectedEdition=edition;
    const savedTotal=R.totalDeathCounts||[0,0,0];
    for(let i=0;i<3;i++){
      R.team[i]=Array(6).fill(null).map(emptySlot);
      R.box[i]=Array.from({length:NUM_BOXES},()=>Array(BOX_SIZE).fill(null));
      R.routes[i]={};
      R.badgeStates[i]={};
      R.deathCounts[i]=0;
    }
    R.totalDeathCounts=savedTotal;
    R.links=[];
    R.linkIdCounter=1;
    R.runStatus='lobby';
    R.runCounter=0;
    R.runStartedAt=null;
    R.runElapsed=0;
    R.runHistory=[];
    bcast(c);saveRun(myPP);
    console.log(`[clear-edition-data] run=${myPP} new edition=${edition}`);
  });
  socket.on('set-badge',({playerIndex,badgeId,state})=>{
    if(isRO()) return;
    const c=ctx();if(!c)return;
    if(!c.R.badgeStates[playerIndex])c.R.badgeStates[playerIndex]={};
    const prevState = c.R.badgeStates[playerIndex][badgeId] ?? 0;
    c.R.badgeStates[playerIndex][badgeId]=state;
    if (state === 1 && prevState !== 1) {
      addRunEvent(c.R,'gym-started',{playerIndex,badgeId});
    }
    if (state === 2 && prevState !== 2) {
      addRunEvent(c.R,'gym-defeated',{playerIndex,badgeId});
    }
    bcast(c);saveRun(myPP);
  });
  socket.on('set-level-cap',({badgeId,cap})=>{ if(isRO()) return; const c=ctx();if(!c)return; if(!c.R.levelCaps)c.R.levelCaps={}; if(cap===null||cap===''||cap===undefined){delete c.R.levelCaps[badgeId];}else{c.R.levelCaps[badgeId]=parseInt(cap)||0;} bcast(c);saveRun(myPP); });
  socket.on('set-rules-content',({text,title,rulesetId,trainerCapsText})=>{
    if(isRO()) return;
    const c=ctx();if(!c)return;
    c.R.rulesText = String(text || '');
    c.R.rulesTitle = String(title || '');
    c.R.rulesetId = Number.isInteger(rulesetId) && rulesetId > 0 ? rulesetId : null;
    c.R.trainerCapsText = String(trainerCapsText || '');
    bcast(c);saveRun(myPP);
  });

  socket.on('set-pokemon',({playerIndex,slotIndex,pokemon})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; R.team[playerIndex][slotIndex]=pokemon?{...emptySlot(),...pokemon}:emptySlot(); if(pokemon?.pokeId){R.links.forEach(lk=>lk.slots.forEach(s=>{if(s.playerIndex!==playerIndex)return;if(typeof s.location==='object'&&'route'in s.location){const rp=R.routes[playerIndex]?.[s.location.route];if(rp?.pokeId===pokemon.pokeId){s.location='team';s.slotIndex=slotIndex;}}}));} bcast(c);saveRun(myPP); });
  socket.on('set-box-pokemon',({playerIndex,boxNum,slotNum,pokemon})=>{ if(isRO()) return; const c=ctx();if(!c)return; c.R.box[playerIndex][boxNum][slotNum]=pokemon?{...emptySlot(),...pokemon}:null; bcast(c);saveRun(myPP); });
  socket.on('set-route-pokemon',({playerIndex,routeId,pokemon})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R;
    R.routes[playerIndex][routeId]=pokemon?{...emptySlot(),...pokemon}:null;
    const aPIs=Object.values(c.run.users).filter(u=>u.playerIndex>=0).map(u=>u.playerIndex);
    if(pokemon){
      addRunEvent(R,'route-catch',{
        routeId,
        playerIndex,
        pokemon: summarizePoke(pokemon)
      });
      checkRouteAutoLink(R,aPIs,routeId);
    } else {
      // Remove auto-links for this route
      R.links=R.links.filter(lk=>!(lk.routeId===routeId&&lk.slots.some(s=>typeof s.location==='object'&&s.location.route===routeId)));
      // Also remove manual links where THIS player's slot pointed to this route
      // (i.e. the slot was set-route-pokemon null → that slot no longer has a pokemon)
      R.links=R.links.filter(lk=>{
        const thisPlayerSlot=lk.slots.find(s=>s.playerIndex===playerIndex&&typeof s.location==='object'&&s.location.route===routeId);
        return !thisPlayerSlot; // remove link if this player's slot was in this route
      });
    }
    bcast(c);saveRun(myPP);
  });

  // mark-route-missed: mark initiator + all linked partners as missed
  socket.on('mark-route-missed',({playerIndex,routeId})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R;
    // Mark the initiator in routes
    const initPk=R.routes[playerIndex]?.[routeId];
    const initBase=initPk?{...initPk}:{pokeId:null,name:'',nickname:'',shiny:false,alive:true};
    R.routes[playerIndex][routeId]={...emptySlot(),...initBase,missed:true,missedInitiator:true};

    // Also update box copy if the pokemon was auto-linked into box
    R.links.forEach(lk=>{
      if(lk.routeId!==routeId) return;
      lk.slots.forEach(s=>{
        if(s.playerIndex!==playerIndex) return;
        if(typeof s.location==='object'&&'box'in s.location){
          const bpk=R.box[playerIndex]?.[s.location.box]?.[s.location.slot];
          if(bpk) R.box[playerIndex][s.location.box][s.location.slot]={...bpk,missed:true,missedInitiator:true};
        }
      });
    });

    // Find all linked players
    const linkedPIs=new Set();
    R.links.forEach(lk=>{
      if(lk.routeId!==routeId) return;
      lk.slots.forEach(s=>{ if(s.playerIndex!==playerIndex) linkedPIs.add(s.playerIndex); });
    });
    const aPIs=Object.values(c.run.users).filter(u=>u.playerIndex>=0).map(u=>u.playerIndex);
    aPIs.forEach(pi=>{ if(pi===playerIndex) return; if(R.routes[pi]?.[routeId]) linkedPIs.add(pi); });

    // Mark all partners in routes + box
    linkedPIs.forEach(pi=>{
      const pk=R.routes[pi]?.[routeId];
      const base=pk?{...pk}:{pokeId:null,name:'',nickname:'',shiny:false,alive:true};
      R.routes[pi][routeId]={...emptySlot(),...base,missed:true,missedInitiator:false};
      // Update box copy if exists
      R.links.forEach(lk=>{
        if(lk.routeId!==routeId) return;
        lk.slots.forEach(s=>{
          if(s.playerIndex!==pi) return;
          if(typeof s.location==='object'&&'box'in s.location){
            const bpk=R.box[pi]?.[s.location.box]?.[s.location.slot];
            if(bpk) R.box[pi][s.location.box][s.location.slot]={...bpk,missed:true,missedInitiator:false};
          }
        });
      });
    });

    addRunEvent(R,'route-link-failed',{
      routeId,
      failedByPlayerIndex: playerIndex,
      players: [playerIndex, ...[...linkedPIs]].map(pi=>({
        playerIndex: pi,
        pokemon: summarizePoke(R.routes[pi]?.[routeId]),
        missed: true,
        missedInitiator: pi===playerIndex
      }))
    });

    // Remove route auto-links
    R.links=R.links.filter(lk=>lk.routeId!==routeId);
    bcast(c);saveRun(myPP);
  });

  socket.on('move-to-box',({playerIndex,slotIndex,boxNum,slotNum})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; const pk=R.team[playerIndex][slotIndex];if(!pk?.pokeId)return; R.box[playerIndex][boxNum][slotNum]={...pk};R.team[playerIndex][slotIndex]=emptySlot(); R.links.forEach(lk=>lk.slots.forEach(s=>{if(s.playerIndex===playerIndex&&s.location==='team'&&s.slotIndex===slotIndex){s.location={box:boxNum,slot:slotNum};delete s.slotIndex;}})); bcast(c);saveRun(myPP); });
  socket.on('move-to-team',({playerIndex,boxNum,slotNum,slotIndex})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; const pk=R.box[playerIndex][boxNum][slotNum];if(!pk?.pokeId)return; const dp=R.team[playerIndex][slotIndex]; if(dp?.pokeId){R.box[playerIndex][boxNum][slotNum]={...dp};R.links.forEach(lk=>lk.slots.forEach(s=>{if(s.playerIndex===playerIndex&&s.location==='team'&&s.slotIndex===slotIndex){s.location={box:boxNum,slot:slotNum};delete s.slotIndex;}}));}else{R.box[playerIndex][boxNum][slotNum]=null;} R.team[playerIndex][slotIndex]={...pk}; R.links.forEach(lk=>lk.slots.forEach(s=>{if(s.playerIndex===playerIndex&&typeof s.location==='object'&&s.location.box===boxNum&&s.location.slot===slotNum){s.location='team';s.slotIndex=slotIndex;}})); bcast(c);saveRun(myPP); });
  socket.on('move-link-to-box',({linkId,boxTargets})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; const lk=R.links.find(l=>l.id===linkId);if(!lk)return; boxTargets.forEach(({playerIndex,boxNum,slotNum})=>{const slot=lk.slots.find(s=>s.playerIndex===playerIndex);if(!slot)return;const pk=getPokeAt(R,playerIndex,slot.location,slot.slotIndex);if(!pk?.pokeId)return;setPokeAt(R,playerIndex,slot.location,slot.slotIndex,slot.location==='team'?emptySlot():null);R.box[playerIndex][boxNum][slotNum]={...pk};slot.location={box:boxNum,slot:slotNum};delete slot.slotIndex;}); bcast(c);saveRun(myPP); });

  // Move a specific link's pokemon to team slots — only updates slots belonging to THIS link,
  // leaving other links untouched. Displaced pokemon are auto-boxed.
  socket.on('move-link-to-team',({linkId,slotIndex})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; const lk=R.links.find(l=>l.id===linkId);if(!lk)return;
    // Snapshot of teams BEFORE changes
    const teamsBeforeSnapshot = [0,1,2].map(pi => R.team[pi].map(pk => summarizePoke(pk)));
    const changes = [];
    lk.slots.forEach(s=>{
      const pk=getPokeAt(R,s.playerIndex,s.location,s.slotIndex);if(!pk?.pokeId)return;
      const sourceLocation = serializeLoc(s.location, s.slotIndex);
      const displaced=R.team[s.playerIndex][slotIndex];
      let displacedMovedTo = null;
      // Box the displaced pokemon if there is one, updating only its own link (not ours)
      if(displaced?.pokeId){
        let bx=-1,bl=-1;
        outer: for(let b=0;b<NUM_BOXES;b++) for(let sl=0;sl<BOX_SIZE;sl++) if(!R.box[s.playerIndex][b][sl]?.pokeId){bx=b;bl=sl;break outer;}
        if(bx>=0){
          R.box[s.playerIndex][bx][bl]={...displaced};
          displacedMovedTo = { type:'box', box:bx, slot:bl };
          // Update links that tracked displaced pokemon at this team slot (but NOT our link)
          R.links.forEach(otherLk=>{
            if(otherLk.id===lk.id)return;
            otherLk.slots.forEach(os=>{
              if(os.playerIndex===s.playerIndex&&os.location==='team'&&os.slotIndex===slotIndex){
                os.location={box:bx,slot:bl};delete os.slotIndex;
              }
            });
          });
        }
      }
      // Clear source location
      setPokeAt(R,s.playerIndex,s.location,s.slotIndex,s.location==='team'?emptySlot():null);
      // Place pokemon at target team slot
      R.team[s.playerIndex][slotIndex]={...pk};
      // Update THIS link's slot reference
      s.location='team';s.slotIndex=slotIndex;
      changes.push({
        playerIndex: s.playerIndex,
        incoming: summarizePoke(pk),
        from: sourceLocation,
        to: { type:'team', slotIndex },
        replaced: summarizePoke(displaced),
        replacedMovedTo: displacedMovedTo
      });
    });
    if (changes.length) {
      // Snapshot of teams AFTER changes
      const teamsAfterSnapshot = [0,1,2].map(pi => R.team[pi].map(pk => summarizePoke(pk)));
      addRunEvent(R,'link-team-swapped',{linkId,targetSlotIndex:slotIndex,changes,teamsBeforeSnapshot,teamsAfterSnapshot});
    }
    bcast(c);saveRun(myPP);
  });
  socket.on('move-from-route',({playerIndex,routeId,toLocation,toSlotIndex})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; R.links.forEach(lk=>lk.slots.forEach(s=>{if(s.playerIndex===playerIndex&&typeof s.location==='object'&&s.location.route===routeId){if(toLocation==='team'){s.location='team';s.slotIndex=toSlotIndex;}else{s.location=toLocation;delete s.slotIndex;}}})); const pk=R.routes[playerIndex][routeId]; if(pk?.pokeId){if(toLocation==='team')R.team[playerIndex][toSlotIndex]={...pk};else R.box[playerIndex][toLocation.box][toLocation.slot]={...pk};} bcast(c);saveRun(myPP); });

  socket.on('set-alive',({playerIndex,slotIndex,alive})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; const p=R.team[playerIndex]?.[slotIndex];if(!p)return; const was=p.alive; p.alive=alive; if(p.pokeId){Object.values(R.routes[playerIndex]).forEach(rp=>{if(rp&&rp.pokeId===p.pokeId)rp.alive=alive;});} if(!alive&&was){R.deathCounts[playerIndex]++;if(!R.totalDeathCounts)R.totalDeathCounts=[0,0,0];R.totalDeathCounts[playerIndex]++;addRunEvent(R,'pokemon-died',{playerIndex,location:{type:'team',slotIndex},pokemon:summarizePoke(p)});propagateDeath(R,playerIndex,'team',slotIndex);}else if(alive&&!was){R.deathCounts[playerIndex]=Math.max(0,R.deathCounts[playerIndex]-1);if(!R.totalDeathCounts)R.totalDeathCounts=[0,0,0];R.links.forEach(lk=>{if(lk.broken){const culpritPi=lk.culprit?.playerIndex;checkRevive(R,lk.id);if(!lk.broken&&culpritPi!=null){R.totalDeathCounts[culpritPi]=Math.max(0,R.totalDeathCounts[culpritPi]-1);}}});} bcast(c);saveRun(myPP); });
  socket.on('set-death-count',({playerIndex,count})=>{ if(isRO()) return; const c=ctx();if(!c)return; if(playerIndex>=0&&playerIndex<3){const old=c.R.deathCounts[playerIndex]||0;const next=Math.max(0,parseInt(count)||0);const delta=next-old;if(!c.R.totalDeathCounts)c.R.totalDeathCounts=[0,0,0];c.R.totalDeathCounts[playerIndex]=Math.max(0,(c.R.totalDeathCounts[playerIndex]||0)+delta);c.R.deathCounts[playerIndex]=next;bcast(c);saveRun(myPP);} });
  socket.on('set-box-alive',({playerIndex,boxNum,slotNum,alive})=>{ if(isRO()) return; const c=ctx();if(!c)return; const p=c.R.box[playerIndex]?.[boxNum]?.[slotNum];if(!p)return; const was=p.alive; p.alive=alive; if(!alive&&was){addRunEvent(c.R,'pokemon-died',{playerIndex,location:{type:'box',box:boxNum,slot:slotNum},pokemon:summarizePoke(p)});propagateDeath(c.R,playerIndex,{box:boxNum,slot:slotNum});} bcast(c);saveRun(myPP); });
  socket.on('set-route-alive',({playerIndex,routeId,alive})=>{ if(isRO()) return; const c=ctx();if(!c)return; const p=c.R.routes[playerIndex]?.[routeId];if(!p)return; const was=p.alive; p.alive=alive; if(!alive&&was){addRunEvent(c.R,'pokemon-died',{playerIndex,location:{type:'route',routeId},pokemon:summarizePoke(p)});propagateDeath(c.R,playerIndex,{route:routeId});} bcast(c);saveRun(myPP); });

  socket.on('add-link',({slots})=>{ if(isRO()) return; const c=ctx();if(!c)return; const R=c.R; const hasShiny=slots.some(s=>{const p=getPokeAt(R,s.playerIndex,s.location,s.slotIndex);return p?.shiny;}); if(hasShiny){const locs=slots.map(s=>locStr(s.location));if(new Set(locs).size>1){socket.emit('link-error','Shiny-Pokemon koennen nur mit gleicher Position verlinkt werden.');return;}} const linkId=R.linkIdCounter++; R.links.push({id:linkId,slots,broken:false}); addRunEvent(R,'manual-link-created',{linkId,slots:slots.map(s=>({playerIndex:s.playerIndex,location:serializeLoc(s.location,s.slotIndex),pokemon:summarizePoke(getPokeAt(R,s.playerIndex,s.location,s.slotIndex))}))}); bcast(c);saveRun(myPP); });
  socket.on('remove-link',({linkId})=>{ if(isRO()) return; const c=ctx();if(!c)return; c.R.links=c.R.links.filter(l=>l.id!==linkId); bcast(c);saveRun(myPP); });

  socket.on('run-start',()=>{
    if(isRO()) return;
    const c=ctx();if(!c)return;
    const R=c.R;
    if(R.runStatus==='active')return;
    if(R.runStatus==='paused'){
      // Resume: restart timer, keep elapsed
      R.runStatus='active';
      R.runStartedAt=Date.now();
      addRunEvent(R,'run-resumed',{});
      // runElapsed already holds time accumulated before pause
    } else {
      // Fresh start (lobby or reset)
      R.runStatus='active';
      R.runCounter=(R.runCounter||0)+1;
      R.runStartedAt=Date.now();
      R.runElapsed=0;
      const bucket = ensureRunBucket(R, R.runCounter);
      if (!bucket.startedAt) bucket.startedAt = Date.now();
      addRunEvent(R,'run-started',{});
    }
    bcast(c);saveRun(myPP);
    console.log(`[run-start] run=${myPP} #${R.runCounter}`);
  });

  socket.on('run-pause',()=>{
    if(isRO()) return;
    const c=ctx();if(!c)return;
    const R=c.R;
    if(R.runStatus!=='active')return;
    // Accumulate elapsed time before pausing
    R.runElapsed=(R.runElapsed||0)+Math.floor((Date.now()-(R.runStartedAt||Date.now()))/1000);
    R.runStatus='paused';
    R.runStartedAt=null;
    addRunEvent(R,'run-paused',{});
    bcast(c);saveRun(myPP);
    console.log(`[run-pause] run=${myPP} #${R.runCounter} elapsed=${R.runElapsed}s`);
  });

  socket.on('run-new',()=>{
    if(isRO()) return;
    const c=ctx();if(!c)return;
    const R=c.R;
    const counter=R.runCounter||0;
    const history=R.runHistory||[];
    const edition=R.selectedEdition;
    const savedTotal=R.totalDeathCounts||[0,0,0];
    const savedRunPassword=R.runPassword||null;
    const savedRulesText=R.rulesText||'';
    const savedRulesTitle=R.rulesTitle||'';
    const savedRulesetId=R.rulesetId||null;
    const savedTrainerCapsText=R.trainerCapsText||'';
    if (counter > 0) {
      const bucket = ensureRunBucket(R, counter);
      if (!bucket.endedAt) bucket.endedAt = Date.now();
      addRunEvent(R,'run-reset',{}, {runNumber: counter});
    }
    const fresh=emptyRunState();
    Object.assign(R,fresh);
    R.runCounter=counter;
    R.runHistory=history;
    R.selectedEdition=edition;
    R.totalDeathCounts=savedTotal;
    R.runPassword=savedRunPassword;
    R.rulesText=savedRulesText;
    R.rulesTitle=savedRulesTitle;
    R.rulesetId=savedRulesetId;
    R.trainerCapsText=savedTrainerCapsText;
    R.runStatus='lobby';
    R.runElapsed=0;
    R.runStartedAt=null;
    bcast(c);saveRun(myPP);
    console.log(`[run-new] run=${myPP}`);
  });

  // Debug relay: forward a client's dlog to all others in the run
  socket.on('debug-log',({msg,t})=>{
    const c2=ctx(); if(!c2)return;
    const u=c2.run.users[socket.id];
    const pi=u?.playerIndex; const name=u?.name||'?';
    const label=(pi>=0?'P'+(pi+1)+':'+name:'👁'+name);
    // Send to everyone EXCEPT the sender
    socket.to(c2.roomId).emit('debug-remote',{label,msg:String(msg).slice(0,400),t:t||''});
  });

  socket.on('disconnect',()=>{

    if(!myPP) return;
    const run=runs.get(myPP); if(!run) return;
    const name=run.users[socket.id]?.name||'?';
    delete run.users[socket.id];
    const roomId=`run:${myPP}`;
    io.to(roomId).emit('peer-left',{id:socket.id});
    broadcastRoom(roomId,run);
    console.log(`[left] ${name} run=${myPP}`);
    if(Object.keys(run.users).length===0){clearTimeout(run.saveTimer);dbUpdate(myPP, JSON.stringify(run.state));runs.delete(myPP);console.log(`[run unloaded] ${myPP}`);}
  });
});

function broadcastRoom(roomId,run) { io.to(roomId).emit('room-state',Object.entries(run.users).map(([id,u])=>({id,...u}))); }

const HTTP_PORT  = process.env.PORT      || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
initDB().then(() => {
  httpServer.listen(HTTP_PORT, () => console.log(`\n🖥  SoulLink (HTTP):  http://localhost:${HTTP_PORT}`));
  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, () => console.log(`🔒  SoulLink (HTTPS): https://localhost:${HTTPS_PORT}  ← für Screen Capture\n`));
  }
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });


app.get('/api/runs/:passphrase/team/:playerIndex', (req, res) => {
  const pp = req.params.passphrase?.trim();
  const playerIndex = parseInt(req.params.playerIndex, 10);

  if (isNaN(playerIndex) || playerIndex < 0 || playerIndex >= 3) {
    return res.status(400).json({ error: 'Ungültige Spieler-ID' });
  }

  const run = getOrLoadRun(pp);
  if (!run) {
    return res.status(404).json({ error: 'Run nicht gefunden' });
  }

  const R = run.state;

  const team = R.team[playerIndex] || [];

  // 🔥 Nur lebende Pokémon im Team
  const livingTeam = team.filter(p => 
    p && 
    p.pokeId !== null && 
    p.alive === true
  );

  res.json({
    playerIndex,
    team: livingTeam
  });
});
