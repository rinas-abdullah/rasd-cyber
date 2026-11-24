"use strict";
// Vercel entry: the same Express app as Netlify, one serverless function for every route.
let ready = null;

function init() {
  return (async () => {
    const db = require("../backend/db");
    if (db.DB_TYPE !== "postgresql") throw new Error("Set DB_TYPE=postgresql and DATABASE_URL on Vercel.");
    const { app } = require("../backend/server");
    const r = await db.connectDatabase();
    if (!r.success) throw new Error(r.message);
    await db.ensureSchema();
    return app;
  })();
}

module.exports = async (req, res) => {
  if (!ready) ready = init();
  let app;
  try {
    app = await ready;
  } catch (err) {
    ready = null; // retry on the next request (e.g. a transient DB failure)
    console.error("RASD init failed:", err.message);
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ success: false, error: "Service temporarily unavailable" }));
  }
  return app(req, res);
};
