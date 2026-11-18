// Exercise the same public HTTP flows locally and after deployment.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const base = process.argv[2] || 'http://127.0.0.1:3001';
let token;
async function request(path, body, expected = 200) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${path}: ${text.slice(0, 500)}`);
  console.log(`${response.status} ${path}`);
  return response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
}
(async () => {
  for (const path of ['/', '/health', '/ai-command', '/auth', '/css/style.css', '/js/components/commandExperience.js']) await request(path);
  for (const path of ['/backend/server.js', '/package.json', '/setup_db.sql']) await request(path, undefined, 404);
  await request('/api/ai/sessions', undefined, 401);
  const username = 'qa_' + crypto.randomBytes(5).toString('hex');
  const password = crypto.randomBytes(18).toString('hex') + 'Aa1!';
  const email = username + '@example.com';
  const auth = await request('/api/auth/register', { username, email, password }, 201);
  token = auth.data.token;
  assert.ok(token);
  await request('/api/auth/me');
  const login = await request('/api/auth/login', { email, password });
  token = login.data.token;
  const session = (await request('/api/ai/sessions', { skill: 'privileged-account-compromise', assessmentLevel: 4 }, 201)).data;
  assert.equal(session.state, 'SIMULATION');
  const path = '/api/ai/sessions/' + session.sessionId;
  await request(path + '/hint', { level: 1 });
  await request(path + '/pause', {});
  await request(path + '/resume', {});
  for (const optionId of ['d_collect_logs', 'd_suspend_account', 'd_escalate']) await request(path + '/decisions', { optionId, elapsedMs: 2200 });
  if ((await request(path)).data.state === 'SIMULATION') await request(path + '/end-phase', {});
  await request(path + '/after-action');
  await request(path + '/verify', {});
  for (const optionId of ['d_collect_logs', 'd_suspend_account', 'd_escalate']) await request(path + '/decisions', { optionId, elapsedMs: 2200 });
  if ((await request(path)).data.state === 'VERIFICATION') await request(path + '/end-phase', {});
  if ((await request(path)).data.state !== 'COMPLETED') await request(path + '/complete', {});
  const saved = (await request(path)).data;
  assert.equal(saved.state, 'COMPLETED');
  const archive = (await request('/api/ai/sessions')).data.sessions;
  assert.ok(archive.some(s => s.sessionId === session.sessionId));
  await request('/api/ai/readiness');
  console.log('PASS: registration, login, training, verification, archive, and readiness');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

