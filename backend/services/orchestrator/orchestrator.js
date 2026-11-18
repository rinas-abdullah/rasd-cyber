// RASD AI Orchestrator (brief §3) — the central engine that runs a training
// session's full lifecycle through an explicit state machine, coordinates the six
// agents and the deterministic simulation, and enforces AI governance. It is the
// ONLY component that mutates session state, and every mutation is persisted so a
// session is resumable (brief §3, §9).
//
// State machine (brief §3):
//   CREATED → ASSESSMENT → PLANNING → SIMULATION → EVALUATION → FEEDBACK
//           → VERIFICATION → COMPLETED        (+ PAUSED, FAILED, REVIEW_REQUIRED)
//
// Governance (brief §11): ownership checks, per-phase step caps, hint caps, an
// audit log of every agent/AI action, and deterministic results independent of
// the model.

const crypto = require("crypto");
const store = require("./sessionStore");
const schemas = require("./schemas");
const scenarioDirector = require("../agents/scenarioDirector");
const skillVerification = require("../agents/skillVerification");
const decisionEvaluator = require("../agents/decisionEvaluator");
const adversaryAgent = require("../agents/adversaryAgent");
const aiMentor = require("../agents/aiMentor");
const afterAction = require("./afterAction");
const { createWorld } = require("../simulation/incidentWorld");
const { freshLedger, applyDecision } = require("../simulation/consequenceEngine");
const provider = require("../ai/orchestratorProvider");

const DEFAULT_SKILL = "privileged-account-compromise";
const CRISIS_SKILL = "hospital-crisis-response";
const CRISIS_DURATION_MS = 3 * 60 * 1000;
const CAPS = Object.freeze({
  maxStepsPerPhase: Number(process.env.AI_MAX_STEPS) || 12,
  maxHints: Number(process.env.AI_MAX_HINTS) || 5,
});

// Allowed state transitions. Any move not listed is rejected.
const TRANSITIONS = Object.freeze({
  CREATED: ["ASSESSMENT", "FAILED"],
  ASSESSMENT: ["PLANNING", "FAILED", "PAUSED"],
  PLANNING: ["SIMULATION", "FAILED", "PAUSED"],
  SIMULATION: ["EVALUATION", "PAUSED", "FAILED", "REVIEW_REQUIRED"],
  EVALUATION: ["FEEDBACK", "VERIFICATION", "COMPLETED", "REVIEW_REQUIRED"],
  FEEDBACK: ["VERIFICATION", "COMPLETED", "PAUSED"],
  VERIFICATION: ["EVALUATION", "PAUSED", "FAILED", "REVIEW_REQUIRED"],
  PAUSED: ["ASSESSMENT", "PLANNING", "SIMULATION", "VERIFICATION", "FAILED"],
  REVIEW_REQUIRED: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
});

class OrchestratorError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function audit(session, actor, action, detail) {
  session.audit.push({ at: new Date().toISOString(), actor, action, detail: detail || null });
  if (session.audit.length > 500) session.audit.shift();
}

function transition(session, to) {
  const allowed = TRANSITIONS[session.state] || [];
  if (!allowed.includes(to)) {
    throw new OrchestratorError(`Illegal transition ${session.state} → ${to}`, "ILLEGAL_TRANSITION", 409);
  }
  audit(session, "orchestrator", "transition", `${session.state} → ${to}`);
  session.state = to;
}

function assertOwner(session, userId, institutionId) {
  if (!session) throw new OrchestratorError("Session not found", "NOT_FOUND", 404);
  if (String(session.userId) !== String(userId)) {
    throw new OrchestratorError("Forbidden", "FORBIDDEN", 403);
  }
  if (
    institutionId != null &&
    String(session.institutionId ?? "") !== String(institutionId)
  ) {
    throw new OrchestratorError("Forbidden", "FORBIDDEN", 403);
  }
}

function currentPhase(session) {
  if (session.state === "VERIFICATION" || (session.phase === "verification" && session.verification)) {
    return session.verification;
  }
  return session.training;
}

