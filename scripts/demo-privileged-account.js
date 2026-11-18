#!/usr/bin/env node
// End-to-end demo (brief §15): "Suspicious Privileged Account Activity".
// Runs the FULL AI-operated loop through the real engines — assessment →
// planning → simulation (with a live rule-bound adversary) → evaluation →
// after-action → independent verification in a different sector → readiness —
// and prints a readable transcript. No network or API key required; the AI
// narration layer runs in dev-deterministic mode and is labelled as such.
//
//   npm run demo
//
// The same steps are available over the REST API (see docs/03-ai-orchestrator.md).

const orch = require("../backend/services/orchestrator/orchestrator");
const adversaryAgent = require("../backend/services/agents/adversaryAgent");
const provider = require("../backend/services/ai/orchestratorProvider");

const USER_ID = 42;
const line = (c = "─") => console.log(c.repeat(72));
const h = (t) => { line(); console.log(t); line(); };

function showState(s) {
  console.log(`  state=${s.state}  mode=${s.mode}  sector=${s.current ? s.current.sector : "-"}  aiMode=${s.aiMode}`);
}

function showWorld(cur) {
  const adv = cur.adversary;
  console.log(`  adversary stage: ${adv.stage} (${adv.stageLabel.en}) contained=${adv.contained}`);
  console.log(`  evidence available: ${cur.availableEvidence.map((e) => e.label.en).join(" | ") || "(none yet)"}`);
}

async function play(sessionId, seq, label) {
  for (const opt of seq) {
    const res = await orch.submitDecision(sessionId, USER_ID, opt, 2200);
    const c = res.lastConsequence;
    console.log(`  ▶ ${label} decision: ${c.kind.padEnd(16)} effective=${c.effective}  → ${c.explanation.en}`);
    if (c.adversaryEvent) {
      console.log(`      adversary: ${c.adversaryEvent.note || c.adversaryEvent.stage}`);
    }
    if (res.phaseEnded) {
      console.log(`  ⏹ phase ended (outcome: ${res.session.current.world.outcome})`);
      return res.session;
    }
  }
  return orch.getSession(sessionId, USER_ID);
}

(async () => {
  h("RASD AI Orchestrator — Demo: Suspicious Privileged Account Activity");
  console.log(`AI provider mode: ${provider.currentMode()} ` +
    `(${provider.isLiveConfigured() ? "live key configured" : "no live key — deterministic narration, honestly labelled"})`);

  // 1-3. Create a session: the Orchestrator runs ASSESSMENT + PLANNING and the
  //       Scenario Director instantiates the training world.
  h("1) Orchestrator: assessment + planning + scenario generation");
  let s = await orch.createSession({ userId: USER_ID, skill: "privileged-account-compromise", assessmentLevel: 4 });
  showState(s);
  console.log(`  objective: ${s.plan.objective.en}`);
  console.log(`  organization: ${s.current.world.organization.name} (${s.current.sector})`);
  showWorld(s.current);
  const trainedSector = s.current.sector;

  // 4-8. Simulation: the learner acts, the consequence engine computes effects,
  //      the rule-bound adversary reacts, mentor hints are available (training).
  h("2) Simulation — learner decisions, consequences, live adversary");
  const hint = await orch.requestHint(s.sessionId, USER_ID, 2);
  console.log(`  🧑‍🏫 mentor (TRAINING, allowed=${hint.allowed}): ${hint.message.en}`);
  s = await play(s.sessionId, ["d_collect_logs", "d_suspend_account", "d_escalate", "d_notify_business"], "train");

  // 9. Evaluation + after-action (recorded events only).
  h("3) Evaluation + After-Action Review (recorded events only)");
  s = await orch.getSession(s.sessionId, USER_ID);
  const te = s.training.evaluation;
  console.log(`  training score: ${te.total}/100  passed=${te.passed}`);
  te.rationale.forEach((r) => console.log(`   • ${r}`));
  const aar = await orch.getAfterAction(s.sessionId, USER_ID);
  console.log(`  AAR outcome: ${aar.outcome}  timeline events: ${aar.timeline.length}  (narrative aiMode=${aar.narrative.aiMode})`);
  console.log(`  skills shown: ${aar.skillsShown.join(", ") || "-"} | to improve: ${aar.skillsToImprove.join(", ") || "-"}`);

  // 10. Independent skill verification in a DIFFERENT sector (transfer, not recall).
  h("4) Skill Verification — new incident, different sector, no hints");
  const v = await orch.startVerification(s.sessionId, USER_ID);
  showState(v);
  console.log(`  verification sector: ${v.current.sector} (trained on: ${trainedSector}) → measures transfer`);
  const blocked = await orch.requestHint(s.sessionId, USER_ID, 3);
  console.log(`  🧑‍🏫 mentor (VERIFICATION, allowed=${blocked.allowed}): ${blocked.message.en}`);
  const vseq = v.current.sector === "finance"
    ? ["d_collect_logs", "d_suspend_account", "d_block_network", "d_escalate"]
    : ["d_collect_logs", "d_suspend_account", "d_escalate", "d_notify_business"];
  const done = await play(s.sessionId, vseq, "verify");

  // 11-12. Readiness profile (evidence-based) + supervisor view.
  h("5) Readiness profile (evidence-based)");
  const full = await orch.getSession(s.sessionId, USER_ID);
  console.log(`  verification score: ${full.verification.evaluation.total}/100  passed=${full.verification.evaluation.passed}  final state=${full.state}`);
  const rd = await orch.getReadiness(USER_ID);
  console.log(`  readiness status: ${rd.readiness.status}`);
  console.log(`  verified skills: ${JSON.stringify(rd.readiness.verifiedSkills)}`);
  console.log(`  training performance: ${rd.readiness.trainingPerformance}  autonomy: ${rd.readiness.autonomy}`);
  console.log(`  disclaimer: ${rd.readiness.disclaimer.en}`);

  h("Demo complete — full loop ran end to end on the real engines.");
  console.log("Every number above was computed by the deterministic simulation/rubric,");
  console.log("not by a language model. Re-run to reproduce identical operational results.");
  process.exit(0);
})().catch((e) => {
  console.error("Demo failed:", e);
  process.exit(1);
});
