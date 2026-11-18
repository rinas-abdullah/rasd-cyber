// RASD AI Orchestrator REST API (brief §3, §9, §16). Every route requires auth;
// ownership and institution isolation are enforced in the Orchestrator and here.
// The AI never writes the DB directly — these endpoints are the only way session
// state changes, and each validates input before touching the engine.

const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/responseUtils");
const orchestrator = require("../services/orchestrator/orchestrator");
const scenarioDirector = require("../services/agents/scenarioDirector");
const provider = require("../services/ai/orchestratorProvider");
const { DecisionInput } = require("../services/orchestrator/schemas");

function handle(res, err) {
  const status = err instanceof orchestrator.OrchestratorError ? err.status : 500;
  if (status >= 500) console.error("[orchestrator route]", err);
  return errorResponse(res, err.message || "Internal error", status, err.code ? [err.code] : []);
}

// AI layer status / governance info (honest about live vs dev-deterministic).
router.get("/ai/status", requireAuth, (req, res) => {
  return successResponse(res, {
    aiMode: provider.currentMode(),
    liveConfigured: provider.isLiveConfigured(),
    caps: orchestrator.CAPS,
    note:
      provider.currentMode() === "live"
        ? "A live AI provider is configured; narration/hints may use it. Operational results remain deterministic."
        : "Running in dev-deterministic mode: narration/hints are deterministic, clearly not live AI. Operational results are deterministic in both modes.",
  });
});

// Scenario catalogue (for the Scenario Library UI).
router.get("/ai/templates", requireAuth, (req, res) => {
  return successResponse(res, { templates: scenarioDirector.listTemplates() });
});

// Create a session → runs assessment + planning → lands in SIMULATION.
router.post("/ai/sessions", requireAuth, async (req, res) => {
  try {
    const { skill, assessmentLevel } = req.body || {};
    const session = await orchestrator.createSession({
      userId: req.user.userId,
      institutionId: req.user.institution_id ?? null,
      skill: typeof skill === "string" && skill.trim() ? skill.trim() : undefined,
      assessmentLevel: Number.isFinite(Number(assessmentLevel)) ? Number(assessmentLevel) : null,
    });
    return successResponse(res, session, "Session created", 201);
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/ai/crisis-sessions", requireAuth, async (req, res) => {
  try {
    const assessmentLevel = Number.isFinite(Number(req.body?.assessmentLevel))
      ? Number(req.body.assessmentLevel)
      : 5;
    const session = await orchestrator.createCrisisSession({
      userId: req.user.userId,
      institutionId: req.user.institution_id ?? null,
      assessmentLevel,
    });
    return successResponse(res, session, "Simulated crisis session created", 201);
  } catch (err) {
    return handle(res, err);
  }
});

// Session archive: only the authenticated learner's own sessions.
router.get("/ai/sessions", requireAuth, async (req, res) => {
  try {
    const store = require("../services/orchestrator/sessionStore");
    const rows = await store.listByUser(req.user.userId, req.user.institution_id);
    const sessions = rows
      .filter(s => String(s.userId) === String(req.user.userId) &&
        String(s.institutionId ?? "") === String(req.user.institution_id ?? ""))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 50)
      .map(s => ({ sessionId: s.sessionId, skill: s.skill, state: s.state,
        mode: s.crisisMode ? "CRISIS" : s.mode, createdAt: s.createdAt, updatedAt: s.updatedAt,
        trainingScore: s.training?.evaluation?.total ?? null,
        verificationScore: s.verification?.evaluation?.total ?? null }));
    return successResponse(res, { sessions });
  } catch (err) { return handle(res, err); }
});

router.get("/ai/sessions/:id", requireAuth, async (req, res) => {
  try {
    return successResponse(res, await orchestrator.getSession(req.params.id, req.user.userId, req.user.institution_id));
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/ai/sessions/:id/decisions", requireAuth, async (req, res) => {
  try {
    const parsed = DecisionInput.safeParse(req.body || {});
    if (!parsed.success) {
      return errorResponse(res, "Invalid decision payload", 400, parsed.error.issues.map((i) => i.message));
    }
    const result = await orchestrator.submitDecision(
      req.params.id,
      req.user.userId,
      parsed.data.optionId,
      parsed.data.elapsedMs,
      req.user.institution_id
    );
    return successResponse(res, result);
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/ai/sessions/:id/hint", requireAuth, async (req, res) => {
  try {
    const level = Number.isFinite(Number(req.body?.level)) ? Number(req.body.level) : 1;
    const reply = await orchestrator.requestHint(req.params.id, req.user.userId, level, req.user.institution_id);
    return successResponse(res, reply);
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/ai/sessions/:id/end-phase", requireAuth, async (req, res) => {
  try {
    return successResponse(res, await orchestrator.endPhase(req.params.id, req.user.userId, req.user.institution_id));
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/ai/sessions/:id/verify", requireAuth, async (req, res) => {
  try {
    return successResponse(res, await orchestrator.startVerification(req.params.id, req.user.userId, req.user.institution_id));
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/ai/sessions/:id/complete", requireAuth, async (req, res) => {
  try {
    return successResponse(res, await orchestrator.complete(req.params.id, req.user.userId, req.user.institution_id));
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/ai/sessions/:id/pause", requireAuth, async (req, res) => {
  try {
    return successResponse(res, await orchestrator.pause(req.params.id, req.user.userId, req.user.institution_id));
  } catch (err) {
    return handle(res, err);
  }
});

router.post("/ai/sessions/:id/resume", requireAuth, async (req, res) => {
  try {
    return successResponse(res, await orchestrator.resume(req.params.id, req.user.userId, req.user.institution_id));
  } catch (err) {
    return handle(res, err);
  }
});

router.get("/ai/sessions/:id/after-action", requireAuth, async (req, res) => {
  try {
    return successResponse(res, await orchestrator.getAfterAction(req.params.id, req.user.userId, req.user.institution_id));
  } catch (err) {
    return handle(res, err);
  }
});

router.get("/ai/readiness", requireAuth, async (req, res) => {
  try {
    return successResponse(res, await orchestrator.getReadiness(req.user.userId, req.user.institution_id));
  } catch (err) {
    return handle(res, err);
  }
});

router.get("/ai/behavioral-fingerprint", requireAuth, async (req, res) => {
  try {
    return successResponse(
      res,
      await orchestrator.getBehavioralFingerprint(req.user.userId, req.user.institution_id)
    );
  } catch (err) {
    return handle(res, err);
  }
});

module.exports = router;