// Public projection of a phase (never leaks decoy flags during an active phase).
function projectPhase(phase, { reveal = false } = {}) {
  if (!phase) return null;
  const scenario = phase.scenario;
  const evidence = scenario.evidence
    .filter((e) => phase.world.revealedEvidence.includes(e.id))
    .map((e) => ({
      id: e.id,
      label: e.label,
      source: e.source,
      // During an active phase, do NOT tell the learner which evidence is a
      // decoy — that is part of the assessment. Revealed only after completion.
      relevant: reveal ? e.relevant : undefined,
    }));
  return {
    scenarioId: scenario.scenarioId,
    templateId: scenario.templateId,
    skill: scenario.skill,
    sector: scenario.sector,
    objective: scenario.objective,
    difficulty: scenario.difficulty,
    world: {
      organization: scenario.world.organization,
      assets: Object.values(phase.world.assets),
      accounts: Object.values(phase.world.accounts),
      controls: Object.values(phase.world.controls),
      step: phase.world.step,
      outcome: phase.world.outcome,
    },
    availableEvidence: evidence,
    decisions: scenario.decisions,
    adversary: adversaryAgent.summary(phase.world),
    decisionsTaken: phase.decisions.map((d) => ({
      step: d.step,
      kind: d.kind,
      effective: d.effective,
      elapsedMs: d.elapsedMs,
    })),
    hintsUsed: phase.hintsUsed,
    evaluation: phase.evaluation || null,
    crisisEvents: phase.crisisEvents || [],
  };
}

function publicSession(session) {
  const phase = currentPhase(session);
  const isVerification = session.state === "VERIFICATION";
  const crisisPhase = session.crisisMode ? session.training : null;
  return {
    sessionId: session.sessionId,
    state: session.state,
    phase: session.phase,
    mode: isVerification ? "VERIFICATION" : session.crisisMode ? "CRISIS" : "TRAINING",
    crisisMode: Boolean(session.crisisMode),
    crisis: crisisPhase
      ? {
          active: session.state === "SIMULATION",
          durationMs: session.crisisDurationMs,
          remainingMs: Math.max(0, session.crisisDeadlineAt - Date.now()),
          deadlineAt: new Date(session.crisisDeadlineAt).toISOString(),
          outcome: crisisPhase.world.outcome,
          responseTimeMs: crisisPhase.decisions.reduce((sum, decision) => sum + (decision.elapsedMs || 0), 0),
          events: crisisPhase.crisisEvents || [],
        }
      : null,
    skill: session.skill,
    assessment: session.assessment,
    plan: session.plan,
    aiMode: provider.currentMode(),
    caps: session.caps,
    current: projectPhase(phase, { reveal: ["COMPLETED", "EVALUATION", "FEEDBACK"].includes(session.state) && !isVerification }),
    training: session.training
      ? { scenarioId: session.training.scenario.scenarioId, sector: session.training.scenario.sector, evaluation: session.training.evaluation }
      : null,
    verification: session.verification
      ? { scenarioId: session.verification.scenario.scenarioId, sector: session.verification.scenario.sector, evaluation: session.verification.evaluation }
      : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt || null,
  };
}

function buildPhase(scenario, { crisisMode = false } = {}) {
  const startedAt = Date.now();
  const phase = {
    scenario,
    world: createWorld(scenario),
    ledger: freshLedger(),
    decisions: [],
    evaluation: null,
    hintsUsed: 0,
    decisionStartedAt: startedAt,
  };
  if (crisisMode) {
    phase.crisisEvents = [];
    addCrisisEvent(
      phase,
      "intrusion-detected",
      "Simulated external intrusion attempt detected on a hospital operations account.",
      "تم رصد محاولة اختراق افتراضية لحساب تشغيل في المستشفى.",
      "warning"
    );
  }
  return phase;
}

/**
 * Create a session and run ASSESSMENT + PLANNING, landing in SIMULATION with a
 * training scenario instantiated. Synchronous agent steps; no model required.
 */
