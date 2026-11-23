"use strict";
// Apple Wallet pass for the SAIF 2026 booth.
//
// When a visitor adds this pass, iOS shows it on the lock screen with the
// "relevantText" whenever the phone is near one of the pass locations, the
// same mechanism loyalty-card apps use for "you're passing by" notifications.
//
// Apple only accepts signed passes. Signing material comes from an Apple
// Developer account (Pass Type ID certificate + Apple WWDR certificate).
// The PEM files are too large for Netlify function env vars, so they live in
// the repo as an AES-256-GCM encrypted bundle (backend/wallet/certs.enc, made
// by scripts/wallet-pack-certs.js); only the short decryption key is an env var.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ASSET_DIR = path.join(__dirname, "..", "..", "frontend", "assets", "wallet");
const BUNDLE_PATH = path.join(__dirname, "..", "wallet", "certs.enc");

const BOOTH = {
  number: "23",
  // SAIF 2026 venue, Riyadh International Convention & Exhibition Center.
  latitude: 24.751195907592773,
  longitude: 46.7265625,
  days: ["2026-11-24", "2026-11-25", "2026-11-26"],
};
const SITE_URL = "https://rasd-cyber-v3.netlify.app";
const ALERT_TEXT = "🚨 مستشفى يتعرض لاختراق، أنقذه في جناح 23 · A hospital is under attack. Save it at booth 23";

const bundlePath = (env) => env.WALLET_CERTS_BUNDLE || BUNDLE_PATH;

function decryptBundle(keyB64, file) {
  const raw = fs.readFileSync(file);
  const key = Buffer.from(keyB64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  return JSON.parse(json);
}

/** Returns signing material, or null when the pass is not configured yet. */
function loadCertificates(env = process.env) {
  if (!env.WALLET_CERTS_KEY || !fs.existsSync(bundlePath(env))) return null;
  const b = decryptBundle(env.WALLET_CERTS_KEY, bundlePath(env));
  if (!b.wwdr || !b.signerCert || !b.signerKey || !b.passTypeIdentifier || !b.teamIdentifier) return null;
  return b;
}

function isConfigured(env = process.env) {
  return Boolean(env.WALLET_CERTS_KEY) && fs.existsSync(bundlePath(env));
}

/** pass.json contents (exported for tests). */
function buildPassJson({ passTypeIdentifier, teamIdentifier, serialNumber }) {
  return {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber,
    organizationName: "Rasd Cyber",
    description: "Rasd Cyber · SAIF 2026 booth 23",
    logoText: "رصد سايبر",
    foregroundColor: "rgb(244,244,233)",
    backgroundColor: "rgb(14,46,42)",
    labelColor: "rgb(243,160,94)",
    // Lock-screen relevance: shown when the phone is near the booth.
    locations: [{ latitude: BOOTH.latitude, longitude: BOOTH.longitude, relevantText: ALERT_TEXT }],
    maxDistance: 150,
    relevantDate: `${BOOTH.days[0]}T09:00:00+03:00`,
    relevantDates: BOOTH.days.map((d) => ({ startDate: `${d}T09:00:00+03:00`, endDate: `${d}T22:00:00+03:00` })),
    expirationDate: "2026-11-27T23:59:00+03:00",
    barcodes: [{ format: "PKBarcodeFormatQR", message: SITE_URL, messageEncoding: "iso-8859-1", altText: "rasd-cyber-v3.netlify.app" }],
    eventTicket: {
      headerFields: [{ key: "booth", label: "BOOTH · الجناح", value: BOOTH.number }],
      primaryFields: [{ key: "title", label: "SAIF 2026", value: "المستشفى يحتاج إنقاذك" }],
      secondaryFields: [
        { key: "tagline", label: "THE HOSPITAL NEEDS YOU", value: "3-minute crisis · أزمة 3 دقائق" },
      ],
      auxiliaryFields: [
        { key: "date", label: "DATE · التاريخ", value: "24–26.11.2026" },
        { key: "venue", label: "VENUE · المكان", value: "Riyadh · الرياض" },
      ],
      backFields: [
        { key: "about", label: "رصد سايبر", value: "منصة تدريب على الاستجابة للحوادث السيبرانية: مستشفى افتراضي تحت الهجوم، ثلاث دقائق، وقراراتك تحدد النتيجة." },
        { key: "site", label: "المنصة · Platform", value: SITE_URL },
        { key: "privacy", label: "الخصوصية · Privacy", value: "البطاقة لا ترسل موقعك لأحد. جوالك هو اللي يقارن موقعه بموقع الجناح ويعرض التذكير. The pass never shares your location." },
      ],
    },
  };
}

function readAssets() {
  const files = {};
  for (const name of fs.readdirSync(ASSET_DIR)) {
    if (name.endsWith(".png")) files[name] = fs.readFileSync(path.join(ASSET_DIR, name));
  }
  return files;
}

/** Builds a signed .pkpass buffer. Throws if certificates are missing. */
async function generatePass({ serialNumber = crypto.randomUUID(), env = process.env } = {}) {
  const certs = loadCertificates(env);
  if (!certs) {
    const err = new Error("Wallet pass is not configured");
    err.code = "WALLET_NOT_CONFIGURED";
    throw err;
  }
  const { PKPass } = require("passkit-generator");
  const passJson = buildPassJson({
    passTypeIdentifier: certs.passTypeIdentifier,
    teamIdentifier: certs.teamIdentifier,
    serialNumber,
  });
  const pass = new PKPass(
    { ...readAssets(), "pass.json": Buffer.from(JSON.stringify(passJson)) },
    {
      wwdr: certs.wwdr,
      signerCert: certs.signerCert,
      signerKey: certs.signerKey,
      signerKeyPassphrase: certs.signerKeyPassphrase || undefined,
    },
  );
  return pass.getAsBuffer();
}

module.exports = { BOOTH, SITE_URL, ALERT_TEXT, buildPassJson, generatePass, isConfigured, loadCertificates, BUNDLE_PATH };
