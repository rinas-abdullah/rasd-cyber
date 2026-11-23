# Booth 23 Apple Wallet pass

Visitors open `https://rasd-cyber-v3.netlify.app/23` (also `/wallet`, `/booth`) and tap
**Add to Apple Wallet**. After that, the iPhone shows the pass on the lock screen
with "🚨 مستشفى يتعرض لاختراق، أنقذه في جناح 23" whenever it is near the booth
(location + text are in `backend/services/walletPass.js`). The phone does the
location check itself; nothing is sent to us.

Until the pass is configured, the page hides the button and shows a "coming soon" note.

## Turning it on (once, needs an Apple Developer account)

1. developer.apple.com → Certificates, IDs & Profiles → Identifiers → **+** → Pass Type IDs,
   e.g. `pass.com.rasdcyber.booth`. Note your **Team ID** (top right).
2. Open the Pass Type ID → **Create Certificate**. Make the CSR:
   ```
   openssl req -new -newkey rsa:2048 -nodes -keyout signerKey.pem -out pass.csr -subj "/CN=Rasd Cyber Pass"
   ```
   Upload `pass.csr`, download `pass.cer`, then:
   ```
   openssl x509 -inform der -in pass.cer -out signerCert.pem
   ```
3. Download Apple's WWDR G4 certificate (`AppleWWDRCAG4.cer`) from
   https://www.apple.com/certificateauthority/
4. Pack and encrypt:
   ```
   node scripts/wallet-pack-certs.js --pass-type pass.com.rasdcyber.booth --team ABCDE12345 --cert signerCert.pem --key signerKey.pem --wwdr AppleWWDRCAG4.cer
   ```
   Commit `backend/wallet/certs.enc` (encrypted). **Never commit the .pem/.cer/.csr files.**
5. Netlify → Site configuration → Environment variables → add `WALLET_CERTS_KEY`
   with the value the script printed, then redeploy.

Test on a real iPhone: add the pass, walk away, come back to the booth.
iOS decides when to surface the pass; it is not guaranteed on every approach.