async function createSession({
  userId,
  institutionId = null,
  skill = DEFAULT_SKILL,
  assessmentLevel = null,
  crisisMode = false,
} = {}) {
  if (userId == null) throw new OrchestratorError("userId required", "NO_USER", 400);
  if (crisisMode) skill = CRISIS_SKILL;
  if (!crisisMode && skill === CRISIS_SKILL) {
    throw new OrchestratorError("Hospital crisis skill requires crisis mode", "CRISIS_MODE_REQUIRED", 400);
  }

  const sessionId = `sess_${crypto.randomBytes(9).toString("hex")}`;
  const session = {
    sessionId,
    userId,
    institutionId,
    skill,
    crisisMode,
    crisisDurationMs: crisisMode ? CRISIS_DURATION_MS : null,
    crisisDeadlineAt: null,
    state: "CREATED",
    phase: "training",
    assessment: null,
    plan: null,
    training: null,
    verification: null,
    trainedSector: null,
    trainedTemplateId: null,
    caps: { ...CAPS },
    audit: [],
    aiMode: provider.currentMode(),
    completedAt: null,
  };
  audit(session, "orchestrator", "create", `skill=${skill}`);

  // ASSESSMENT — determine the learner's working level (explicit input or default).
  transition(session, "ASSESSMENT");
  const level = Number.isFinite(assessmentLevel) ? Math.max(1, Math.min(10, Math.round(assessmentLevel))) : 3;
  session.assessment = { level, method: assessmentLevel == null ? "default" : "provided" };
  audit(session, "orchestrator", "assessment", `level=${level}`);

  // PLANNING — Scenario Director designs the training scenario.
  transition(session, "PLANNING");
  const { scenario } = scenarioDirector.design({ skill, pool: "training", seed: sessionId });
  session.plan = { skill, difficulty: scenario.difficulty, objective: scenario.objective };
  session.trainedSector = scenario.sector;
  session.trainedTemplateId = scenario.templateId;
  audit(session, "scenario-director", "design", `template=${scenario.templateId} sector=${scenario.sector}`);

  // SIMULATION — instantiate the world the learner will act in.
  session.training = buildPhase(scenario, { crisisMode });
  if (crisisMode) session.crisisDeadlineAt = session.training.decisionStartedAt + CRISIS_DURATION_MS;
  transition(session, "SIMULATION");

  await store.create(session);
  return publicSession(session);
}

function addCrisisEvent(phase, key, en, ar, severity = "warning") {
  if (!phase.crisisEvents) phase.crisisEvents = [];
  phase.crisisEvents.push({
    key,
    step: phase.world.step,
    at: new Date().toISOString(),
    severity,
    label: { en, ar },
  });
}

function recordCrisisProgress(phase, priorWorld) {
  const world = phase.world;
  if (world.businessImpact.unnecessaryDowntime > priorWorld.businessImpact.unnecessaryDowntime) {
    addCrisisEvent(
      phase,
      "service-disruption",
      "Simulated critical-care system availability decreased after an unnecessary isolation.",
      "انخفض توفر نظام رعاية حيوي افتراضي بعد عزله دون حاجة.",
      "danger"
    );
  }

  // Outcome events fire once, on the decision that produced the outcome.
  const outcomeChanged = world.outcome !== priorWorld.outcome;
  if (world.outcome === "breach" && outcomeChanged) {
    addCrisisEvent(
      phase,
      "simulated-data-exposure",
      "Simulated patient-record exposure occurred; no real patient data is involved.",
      "حدث انكشاف افتراضي لسجلات المرضى؛ لا توجد بيانات مرضى حقيقية.",
      "danger"
    );
  } else if (world.outcome === "contained" && outcomeChanged) {
    addCrisisEvent(
      phase,
      "threat-contained",
      "The simulated threat was contained; verify critical-care service continuity.",
      "تم احتواء التهديد الافتراضي؛ تحقّق من استمرارية أنظمة الرعاية الحيوية.",
      "success"
    );
  } else if (world.outcome) {
    // Outcome already announced; nothing new to report.
  } else if (world.adversary.stage === "lateral_movement" && priorWorld.adversary.stage !== "lateral_movement") {
    addCrisisEvent(
      phase,
      "lateral-movement",
      "New alert: simulated lateral movement is approaching the EHR network.",
      "تنبيه جديد: تحرك جانبي افتراضي يقترب من شبكة السجلات الصحية.",
      "danger"
    );
  } else if (world.adversary.stage === "collection" && priorWorld.adversary.stage !== "collection") {
    addCrisisEvent(
      phase,
      "records-query",
      "New alert: an unusual simulated query is targeting patient records.",
      "تنبيه جديد: استعلام افتراضي غير معتاد يستهدف سجلات المرضى.",
      "danger"
    );
  }
}

