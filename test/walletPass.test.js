"use strict";
// Wallet pass: signs a pass end-to-end with throwaway self-signed certificates
// (iPhones would reject these; this checks our pipeline, not Apple's trust chain).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const forge = require("node-forge");
const wallet = require("../backend/services/walletPass");

function selfSigned(cn) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000 * 30);
  const attrs = [{ name: "commonName", value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert: forge.pki.certificateToPem(cert), key: forge.pki.privateKeyToPem(keys.privateKey) };
}

test("pass.json puts booth 23 location and lock-screen text on the pass", () => {
  const p = wallet.buildPassJson({ passTypeIdentifier: "pass.test", teamIdentifier: "TEAM123456", serialNumber: "s1" });
  assert.strictEqual(p.locations.length, 1);
  assert.ok(Math.abs(p.locations[0].latitude - 24.7512) < 0.001);
  assert.ok(Math.abs(p.locations[0].longitude - 46.7266) < 0.001);
  assert.match(p.locations[0].relevantText, /جناح 23/);
  assert.strictEqual(p.barcodes[0].message, "https://rasd-cyber-v3.netlify.app");
  assert.strictEqual(p.eventTicket.headerFields[0].value, "23");
});

test("not configured -> WALLET_NOT_CONFIGURED", async () => {
  await assert.rejects(wallet.generatePass({ env: {} }), (e) => e.code === "WALLET_NOT_CONFIGURED");
  assert.strictEqual(wallet.isConfigured({}), false);
});

test("packed certs produce a signed .pkpass zip", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-"));
  const signer = selfSigned("Pass Type ID: pass.test");
  const wwdr = selfSigned("Test WWDR");
  fs.writeFileSync(path.join(dir, "c.pem"), signer.cert);
  fs.writeFileSync(path.join(dir, "k.pem"), signer.key);
  fs.writeFileSync(path.join(dir, "w.pem"), wwdr.cert);
  const bundle = path.join(dir, "certs.enc");
  const out = execFileSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "wallet-pack-certs.js"),
    "--pass-type", "pass.test", "--team", "TEAM123456",
    "--cert", path.join(dir, "c.pem"), "--key", path.join(dir, "k.pem"), "--wwdr", path.join(dir, "w.pem"),
    "--out", bundle,
  ]).toString();
  const key = out.match(/WALLET_CERTS_KEY=(\S+)/)[1];
  const env = { WALLET_CERTS_KEY: key, WALLET_CERTS_BUNDLE: bundle };
  assert.strictEqual(wallet.isConfigured(env), true);
  const buf = await wallet.generatePass({ env, serialNumber: "t-1" });
  assert.strictEqual(buf.subarray(0, 2).toString(), "PK"); // zip
  const names = buf.toString("latin1");
  for (const f of ["pass.json", "manifest.json", "signature", "icon.png", "logo.png"]) assert.ok(names.includes(f), f);
});
