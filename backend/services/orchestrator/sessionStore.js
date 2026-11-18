// Session Store (brief §3, §9, §13). Durable, resumable AI-training session state.
// Same dual-storage pattern as backend/data/*.js: an in-memory Map always (dev,
// demo, tests, and in-memory DB mode) PLUS a Postgres row (JSONB blob) whenever a
// real database is configured. A learner can close the browser and resume from
// the exact same state because the full session — state machine position, world,
// ledger, decisions, audit — is persisted on every mutation.
//
// The AI never writes here directly (brief §3 last line): only the Orchestrator
// and backend services call save(), after their own validation and auth checks.

const db = require("../../db");

const isPg = () => db?.DB_TYPE === db?.DATABASE_TYPES?.POSTGRESQL;

const mem = new Map(); // sessionId -> session object

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function create(session) {
  const now = new Date().toISOString();
  const entry = { ...session, createdAt: now, updatedAt: now };
  mem.set(entry.sessionId, entry);

  if (isPg()) {
    try {
      await db.query(
        `INSERT INTO ai_training_sessions
          (session_id, user_id, institution_id, skill, state, data, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6, NOW(), NOW())
         ON CONFLICT (session_id) DO NOTHING`,
        [
          entry.sessionId,
          entry.userId == null ? null : Number(entry.userId) || null,
          entry.institutionId == null ? null : Number(entry.institutionId) || null,
          entry.skill,
          entry.state,
          JSON.stringify(entry),
        ]
      );
    } catch (error) {
      console.error("[sessionStore] create write failed:", error.message);
      throw error;
    }
  }
  return clone(entry);
}

async function save(session) {
  session.updatedAt = new Date().toISOString();
  mem.set(session.sessionId, session);

  if (isPg()) {
    try {
      await db.query(
        `UPDATE ai_training_sessions
           SET state = $2, data = $3, updated_at = NOW()
         WHERE session_id = $1`,
        [session.sessionId, session.state, JSON.stringify(session)]
      );
    } catch (error) {
      console.error("[sessionStore] save write failed:", error.message);
      throw error;
    }
  }
  return clone(session);
}

async function get(sessionId) {
  if (mem.has(sessionId)) return clone(mem.get(sessionId));
  if (isPg()) {
    try {
      const res = await db.query(`SELECT data FROM ai_training_sessions WHERE session_id = $1`, [sessionId]);
      if (res.rows[0]) {
        const data = typeof res.rows[0].data === "string" ? JSON.parse(res.rows[0].data) : res.rows[0].data;
        mem.set(sessionId, data);
        return clone(data);
      }
    } catch (error) {
      console.warn("[sessionStore] get read failed:", error.message);
    }
  }
  return null;
}

async function listByUser(userId, institutionId) {
  const uid = String(userId);
  const iid = institutionId == null ? null : String(institutionId);
  const out = [];
  for (const s of mem.values()) {
    const sameUser = String(s.userId) === uid;
    const sameInstitution =
      iid == null ||
      String(s.institutionId ?? "") === iid;
    if (sameUser && sameInstitution) out.push(clone(s));
  }
  // (PG-only sessions not yet cached are loaded on demand via get(); listing
  // here returns the working set, which is sufficient for the dashboard + tests.)
  if (isPg()) {
    try {
      const query =
        iid == null
          ? `SELECT data FROM ai_training_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200`
          : `SELECT data FROM ai_training_sessions
             WHERE user_id = $1 AND institution_id = $2
             ORDER BY updated_at DESC LIMIT 200`;
      const params =
        iid == null
          ? [Number(userId) || null]
          : [Number(userId) || null, Number(institutionId) || null];
      const res = await db.query(query, params);
      const seen = new Set(out.map((s) => s.sessionId));
      for (const row of res.rows) {
        const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        if (!seen.has(data.sessionId)) out.push(data);
      }
    } catch (error) {
      console.warn("[sessionStore] listByUser read failed:", error.message);
    }
  }
  return out;
}

// Test / maintenance helper.
function _reset() {
  mem.clear();
}

module.exports = { create, save, get, listByUser, _reset };