async function createCrisisSession({ userId, institutionId = null, assessmentLevel = 5 } = {}) {
  return createSession({ userId, institutionId, assessmentLevel, crisisMode: true });
}

async function getSession(sessionId, userId, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  if (await expireCrisisIfNeeded(session)) await store.save(session);
  return publicSession(session);
}

// Raw session (internal) with ownership check — for AAR/readiness builders.
async function _getRaw(sessionId, userId, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  return session;
}

function isActionablePhaseState(state) {
  return state === "SIMULATION" || state === "VERIFICATION";
}

/**
 * Submit a learner decision. Applies the deterministic consequence engine, lets
 * the (rule-bound) adversary tick, persists, and auto-ends the phase when the
 * outcome is decided or the step cap is hit (governance).
 */
async function submitDecision(sessionId, userId, optionId, elapsedMs, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  if (!isActionablePhaseState(session.state)) {
    throw new OrchestratorError(`Cannot submit a decision in state ${session.state}`, "BAD_STATE", 409);
  }
  if (await expireCrisisIfNeeded(session)) {
    await store.save(session);
    return { session: publicSession(session), phaseEnded: true, lastConsequence: null };
  }
  const phase = currentPhase(session);

  if (phase.concluded) {
    throw new OrchestratorError("This phase is already concluded", "PHASE_RESOLVED", 409);
  }
  // A breach is terminal; "contained" is not — the learner may still escalate,
  // notify, and preserve evidence (realistic IR follow-through).
  if (phase.world.outcome === "breach") {
    throw new OrchestratorError("This phase has already ended (breach)", "PHASE_RESOLVED", 409);
  }
  if (phase.world.step >= session.caps.maxStepsPerPhase) {
    phase.world.outcome = phase.world.outcome || "timeout";
  } else {
    let result;
    const now = Date.now();
    const observedElapsedMs = Number.isFinite(phase.decisionStartedAt)
      ? Math.max(0, now - phase.decisionStartedAt)
      : null;
    const priorWorld = phase.world;
    try {
      result = applyDecision(phase.world, phase.scenario, optionId, phase.ledger, { elapsedMs: observedElapsedMs });
    } catch (e) {
      if (e.code === "INVALID_DECISION") throw new OrchestratorError(e.message, "INVALID_DECISION", 400);
      throw e;
    }
    phase.world = result.world;
    phase.ledger = result.ledger;
    phase.decisionStartedAt = now;
    phase.decisions.push({
      step: result.consequence.step,
      optionId,
      kind: result.consequence.kind,
      effective: result.consequence.effective,
      elapsedMs: observedElapsedMs,
      explanation: result.consequence.explanation,
      adversaryEvent: result.consequence.adversaryEvent,
      newEvidence: result.consequence.newEvidence,
    });
    if (session.crisisMode) recordCrisisProgress(phase, priorWorld);
    audit(session, "consequence-engine", "apply", `${result.consequence.kind} effective=${result.consequence.effective}`);
  }

  // Auto-end the phase when the incident is fully wrapped up (contained AND
  // escalated), on a breach, or when the step budget is exhausted. Containment
  // alone does NOT end it — the learner can still escalate/notify/preserve.
  let phaseEnded = false;
  // In crisis mode the clock (and the learner's "end phase") closes the
  // incident, so stakeholder notification and recovery steps still count.
  const wrappedUp = !session.crisisMode && phase.world.adversary.contained && phase.world.escalated;
  if (phase.world.outcome === "breach" || wrappedUp || phase.world.step >= session.caps.maxStepsPerPhase) {
    phaseEnded = true;
    await _endPhaseInternal(session);
  }

  await store.save(session);
  return { session: publicSession(session), phaseEnded, lastConsequence: phase.decisions[phase.decisions.length - 1] || null };
}

