const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServerlessHandler } = require('../backend/netlifyHandler');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-serverless-jwt-secret-123456789';
process.env.DB_TYPE = 'in-memory';
const app = require('../backend/server').app;
const handler = require('serverless-http')(app);

function post(body) {
  return handler({
    httpMethod: 'POST', path: '/api/auth/register',
    headers: { 'content-type': 'application/json' }, body,
    requestContext: { identity: { sourceIp: '127.0.0.1' } },
  }, {});
}

function postLogin(body) {
  return handler({
    httpMethod: 'POST', path: '/api/auth/login',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    requestContext: { identity: { sourceIp: '127.0.0.1' } },
  }, {});
}

test('serverless Express registration parses JSON bytes and issues an auth cookie', async () => {
  const response = await post(JSON.stringify({
    username: 'serverless_test', email: 'serverless-test@example.com', password: 'Test@Serverless123!',
  }));
  assert.equal(response.statusCode, 201, response.body);
  assert.ok(JSON.parse(response.body).data.token);
  const cookies = response.multiValueHeaders?.['set-cookie'] || [response.headers?.['set-cookie'] || ''];
  assert.ok(cookies.some(cookie => cookie.includes('HttpOnly')));
});

test('login accepts the auth page identifier and legacy email payloads', async () => {
  const credentials = {
    username: 'login_probe',
    email: 'login-probe@example.com',
    password: 'Login@Probe123!',
  };
  const registration = await post(JSON.stringify(credentials));
  assert.equal(registration.statusCode, 201, registration.body);

  const byUsername = await postLogin({ identifier: credentials.username, password: credentials.password });
  assert.equal(byUsername.statusCode, 200, byUsername.body);
  assert.ok(JSON.parse(byUsername.body).data.token);

  const byEmail = await postLogin({ email: credentials.email, password: credentials.password });
  assert.equal(byEmail.statusCode, 200, byEmail.body);
  assert.ok(JSON.parse(byEmail.body).data.token);
});

test('serverless Express rejects malformed JSON', async () => {
  const response = await post('{broken');
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).message, 'Invalid request body');
});

test('Netlify Express wrapper preserves binary image responses', async () => {
  const imagePath = path.join(__dirname, '../frontend/assets/landing/evaluation-aar.png');
  const image = fs.readFileSync(imagePath);
  const imageHandler = createServerlessHandler(app);
  const response = await imageHandler({
    httpMethod: 'GET',
    path: '/frontend/assets/landing/evaluation-aar.png',
    headers: {},
  }, {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.isBase64Encoded, true);
  assert.deepEqual(Buffer.from(response.body, 'base64'), image);
});
