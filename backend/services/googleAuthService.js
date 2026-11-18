const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('../db');

// Provider identities are keyed by Google's stable subject, never by a
// user-supplied email. Existing password accounts require explicit linking.
async function resolveGoogleUser(profile) {
  if (db.DB_TYPE !== 'postgresql') throw Object.assign(new Error('Persistent storage required'), { code: 'unavailable' });
  const client = await db.getDatabaseClient().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['google:' + profile.sub]);
    const existing = await client.query(
      `SELECT u.id, u.username, u.is_active, u.institution_id, r.name AS role
       FROM auth_identities i JOIN users u ON u.id=i.user_id
       JOIN roles r ON r.id=u.role_id WHERE i.provider='google' AND i.subject=$1`, [profile.sub]);
    if (existing.rows.length) {
      if (!existing.rows[0].is_active) throw Object.assign(new Error('Account disabled'), { code: 'disabled' });
      await client.query('COMMIT');
      return existing.rows[0];
    }
    const email = profile.email.trim().toLowerCase();
    const duplicate = await client.query('SELECT id FROM users WHERE lower(email)=$1 LIMIT 1', [email]);
    if (duplicate.rows.length) throw Object.assign(new Error('Existing password account'), { code: 'account_exists' });
    // Google accounts have an unguessable password; no Google token is stored.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('base64url'), 12);
    const username = 'google_' + crypto.randomBytes(8).toString('hex');
    const created = await client.query(
      `INSERT INTO users (username,email,password_hash,role_id)
       VALUES ($1,$2,$3,(SELECT id FROM roles WHERE name='learner'))
       RETURNING id,username,institution_id`, [username,email,passwordHash]);
    const user = created.rows[0];
    await client.query("INSERT INTO auth_identities (provider,subject,user_id) VALUES ('google',$1,$2)", [profile.sub,user.id]);
    await client.query('COMMIT');
    return { ...user, role: 'learner' };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') error.code = 'account_exists';
    throw error;
  } finally { client.release(); }
}

module.exports = { resolveGoogleUser };
