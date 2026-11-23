const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const crypto = require("crypto");
const fsp = require("fs").promises;
// ===== CONFIGURATION & UTILITIES =====
const envModule = require("./config/environment");
const config = envModule.config || envModule;
const validateConfig =
  typeof envModule.validateConfig === "function"
    ? envModule.validateConfig
    : null;

const logger = require("./utils/logger");
const { ROUTES } = require("./config/constants");
const db = require("./db");

// ===== MIDDLEWARE =====
const { sanitizeRequest } = require("./middleware/validation");
const { requestIdMiddleware } = require("./middleware/requestId");
const {
  errorHandler,
  notFoundHandler,
} = require("./middleware/errorHandler");

// ===== ROUTES =====
const apiRoutes = require("./routes/api");

const app = express();

// ===== PATH CONFIGURATION =====
// Bundled serverless functions need a stable root for HTML and frontend assets.
const rootPath = process.env.RASD_PUBLIC_ROOT || path.resolve(__dirname, "..");
const pagesPath = path.join(rootPath, "frontend", "pages");

// ===== EXPRESS SETTINGS =====
if (config.server?.trustProxy) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(requestIdMiddleware);

// ===== HELPERS =====
function getSafeCorsOrigin(originConfig) {
  if (!originConfig || originConfig.length === 0) {
    return false;
  }
  return originConfig;
}

// Content hash of the shipped CSS/JS. Every `?v=...` cache-buster in the HTML
// is rewritten to it, so a deploy that changes a stylesheet or script is seen
// immediately despite the 1h asset cache — no hand-bumping version strings.
const ASSET_VERSION = (() => {
  const fs = require("fs");
  const hash = crypto.createHash("sha1");
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else { hash.update(e.name); hash.update(fs.readFileSync(full)); }
    }
  };
  walk(path.join(rootPath, "css"));
  walk(path.join(rootPath, "js"));
  return hash.digest("hex").slice(0, 10);
})();

function injectNonce(html, nonce) {
  html = html.replace(/(\.(?:css|js))\?v=[A-Za-z0-9._-]+/g, `$1?v=${ASSET_VERSION}`);
  // Add the per-request CSP nonce to every <script> so the pages' inline
  // bootstrap scripts run under a strict policy (no 'unsafe-inline'). Safe
  // because these HTML files never contain the literal "<script" inside a
  // string or template literal (verified).
  return html.replace(/<script/g, `<script nonce="${nonce}"`);
}

async function sendPage(res, pageFileName, next) {
  try {
    const filePath = path.join(pagesPath, pageFileName);
    const html = await fsp.readFile(filePath, "utf8");
    res.type("html").send(injectNonce(html, res.locals.cspNonce || ""));
  } catch (err) {
    if (typeof next === "function") next(err);
  }
}

// ===== VALIDATE CONFIG =====
if (validateConfig) {
  validateConfig();
}

// ===== GLOBAL MIDDLEWARE =====
app.use(
  cors({
    origin: getSafeCorsOrigin(config.cors?.origins),
    credentials: config.cors?.credentials,
  })
);
// Per-request CSP nonce. Every page's inline <script> is tagged with this
// nonce (see injectNonce), so the Content-Security-Policy can allow those
// specific scripts without a blanket 'unsafe-inline' — which would re-open the
// door to injected scripts. Must run before helmet so the directive can read it.
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
});

// Strict CSP: scripts run only from same origin, the per-request nonce, or the
// one CDN actually used (Chart.js on jsdelivr). No 'unsafe-inline' for scripts,
// and inline event-handler attributes (onclick=...) are banned outright
// (script-src-attr 'none') — all handlers are wired via addEventListener.
// Inline styles are still allowed (low risk, and used widely for theming).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, "https://cdn.jsdelivr.net"],
        "script-src-attr": ["'none'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      },
    },
  })
);
app.use(compression());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// serverless-http supplies a completed request with a Buffer body. Express 5
// skips its stream parser for that request, so normalize the existing bytes.
app.use((req, res, next) => {
  if (!Buffer.isBuffer(req.body)) return next();
  if (req.body.length > 10 * 1024 * 1024) return res.status(413).json({ success: false, message: "Request body too large" });
  try {
    if (req.is("application/json")) {
      req.body = req.body.length ? JSON.parse(req.body.toString("utf8")) : {};
      if (req.body === null || typeof req.body !== "object") throw new Error("Expected a JSON object or array");
    } else if (req.is("application/x-www-form-urlencoded")) {
      req.body = Object.fromEntries(new URLSearchParams(req.body.toString("utf8")));
    } else if (!req.body.length) {
      req.body = {};
    } else {
      return res.status(415).json({ success: false, message: "Unsupported content type" });
    }
    next();
  } catch {
    res.status(400).json({ success: false, message: "Invalid request body" });
  }
});
app.use(sanitizeRequest);
app.use(logger.requestLogger.bind(logger));

