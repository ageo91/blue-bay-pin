// Blue Bay Pin leaderboard API (Cloudflare Worker + D1).
// No accounts: POST /player gives the device a secret token; the database stores only its SHA-256.
//
//   POST /player  {name}                    -> {token, name, tag}       pick a name (or rename, with the token)
//   GET  /me                                -> {name, tag}              needs Authorization: Bearer <token>
//   POST /score   {hole, strokes, best_m}   -> {strokes, best_m, rank, players}   keeps the best of the day
//   GET  /board?hole=6                      -> {day, rows:[{rank, name, tag, strokes, best_m, is_me}]}
//
// The day is the Curaçao date (UTC-4, no daylight saving), decided here, never by the game.

const NAME_OK = /^[A-Za-z0-9_ ]{3,16}$/;
const BANNED = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'whore', 'slut', 'dick', 'pussy', 'rape', 'nazi', 'hitler',
  'kut', 'lul', 'hoer', 'kanker', 'tering', 'tyfus', 'mongool', 'neuk', 'admin', 'bluebay', 'steffen'];
const SCORE_GAP_MS = 8000;        // one score post per player per 8 s
const SIGNUPS_PER_HOUR = 5;       // new names per IP per hour

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url), route = req.method + ' ' + url.pathname;
    try {
      if (route === 'POST /player') return await pickName(req, env, cors);
      if (route === 'GET /me') return await me(req, env, cors);
      if (route === 'POST /score') return await postScore(req, env, cors);
      if (route === 'GET /board') return await board(req, env, cors, url);
      return json({ error: 'not_found' }, 404, cors);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.code }, e.status, cors);
      console.error(e);
      return json({ error: 'server_error' }, 500, cors);
    }
  }
};

class ApiError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status } }

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Vary': 'Origin' };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function playerId(req) {
  const m = /^Bearer (.{20,100})$/.exec(req.headers.get('Authorization') || '');
  return m ? sha256(m[1]) : null;
}
async function body(req) { try { return await req.json() } catch { throw new ApiError('bad_request') } }
function curacaoDay(now = Date.now()) { return new Date(now - 4 * 3600e3).toISOString().slice(0, 10) }

async function pickName(req, env, cors) {
  const name = String((await body(req)).name || '').trim().replace(/\s+/g, ' ');
  if (!NAME_OK.test(name)) throw new ApiError('bad_name');
  const flat = name.toLowerCase().replace(/[\s_]/g, '');
  if (BANNED.some(w => flat.includes(w))) throw new ApiError('name_not_allowed');

  const db = env.DB, existing = await playerId(req);
  if (existing && await db.prepare('SELECT 1 FROM players WHERE id = ?').bind(existing).first()) {
    const tag = await freeTag(db, name, existing);
    await db.prepare('UPDATE players SET name = ?, tag = ? WHERE id = ?').bind(name, tag, existing).run();
    return json({ name, tag }, 200, cors);
  }
  const ip = await sha256('bb-ip:' + (req.headers.get('CF-Connecting-IP') || 'unknown')), hourAgo = Date.now() - 3600e3;
  const recent = await db.prepare('SELECT count(*) AS n FROM signups WHERE ip = ? AND at > ?').bind(ip, hourAgo).first();
  if (recent.n >= SIGNUPS_PER_HOUR) throw new ApiError('too_many', 429);

  const token = newToken(), id = await sha256(token), tag = await freeTag(db, name, id);
  await db.batch([
    db.prepare('INSERT INTO players (id, name, tag) VALUES (?, ?, ?)').bind(id, name, tag),
    db.prepare('INSERT INTO signups (ip, at) VALUES (?, ?)').bind(ip, Date.now()),
    db.prepare('DELETE FROM signups WHERE at < ?').bind(hourAgo)
  ]);
  return json({ token, name, tag }, 200, cors);
}
async function freeTag(db, name, id) {
  for (let i = 0; i < 8; i++) {
    const tag = 1000 + Math.floor(Math.random() * 9000);
    const taken = await db.prepare('SELECT 1 FROM players WHERE name = ? COLLATE NOCASE AND tag = ? AND id <> ?').bind(name, tag, id).first();
    if (!taken) return tag;
  }
  throw new ApiError('name_taken', 409);
}

async function me(req, env, cors) {
  const id = await playerId(req);
  const p = id && await env.DB.prepare('SELECT name, tag FROM players WHERE id = ?').bind(id).first();
  if (!p) throw new ApiError('no_player', 404);
  return json(p, 200, cors);
}

async function postScore(req, env, cors) {
  const db = env.DB, id = await playerId(req);
  if (!id || !await db.prepare('SELECT 1 FROM players WHERE id = ?').bind(id).first()) throw new ApiError('no_player', 401);
  const b = await body(req), hole = b.hole, strokes = b.strokes, best = Math.round(Number(b.best_m) * 10) / 10;
  if (!Number.isInteger(hole) || hole < 1 || hole > 18 || !Number.isInteger(strokes) || strokes < 1 || strokes > 20
      || !Number.isFinite(best) || best < 0 || best >= 700 || (strokes === 1 && best !== 0)) throw new ApiError('invalid_score');

  const now = Date.now(), day = curacaoDay(now);
  const last = await db.prepare('SELECT max(updated_at) AS t FROM scores WHERE player_id = ?').bind(id).first();
  if (last.t && now - last.t < SCORE_GAP_MS) throw new ApiError('too_fast', 429);

  await db.prepare(`INSERT INTO scores (player_id, hole, day, strokes, best_m, attempts, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT (player_id, hole, day) DO UPDATE SET
      attempts = attempts + 1, updated_at = excluded.updated_at,
      best_m = CASE WHEN excluded.strokes < strokes OR (excluded.strokes = strokes AND excluded.best_m < best_m) THEN excluded.best_m ELSE best_m END,
      strokes = min(strokes, excluded.strokes)`).bind(id, hole, day, strokes, best, now).run();

  const mine = await db.prepare('SELECT strokes, best_m FROM scores WHERE player_id = ? AND hole = ? AND day = ?').bind(id, hole, day).first();
  const counts = await db.prepare(`SELECT
      sum(CASE WHEN s.strokes < ?1 OR (s.strokes = ?1 AND s.best_m < ?2) THEN 1 ELSE 0 END) AS ahead, count(*) AS players
    FROM scores s JOIN players p ON p.id = s.player_id WHERE s.hole = ?3 AND s.day = ?4 AND p.hidden = 0`)
    .bind(mine.strokes, mine.best_m, hole, day).first();
  return json({ strokes: mine.strokes, best_m: mine.best_m, rank: (counts.ahead || 0) + 1, players: counts.players }, 200, cors);
}

async function board(req, env, cors, url) {
  const hole = Number(url.searchParams.get('hole'));
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new ApiError('bad_hole');
  const id = await playerId(req), day = curacaoDay();
  const { results } = await env.DB.prepare(`SELECT p.name, p.tag, s.strokes, s.best_m, s.player_id = ? AS is_me
    FROM scores s JOIN players p ON p.id = s.player_id
    WHERE s.hole = ? AND s.day = ? AND p.hidden = 0 ORDER BY s.strokes, s.best_m LIMIT 50`).bind(id || '', hole, day).all();
  let rank = 0, prev = null;
  const rows = results.map((r, i) => {
    const key = r.strokes + '/' + r.best_m; if (key !== prev) { rank = i + 1; prev = key }
    return { rank, name: r.name, tag: r.tag, strokes: r.strokes, best_m: r.best_m, is_me: !!r.is_me };
  });
  return json({ day, rows }, 200, cors);
}
