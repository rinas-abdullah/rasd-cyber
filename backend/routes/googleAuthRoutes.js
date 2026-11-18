const express = require('express');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { config } = require('../config/environment');
const { issueToken, setAuthCookie } = require('../middleware/auth');
const { resolveGoogleUser } = require('../services/googleAuthService');

const STATE_COOKIE = 'rasdGoogleState';
const AUDIENCE = 'rasd:google-oauth';
function googleSettings() {
  const origin = config.public.siteOrigin;
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = origin ? origin + '/api/auth/google/callback' : '';
  return { clientId, clientSecret, redirectUri,
    enabled: Boolean(clientId && clientSecret && origin && config.database.type === 'postgresql') };
}
function stateOptions() {
  return { httpOnly: true, secure: config.server.isProduction, sameSite: 'lax', path: '/api/auth/google', maxAge: 600000 };
}
function readState(req) {
  const part = (req.headers.cookie || '').split(';').find(p => p.trim().startsWith(STATE_COOKIE + '='));
  if (!part) throw new Error('Missing OAuth state cookie');
  return jwt.verify(decodeURIComponent(part.trim().slice(STATE_COOKIE.length + 1)), config.security.jwt.secret,
    { algorithms: ['HS256'], audience: AUDIENCE, issuer: 'rasd' });
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}

function createGoogleRouter({ settings = googleSettings, clientFactory, resolveUser = resolveGoogleUser } = {}) {
  const router = express.Router();
  const clientFor = s => clientFactory ? clientFactory(s) : new OAuth2Client({
    clientId: s.clientId, clientSecret: s.clientSecret, redirectUri: s.redirectUri,
    transporterOptions: { timeout: 15000 },
  });
  router.get('/auth/providers', (req,res) => {
    res.set('Cache-Control','no-store').json({ success: true, data: { google: { enabled: settings().enabled } } });
  });
  router.get('/auth/google', (req,res) => {
    const s=settings();
    res.set('Cache-Control','no-store');
    if (!s.enabled) return res.redirect('/auth?google_error=unavailable');
    const state=crypto.randomBytes(32).toString('base64url');
    const nonce=crypto.randomBytes(32).toString('base64url');
    const verifier=crypto.randomBytes(48).toString('base64url');
    const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const cookie=jwt.sign({ state, nonce, verifier },config.security.jwt.secret,
      { algorithm:'HS256', expiresIn:'10m', audience:AUDIENCE, issuer:'rasd' });
    res.cookie(STATE_COOKIE,cookie,stateOptions());
    return res.redirect(clientFor(s).generateAuthUrl({ scope:['openid','email','profile'],
      state, nonce, code_challenge:challenge, code_challenge_method:'S256', prompt:'select_account' }));
  });
  router.get('/auth/google/callback', async (req,res) => {
    res.set({ 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' });
    const { maxAge, ...clearOptions }=stateOptions();
    res.clearCookie(STATE_COOKIE,clearOptions);
    const s=settings();
    if (!s.enabled) return res.redirect('/auth?google_error=unavailable');
    let pending;
    try {
      pending=readState(req);
      if (!equal(req.query.state,pending.state)) throw new Error('OAuth state mismatch');
    } catch { return res.redirect('/auth?google_error=invalid_state'); }
    if (req.query.error) return res.redirect('/auth?google_error=cancelled');
    if (typeof req.query.code!=='string' || !req.query.code || req.query.code.length>4096)
      return res.redirect('/auth?google_error=invalid_state');
    try {
      const client=clientFor(s);
      const { tokens }=await client.getToken({ code:req.query.code, codeVerifier:pending.verifier, redirect_uri:s.redirectUri });
      const ticket=await client.verifyIdToken({ idToken:tokens.id_token, audience:s.clientId });
      const profile=ticket.getPayload();
      if (!profile || !equal(profile.nonce,pending.nonce) || !profile.sub || profile.email_verified!==true || !profile.email)
        throw new Error('Invalid verified Google identity');
      const user=await resolveUser(profile);
      setAuthCookie(res,issueToken({ userId:user.id, username:user.username, role:user.role, institution_id:user.institution_id }));
      return res.redirect('/auth?google=success');
    } catch (error) {
      const code=['account_exists','disabled','unavailable'].includes(error.code) ? error.code : 'failed';
      // OAuth exceptions can contain authorization codes/tokens: never log them.
      console.warn('Google sign-in could not complete:',code);
      return res.redirect('/auth?google_error='+code);
    }
  });
  return router;
}
module.exports = { createGoogleRouter, googleSettings };