// Internal: score the just-finished phase and move the state machine forward.
async function _endPhaseInternal(session) {
  const isVerification = session.state === "VERIFICATION";
  const phase = currentPhase(session);
  phase.concluded = true;
  if (!phase.world.outcome) phase.world.outcome = "timeout";

  const evaluation = decisionEvaluator.evaluate({
    scenario: phase.scenario,
    world: phase.world,
    ledger: phase.ledger,
    decisions: phase.decisions,
  });
  phase.evaluation = evaluation;
  audit(session, "decision-evaluator", "evaluate", `total=${evaluation.total} passed=${evaluation.passed}`);

  transition(session, "EVALUATION");

  if (isVerification) {
    // Verification scored → session complete.
    transition(session, "COMPLETED");
    session.completedAt = new Date().toISOString();
    audit(session, "orchestrator", "complete", `verification total=${evaluation.total}`);
  } else {
    // Training scored → feedback, ready for verification.
    transition(session, "FEEDBACK");
    audit(session, "orchestrator", "feedback", "training AAR available");
  }
}

async function expireCrisisIfNeeded(session) {
  if (!session.crisisMode || session.state !== "SIMULATION" || Date.now() < session.crisisDeadlineAt) {
    return false;
  }
  const phase = session.training;
  if (!phase || phase.concluded) return false;
  // A threat already contained (or breached) keeps that outcome; the clock
  // only closes the review window.
  const alreadyResolved = Boolean(phase.world.outcome);
  if (!alreadyResolved) phase.world.outcome = "timeout";
  addCrisisEvent(
    phase,
    "time-expired",
    alreadyResolved ? "The simulated response window closed." : "The simulated response window expired.",
    alreadyResolved ? "أُغلقت نافذة الاستجابة الافتراضية." : "انتهت مهلة الاستجابة الافتراضية.",
    alreadyResolved ? "warning" : "danger"
  );
  await _endPhaseInternal(session);
  return true;
}

/** Learner explicitly concludes the active simulation/verification phase. */
async function endPhase(sessionId, userId, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  if (await expireCrisisIfNeeded(session)) {
    await store.save(session);
    return publicSession(session);
  }
  if (!isActionablePhaseState(session.state)) {
    throw new OrchestratorError(`No active phase to end (state ${session.state})`, "BAD_STATE", 409);
  }
  const phase = currentPhase(session);
  if (phase.decisions.length === 0) {
    throw new OrchestratorError("Cannot end a phase before any decision", "NO_DECISIONS", 409);
  }
  await _endPhaseInternal(session);
  await store.save(session);
  return publicSession(session);
}

/**
 * Advance from FEEDBACK into VERIFICATION: build an independent, different-sector
 * scenario for the same skill (Skill Verification agent) and enter a fresh,
 * hint-blocked simulation.
 */
async function startVerification(sessionId, userId, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  if (session.crisisMode) {
    throw new OrchestratorError("Crisis sessions use their own review and cannot enter skill verification", "CRISIS_VERIFICATION_UNAVAILABLE", 409);
  }
  if (session.state !== "FEEDBACK") {
    throw new OrchestratorError(`Verification can only start from FEEDBACK (now ${session.state})`, "BAD_STATE", 409);
  }

  const { scenario } = skillVerification.buildVerification({
    skill: session.skill,
    seed: session.sessionId,
    trainedSector: session.trainedSector,
    trainedTemplateId: session.trainedTemplateId,
  });
  session.verification = buildPhase(scenario);
  session.phase = "verification";
  audit(session, "skill-verification", "build", `template=${scenario.templateId} sector=${scenario.sector}`);

  transition(session, "VERIFICATION");
  await store.save(session);
  return publicSession(session);
}

/**
 * Complete the session from FEEDBACK without verification (learner opts out), or
 * from REVIEW_REQUIRED.
 */
async function complete(sessionId, userId, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  if (session.state === "FEEDBACK") {
    transition(session, "COMPLETED");
  } else if (session.state === "REVIEW_REQUIRED") {
    transition(session, "COMPLETED");
  } else {
    throw new OrchestratorError(`Cannot complete from ${session.state}`, "BAD_STATE", 409);
  }
  session.completedAt = new Date().toISOString();
  await store.save(session);
  return publicSession(session);
}

async function pause(sessionId, userId, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  if (await expireCrisisIfNeeded(session)) {
    await store.save(session);
    return publicSession(session);
  }
  if (!["ASSESSMENT", "PLANNING", "SIMULATION", "VERIFICATION", "FEEDBACK"].includes(session.state)) {
    throw new OrchestratorError(`Cannot pause from ${session.state}`, "BAD_STATE", 409);
  }
  session._resumeState = session.state;
  transition(session, "PAUSED");
  await store.save(session);
  return publicSession(session);
}

