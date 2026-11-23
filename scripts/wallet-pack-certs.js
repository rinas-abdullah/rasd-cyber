#!/usr/bin/env node
// Encrypts the Apple Wallet signing material into backend/wallet/certs.enc and
// prints the key to put in Netlify as WALLET_CERTS_KEY.
//
// Usage:
//   node scripts/wallet-pack-certs.js \
//     --pass-type pass.com.example.rasd --team ABCDE12345 \
//     --cert signerCert.pem --key signerKey.pem [--passphrase "..."] \
//     --wwdr AppleWWDRCAG4.pem
//
// signerCert.pem / signerKey.pem come from your Pass Type ID certificate
// (export the .p12 from Keychain, or convert with openssl, see docs/WALLET-PASS.md).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
const need = ["pass-type", "team", "cert", "key", "wwdr"];
const missing = need.filter((k) => !args[k]);
if (missing.length) {
  console.error("Missing: " + missing.map((m) => "--" + m).join(", "));
  process.exit(1);
}
const toPem = (file) => {
  const buf = fs.readFileSync(file);
  const text = buf.toString("utf8");
  if (text.includes("-----BEGIN")) return text;
  // DER (e.g. AppleWWDRCAG4.cer) -> PEM
  const b64 = buf.toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
};
const bundle = JSON.stringify({
  passTypeIdentifier: args["pass-type"],
  teamIdentifier: args.team,
  signerCert: toPem(args.cert),
  signerKey: fs.readFileSync(args.key, "utf8"),
  signerKeyPassphrase: args.passphrase || "",
  wwdr: toPem(args.wwdr),
});
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const enc = Buffer.concat([cipher.update(bundle, "utf8"), cipher.final()]);
const out = args.out || path.join(__dirname, "..", "backend", "wallet", "certs.enc");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([iv, cipher.getAuthTag(), enc]));
console.log("Wrote " + out);
console.log("\nAdd this to Netlify → Site configuration → Environment variables:");
console.log("WALLET_CERTS_KEY=" + key.toString("base64"));