// ===== STATIC FILE SERVING =====
// HTML shells (index.html, frontend/pages/*.html) are left at the default
// (no caching) so a redeploy is visible immediately; CSS/JS assets get a
// short cache window since they're the bulk of repeat-visit payload weight.
// Order matters: the /css and /js handlers must run before the catch-all
// rootPath one below, or express.static(rootPath) matches those files first
// (rootPath already contains css/ and js/) and its default no-cache headers
// win instead of STATIC_ASSET_OPTIONS.
const STATIC_ASSET_OPTIONS = { maxAge: "1h" };
app.use("/css", express.static(path.join(rootPath, "css"), STATIC_ASSET_OPTIONS));
app.use("/js", express.static(path.join(rootPath, "js"), STATIC_ASSET_OPTIONS));
// index:false so "/" falls through to the HOME route below, which injects the
// CSP nonce into index.html (express.static would serve it raw, with no nonce).
// Expose only public assets, never backend source or configuration files.
app.use("/frontend/assets", express.static(path.join(rootPath, "frontend", "assets"), STATIC_ASSET_OPTIONS));
app.get("/frontend/pages/:page", (req, res, next) => {
  if (!/^[a-z-]+\.html$/.test(req.params.page)) return next();
  return sendPage(res, req.params.page, next);
});

// ===== API ROUTES =====
app.use(ROUTES.API.PREFIX, apiRoutes);

app.get("/health", (req, res) => {
  const database = db.getDatabaseStatus();
  const healthy = db.DB_TYPE === "in-memory" || database.connected;
  res.status(healthy ? 200 : 503).json({
    success: true,
    status: "ok",
    ready: healthy,
    database: {
      type: database.type,
      connected: database.connected,
      provider: database.provider,
      mode: database.mode,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    requestId: req.requestId || null,
  });
});

app.get("/status", (req, res) => {
  res.status(200).json({
    success: true,
    environment: config.server?.nodeEnv || "development",
    database: config.database?.type || "in-memory",
    requestId: req.requestId || null,
  });
});

// ===== PAGE ROUTES =====

// Home page -> always public
app.get(ROUTES.PAGES.HOME, async (req, res, next) => {
  try {
    const html = await fsp.readFile(path.join(rootPath, "index.html"), "utf8");
    res.type("html").send(injectNonce(html, res.locals.cspNonce || ""));
  } catch (err) {
    next(err);
  }
});

// Brand mark as the site icon (browsers request /favicon.ico on every page).
const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="14" fill="#071d1c"/>' +
  '<circle cx="32" cy="32" r="18" fill="none" stroke="#f3a05e" stroke-width="5"/>' +
  '<circle cx="32" cy="32" r="6" fill="#f3a05e"/></svg>';
app.get(["/favicon.ico", "/favicon.svg"], (req, res) => {
  res.set("Cache-Control", "public, max-age=86400").type("image/svg+xml").send(FAVICON_SVG);
});

// Apple Wallet booth pass: iOS shows it on the lock screen near booth 23.
const walletPass = require("./services/walletPass");
app.get(["/wallet", "/booth", "/23"], (req, res, next) => sendPage(res, "wallet.html", next));
// Booth laptop attract screen, and the phishing-awareness QR demo.
app.get("/wall", (req, res, next) => sendPage(res, "wall.html", next));
app.get("/prize", (req, res, next) => sendPage(res, "prize.html", next));
app.get(["/id", "/me"], (req, res, next) => sendPage(res, "identity.html", next));

// Two booth iPads acting out a social-engineering call (hacker vs receptionist).
const boothDuo = require("./services/boothDuo");
const duoRoom = (v) => (/^[a-z0-9-]{1,20}$/.test(String(v || "")) ? String(v) : "main");
app.get("/duo", (req, res, next) => sendPage(res, "duo.html", next));
app.get("/duo/api/state", async (req, res, next) => {
  try {
    const after = Math.max(0, parseInt(req.query.after, 10) || 0);
    res.set("Cache-Control", "no-store").json(await boothDuo.state(duoRoom(req.query.room), after));
  } catch (err) { next(err); }
});
const duoSayLog = new Map();
app.post("/duo/api/say", async (req, res, next) => {
  try {
    const ip = req.ip || "x", now = Date.now();
    if (now - (duoSayLog.get(ip) || 0) < 4000) return res.status(429).json({ success: false });
    duoSayLog.set(ip, now);
    if (duoSayLog.size > 2000) duoSayLog.clear();
    const body = req.body || {};
    const ok = await boothDuo.say(duoRoom(body.room), body.to, body.text);
    res.json({ success: ok });
  } catch (err) { next(err); }
});
app.get("/wallet/status", (req, res) => res.json({ success: true, configured: walletPass.isConfigured() }));
app.get("/wallet/rasd.pkpass", async (req, res, next) => {
  try {
    const buf = await walletPass.generatePass();
    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": 'attachment; filename="rasd-cyber-booth23.pkpass"',
      "Cache-Control": "no-store",
    });
    res.send(buf);
  } catch (err) {
    if (err.code === "WALLET_NOT_CONFIGURED") {
      return res.status(503).json({ success: false, message: "Wallet pass is not configured yet" });
    }
    next(err);
  }
});

// Settings live on the profile page.
app.get(ROUTES.PAGES.SETTINGS, (req, res) => res.redirect(302, "/profile"));

