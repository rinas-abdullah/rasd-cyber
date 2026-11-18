const test=require('node:test');
const assert=require('node:assert/strict');
process.env.NODE_ENV='test';
process.env.DB_TYPE='in-memory';
process.env.JWT_SECRET='google-oauth-test-secret-at-least-32-characters';
const express=require('express');
const serverless=require('serverless-http');
const { OAuth2Client }=require('google-auth-library');
const { createGoogleRouter }=require('../backend/routes/googleAuthRoutes');
const { verifyToken }=require('../backend/middleware/auth');

function fixture(overrides={}){
  let nonce, verifier, persisted=0, exchanges=0;
  const s={clientId:'test.apps.googleusercontent.com',clientSecret:'test-secret',redirectUri:'https://rasd.example/api/auth/google/callback',enabled:true,...overrides.settings};
  const client=new OAuth2Client(s.clientId,s.clientSecret,s.redirectUri);
  const generate=client.generateAuthUrl.bind(client);
  client.generateAuthUrl=options=>{nonce=options.nonce;return generate(options);};
  client.getToken=async options=>{exchanges++;verifier=options.codeVerifier;return {tokens:{id_token:'test-signed-token'}};};
  client.verifyIdToken=async options=>{assert.equal(options.audience,s.clientId);if(overrides.invalidSignature)throw new Error('Bad signature');return {getPayload:()=>({sub:'google-subject-123',email:'learner@example.com',email_verified:true,nonce,...overrides.profile})};};
  const app=express();
  app.use(createGoogleRouter({settings:()=>s,clientFactory:()=>client,resolveUser:async()=>{persisted++;if(overrides.conflict)throw Object.assign(new Error('Existing account'),{code:'account_exists'});return{id:51,username:'google_learner',role:'learner'};}}));
  const handler=serverless(app);
  const call=(path,cookie)=>handler({httpMethod:'GET',path:path.split('?')[0],queryStringParameters:Object.fromEntries(new URLSearchParams(path.split('?')[1]||'')),headers:cookie?{cookie}:{},requestContext:{identity:{sourceIp:'127.0.0.1'}}},{});
  return {call,get verifier(){return verifier;},get persisted(){return persisted;},get exchanges(){return exchanges;}};
}
function cookies(response){return response.multiValueHeaders?.['set-cookie']||[response.headers?.['set-cookie']||''];}
async function begin(f){const response=await f.call('/auth/google');const url=new URL(response.headers.location);return{response,url,cookie:cookies(response)[0].split(';')[0]};}
async function finish(f,started){return f.call('/auth/google/callback?code=code-from-google&state='+started.url.searchParams.get('state'),started.cookie);}

test('Google start uses PKCE, nonce and a short-lived HttpOnly SameSite=Lax state cookie',async()=>{
  const {response,url}=await begin(fixture());
  assert.equal(url.origin,'https://accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.ok(url.searchParams.get('nonce'));
  assert.equal(url.searchParams.get('redirect_uri'),'https://rasd.example/api/auth/google/callback');
  assert.ok(cookies(response)[0].includes('HttpOnly'));
  assert.ok(cookies(response)[0].includes('SameSite=Lax'));
  assert.ok(cookies(response)[0].includes('Max-Age=600'));
});
test('Google callback rejects missing or mismatched browser state before exchanging a code',async()=>{
  const f=fixture(),s=await begin(f);
  const missing=await f.call('/auth/google/callback?code=abc&state=wrong');
  const mismatch=await f.call('/auth/google/callback?code=abc&state=wrong',s.cookie);
  assert.equal(missing.headers.location,'/auth?google_error=invalid_state');
  assert.equal(mismatch.headers.location,'/auth?google_error=invalid_state');
  assert.equal(f.exchanges,0);
});
for(const [name,options] of [['nonce mismatch',{profile:{nonce:'wrong'}}],['unverified email',{profile:{email_verified:false}}],['invalid ID-token signature',{invalidSignature:true}]]){
  test('Google callback refuses '+name,async()=>{
    const f=fixture(options),s=await begin(f),r=await finish(f,s);
    assert.equal(r.headers.location,'/auth?google_error=failed');
    assert.equal(f.persisted,0);
    assert.ok(!cookies(r).some(c=>c.startsWith('authToken=')));
  });
}
test('Verified Google identity receives the existing application session cookie without leaking provider tokens',async()=>{
  const f=fixture(),s=await begin(f),r=await finish(f,s);
  assert.equal(r.headers.location,'/auth?google=success');
  assert.ok(f.verifier);
  assert.equal(f.persisted,1);
  const cookie=cookies(r).find(c=>c.startsWith('authToken='));
  assert.ok(cookie.includes('HttpOnly'));
  assert.equal(verifyToken(decodeURIComponent(cookie.split(';')[0].slice('authToken='.length))).userId,51);
  assert.ok(!JSON.stringify(r).includes('test-signed-token'));
});
test('An existing password account is not silently linked to Google',async()=>{
  const f=fixture({conflict:true}),r=await finish(f,await begin(f));
  assert.equal(r.headers.location,'/auth?google_error=account_exists');
  assert.ok(!cookies(r).some(c=>c.startsWith('authToken=')));
});
test('Unconfigured Google provider reports disabled and does not send users to a broken OAuth client',async()=>{
  const f=fixture({settings:{enabled:false}});
  assert.equal(JSON.parse((await f.call('/auth/providers')).body).data.google.enabled,false);
  assert.equal((await f.call('/auth/google')).headers.location,'/auth?google_error=unavailable');
});
