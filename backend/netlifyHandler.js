"use strict";

// The actual Express application: no demo API or duplicate routing layer.
const serverless = require("serverless-http");
let initPromise;

const BINARY_CONTENT_TYPES = ["image/*", "font/*", "application/octet-stream"];

function createServerlessHandler(app) {
  return serverless(app, { binary: BINARY_CONTENT_TYPES });
}

async function initialize() {
  const fs = require('node:fs');
  const path = require('node:path');
  if (!process.env.RASD_PUBLIC_ROOT) {
    const publicRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rasd-public-'));
    const assets = require('./public-assets.json');
    for (const [relative, content] of Object.entries(assets)) {
      const target = path.join(publicRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(content, 'base64'));
    }
    process.env.RASD_PUBLIC_ROOT = publicRoot;
  }
  // Netlify Database exposes runtime bindings through its SDK as well as env.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = require("@netlify/database").getConnectionString();
  }
  const db = require("./db");
  // A Lambda's heap is ephemeral. Refuse a misleading in-memory "production".
  if (db.DB_TYPE !== "postgresql" || !(process.env.DATABASE_URL || process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL)) {
    throw new Error("RASD Netlify requires DB_TYPE=postgresql and DATABASE_URL for persistent sessions.");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set a private JWT_SECRET of at least 32 characters in Netlify environment variables.");
  }
  // All app modules must load only after production config is in place.
  const { app } = require("./server");
  const database = await db.connectDatabase();
  if (!database.success) throw new Error(database.message);
  // Existing migrations are idempotent. Run them on a cold start only.
  await db.ensureSchema();
  return createServerlessHandler(app);
}

exports.handler = async (event, context) => {
  // Netlify's Lambda event omits API Gateway's identity.sourceIp field.
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const clientIp = headers['x-nf-client-connection-ip'] || headers['client-ip'];
  if (require('node:net').isIP(clientIp || '')) {
    event.requestContext ||= {};
    event.requestContext.identity ||= {};
    event.requestContext.identity.sourceIp = clientIp;
  }
  if (!initPromise) initPromise = initialize();
  try {
    const handler = await initPromise;
    return await handler(event, context);
  } catch (error) {
    // Recover if a transient DB failure resolves on a later invocation.
    initPromise = undefined;
    console.error("RASD function initialization/request failed:", error.message);
    return {
      statusCode: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ success: false, error: "Service temporarily unavailable; check deployment configuration and database." }),
    };
  }
};

exports.createServerlessHandler = createServerlessHandler;
