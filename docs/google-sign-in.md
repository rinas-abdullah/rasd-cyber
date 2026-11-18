# Google sign-in

The app uses Google's Authorization Code flow with PKCE, a signed HttpOnly
SameSite=Lax state cookie, and an ID-token nonce. Google's official library
verifies the ID token's signature, audience, issuer, and expiration. The app
also checks the nonce and requires a verified email before issuing its own
HttpOnly session cookie. Google access/refresh tokens are never stored.

## Required external setup

Create or use a Google Cloud OAuth client of type **Web application**.
Configure the Google Auth Platform branding, audience, and the basic
openid/email/profile scopes. When using Google's Testing audience, add the
intended Google test users. Publish the audience when ready for general use.

Authorized JavaScript origin:

    https://rasd-cyber-v3-live.netlify.app

Authorized redirect URI (must match exactly):

    https://rasd-cyber-v3-live.netlify.app/api/auth/google/callback

Set the following **server-side production** Netlify environment variables:

- GOOGLE_CLIENT_ID: the Web OAuth client ID.
- GOOGLE_CLIENT_SECRET: the client secret, stored as a secret. Do not paste it
  into chat, browser-side code, or tracked files.

SITE_URL is already configured for the production domain. Redeploy after
setting the variables. Until then, /api/auth/providers reports Google as
disabled and the login page offers the existing email/password flow.

## Identity persistence

The migration 20261117200000_google_identities creates auth_identities, keyed
by Google's stable subject. New users receive the learner role. Google logins
never silently merge into pre-existing password accounts with the same email;
such users are directed to their existing password login. Disabled accounts
cannot sign in through Google.

## Verification

Automated tests cover PKCE/state cookies, callback state mismatch, nonce
mismatch, unverified email, invalid token signatures, session issuance,
existing-account conflict, and the unconfigured-provider path.

After configuration, complete a real Google login from /auth, confirm the
dashboard/command center session, sign out and sign in again, and verify the
same Google identity resumes the same account and training archive. Live
Google login cannot be verified until the external OAuth client is configured.