// Auth page -> public
app.get(["/login", "/auth", "/auth.html"], (req, res, next) => {
  sendPage(res, "auth.html", next);
});

// Dashboard — HTML shell is public; auth is enforced client-side + on /api routes
app.get(ROUTES.PAGES.DASHBOARD, (req, res, next) => {
  sendPage(res, "dashboard.html", next);
});

// Learn -> public preview page
app.get(ROUTES.PAGES.LEARNING, (req, res, next) => {
  sendPage(res, "learn.html", next);
});

// Practice -> public preview page
app.get(ROUTES.PAGES.PRACTICE, (req, res, next) => {
  sendPage(res, "practice.html", next);
});

// Training -> public page for now
app.get(ROUTES.PAGES.TRAINING, (req, res, next) => {
  sendPage(res, "training.html", next);
});

// Terminal -> public preview page
app.get(ROUTES.PAGES.TERMINAL, (req, res, next) => {
  sendPage(res, "terminal.html", next);
});

// Leaderboard -> public
app.get(ROUTES.PAGES.LEADERBOARD, (req, res, next) => {
  sendPage(res, "leaderboard.html", next);
});

// Analyze Scenario -> public
app.get(ROUTES.PAGES.ANALYZE_SCENARIO, (req, res, next) => {
  sendPage(res, "analyze-scenario.html", next);
});

// Learner Profile -> public
app.get(ROUTES.PAGES.LEARNER_PROFILE, (req, res, next) => {
  sendPage(res, "learner-profile.html", next);
});

// AI Insights -> public
app.get(ROUTES.PAGES.AI_INSIGHTS, (req, res, next) => {
  sendPage(res, "ai-insights.html", next);
});

// Analytics -> public
app.get(ROUTES.PAGES.ANALYTICS, (req, res, next) => {
  sendPage(res, "analytics.html", next);
});

// Readiness — HTML shell public; auth + role enforced client-side and on /api
app.get(ROUTES.PAGES.READINESS, (req, res, next) => {
  sendPage(res, "readiness.html", next);
});

// Admin — same pattern as dashboard (client-side + API auth)
app.get(ROUTES.PAGES.ADMIN, (req, res, next) => {
  sendPage(res, "admin.html", next);
});

// Profile page uses learner profile UI (no standalone profile.html in repo)
app.get(ROUTES.PAGES.PROFILE || "/profile", (req, res, next) => {
  sendPage(res, "learner-profile.html", next);
});

// AI Command Center — drives the full AI-orchestrated loop (auth enforced on /api).
app.get(["/ai-command", "/ai", "/command"], (req, res, next) => {
  sendPage(res, "ai-command.html", next);
});

// ===== LEGACY ROUTES =====
app.get("/index", (req, res) => {
  res.redirect(ROUTES.PAGES.HOME);
});

app.get("/index.html", (req, res) => {
  res.redirect(ROUTES.PAGES.HOME);
});

// ===== ERROR HANDLING =====
app.use(notFoundHandler);
app.use(errorHandler);

// ===== SERVER STARTUP =====
async function startServer() {
  try {
    if (db.DB_TYPE === "postgresql") {
      await db.createTables();
    }

    const preferredPort = config.server?.port || 3001;
    const host = config.server?.host || "127.0.0.1";
    const portRetries = config.server?.isDevelopment ? 15 : 0;

    const server = http.createServer(app);

    const listenOn = (tryPort, retriesLeft) => {
      const onError = (error) => {
        server.removeListener("error", onError);
        if (error.code === "EADDRINUSE" && retriesLeft > 0) {
          const nextPort = tryPort + 1;
          console.warn(`Port ${tryPort} is in use, trying ${nextPort}...`);
          listenOn(nextPort, retriesLeft - 1);
          return;
        }
        logger.error("Server startup failed", { error: error.message });
        logger.error("Server failed to start", {
          error: error.message,
          code: error.code,
        });
        if (error.code === "EADDRINUSE") {
          console.error(
            "Free that port, stop the other Node process, or set PORT in .env to a free port."
          );
        }
        process.exit(1);
      };

      server.once("error", onError);
      server.listen(tryPort, host, () => {
        server.removeListener("error", onError);
        if (tryPort !== preferredPort && config.server?.isDevelopment) {
          console.warn(
            `\n⚠️  Using port ${tryPort} because ${preferredPort} was busy. Set PORT=${tryPort} in .env to make this explicit.\n`
          );
        }
        logger.info("Rasd Cyber server started successfully", {
          port: tryPort,
          host,
          environment: config.server?.nodeEnv || "development",
          database: config.database?.type || "in-memory",
          corsOrigins: config.cors?.origins || [],
        });

        console.log(`🔥 Server running on http://${host}:${tryPort}`);
        console.log(`🌍 Environment: ${config.server?.nodeEnv || "development"}`);
        console.log(`🗄️ Database mode: ${config.database?.type || "in-memory"}`);
      });
    };

    listenOn(preferredPort, portRetries);

    return server;
  } catch (error) {
    logger.error("Failed to initialize database", {
      error: error.message,
      stack: error.stack,
    });
    console.error("Database initialization failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