async function resume(sessionId, userId, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  if (session.state !== "PAUSED") throw new OrchestratorError("Session is not paused", "BAD_STATE", 409);
  const to = session._resumeState || "SIMULATION";
  transition(session, to);
  if (await expireCrisisIfNeeded(session)) {
    await store.save(session);
    return publicSession(session);
  }
  await store.save(session);
  return publicSession(session);
}

/** Request a mentor hint (brief §4). Capped; blocked in VERIFICATION. */
async function requestHint(sessionId, userId, level = 1, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  if (!isActionablePhaseState(session.state)) {
    throw new OrchestratorError(`No active simulation to hint on (state ${session.state})`, "BAD_STATE", 409);
  }
  if (await expireCrisisIfNeeded(session)) {
    await store.save(session);
    throw new OrchestratorError("Crisis response window expired", "CRISIS_EXPIRED", 409);
  }
  const mode = session.state === "VERIFICATION" ? "VERIFICATION" : "TRAINING";
  const phase = currentPhase(session);

  if (mode === "TRAINING" && phase.hintsUsed >= session.caps.maxHints) {
    throw new OrchestratorError("Hint budget exhausted for this phase", "HINT_CAP", 429);
  }

  const reply = await aiMentor.mentor({ mode, world: phase.world, scenario: phase.scenario, level });
  if (reply.allowed) {
    phase.hintsUsed += 1;
    audit(session, "ai-mentor", "hint", `level=${reply.level} aiMode=${reply.aiMode}`);
    await store.save(session);
  } else {
    audit(session, "ai-mentor", "hint-blocked", "verification mode");
  }
  return reply;
}

/** Build the After-Action Review for the current/last phase (recorded events only). */
async function getAfterAction(sessionId, userId, institutionId) {
  const session = await store.get(sessionId);
  assertOwner(session, userId, institutionId);
  const phase = session.state === "COMPLETED" && session.verification ? session.verification : (currentPhase(session) || session.training);
  if (!phase || phase.decisions.length === 0) {
    throw new OrchestratorError("No completed phase to review yet", "NO_PHASE", 409);
  }
  return afterAction.build({
    scenario: phase.scenario,
    world: phase.world,
    ledger: phase.ledger,
    evaluation: phase.evaluation,
    decisions: phase.decisions,
  });
}

/** Readiness profile across all of a user's completed sessions (evidence-based). */
async function getReadiness(userId, institutionId) {
  const readinessAnalyst = require("../agents/readinessAnalyst");
  const sessions = await store.listByUser(userId, institutionId);
  const evidence = [];
  for (const s of sessions) {
    if (s.training && s.training.evaluation) {
      evidence.push({ skill: s.skill, mode: "TRAINING", total: s.training.evaluation.total, passed: s.training.evaluation.passed, outcome: s.training.world.outcome, hintsUsed: s.training.hintsUsed });
    }
    if (s.verification && s.verification.evaluation) {
      evidence.push({ skill: s.skill, mode: "VERIFICATION", total: s.verification.evaluation.total, passed: s.verification.evaluation.passed, outcome: s.verification.world.outcome, hintsUsed: s.verification.hintsUsed });
    }
  }
  return { readiness: readinessAnalyst.analyse(evidence), evidence };
}

async function getBehavioralFingerprint(userId, institutionId) {
  const fingerprintEngine = require("./behavioralFingerprint");
  const sessions = await store.listByUser(userId, institutionId);
  const ownedSessions = sessions.filter((session) =>
    String(session.userId) === String(userId) &&
    (institutionId == null || String(session.institutionId ?? "") === String(institutionId))
  );
  return fingerprintEngine.computeFingerprint(ownedSessions);
}

module.exports = {
  CAPS,
  TRANSITIONS,
  OrchestratorError,
  CRISIS_DURATION_MS,
  createSession,
  createCrisisSession,
  getSession,
  submitDecision,
  endPhase,
  startVerification,
  complete,
  pause,
  resume,
  requestHint,
  getAfterAction,
  getReadiness,
  getBehavioralFingerprint,
  publicSession,
  _getRaw,
};
