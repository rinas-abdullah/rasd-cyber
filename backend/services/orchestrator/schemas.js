// Zod schemas for every structured output that crosses the AI boundary or the
// API boundary. The Orchestrator validates against these so a malformed or
// hostile model response (or client payload) is rejected before it can touch
// session state (brief §3 "Structured Outputs with schema validation", §11).

const { z } = require("zod");

const SessionState = z.enum([
  "CREATED",
  "ASSESSMENT",
  "PLANNING",
  "SIMULATION",
  "EVALUATION",
  "FEEDBACK",
  "VERIFICATION",
  "COMPLETED",
  "PAUSED",
  "FAILED",
  "REVIEW_REQUIRED",
]);

const Mode = z.enum(["TRAINING", "VERIFICATION"]);

// ----- Scenario (produced by Scenario Director, drawn from the bank) -----
const EvidenceItem = z.object({
  id: z.string(),
  label: z.object({ ar: z.string(), en: z.string() }),
  source: z.string(), // e.g. "siem", "edr", "idp", "network"
  relevant: z.boolean(), // true = genuinely tied to the incident, false = decoy
  revealedBy: z.string().nullable().optional(), // decision id that surfaces it, or null = available at start
});

const DecisionOption = z.object({
  id: z.string(),
  label: z.object({ ar: z.string(), en: z.string() }),
  kind: z.enum([
    "isolate",
    "collect_logs",
    "suspend_account",
    "escalate",
    "monitor",
    "ignore",
    "reset_credentials",
    "block_network",
    "notify_business",
  ]),
  targetAsset: z.string().nullable().optional(),
});

const Scenario = z.object({
  scenarioId: z.string(),
  templateId: z.string(),
  pool: z.enum(["training", "verification"]),
  skill: z.string(), // canonical skill tag measured, e.g. "privileged-account-compromise"
  sector: z.string(), // education | healthcare | finance | government ...
  objective: z.object({ ar: z.string(), en: z.string() }),
  difficulty: z.number().int().min(1).max(10),
  world: z.object({
    organization: z.object({ name: z.string(), sector: z.string() }),
    assets: z.array(z.object({ id: z.string(), name: z.string(), critical: z.boolean() })),
    accounts: z.array(z.object({ id: z.string(), name: z.string(), privileged: z.boolean() })),
    controls: z.array(z.object({ id: z.string(), name: z.string(), enabled: z.boolean() })),
  }),
  evidence: z.array(EvidenceItem),
  decisions: z.array(DecisionOption),
  idealOrder: z.array(z.string()), // rubric: ideal decision-kind order
  successConditions: z.array(z.string()),
  failConditions: z.array(z.string()),
});

// ----- A decision submitted by the learner -----
const DecisionInput = z.object({
  optionId: z.string().min(1),
  elapsedMs: z.number().int().min(0).max(1000 * 60 * 60).optional(),
});

// ----- Evaluation (Decision Evaluator rubric output) -----
const Evaluation = z.object({
  total: z.number().min(0).max(100),
  insufficientData: z.boolean(),
  dimensions: z.record(z.string(), z.number()),
  rationale: z.array(z.string()),
  rationaleEn: z.array(z.string()).optional(),
  passed: z.boolean(),
});

// ----- Mentor reply -----
const MentorReply = z.object({
  mode: Mode,
  allowed: z.boolean(), // false when hints are blocked (verification)
  level: z.number().int().min(0).max(3),
  message: z.object({ ar: z.string(), en: z.string() }),
  aiMode: z.enum(["live", "dev-deterministic"]),
});

// ----- Readiness profile (Readiness Analyst) -----
const Readiness = z.object({
  status: z.enum(["READY_EVIDENCE", "DEVELOPING", "INSUFFICIENT_EVIDENCE"]),
  trainingPerformance: z.number().nullable(),
  verifiedSkills: z.array(z.string()),
  unverifiedSkills: z.array(z.string()),
  gaps: z.array(z.string()),
  autonomy: z.number().nullable(),
  evidenceCount: z.object({ training: z.number(), verification: z.number() }),
  disclaimer: z.object({ ar: z.string(), en: z.string() }),
});

module.exports = {
  SessionState,
  Mode,
  EvidenceItem,
  DecisionOption,
  Scenario,
  DecisionInput,
  Evaluation,
  MentorReply,
  Readiness,
};
