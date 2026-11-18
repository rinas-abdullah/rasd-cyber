// Orchestrator lifecycle tests (brief §14): session create, resume, decisions,
// verification generation, hint-blocking, readiness evidence, ownership isolation.

const { test } = require("node:test");
const assert = require("node:assert");

const orch = require("../backend/services/orchestrator/orchestrator");
const store = require("../backend/services/orchestrator/sessionStore");

function goodTrainingSeq() {
  return ["d_collect_logs", "d_suspend_account", "d_escalate", "d_notify_business"];
}

async function playPhase(sessionId, userId, seq) {
  for (const opt of seq) {
    const res = await orch.submitDecision(sessionId, userId, opt, 2000);
    if (res.phaseEnded) return res;
  }
  return null;
}

test("create session runs assessment+planning and lands in SIMULATION", async () => {
  const s = await orch.createSession({ userId: 1, assessmentLevel: 4 });
  assert.equal(s.state, "SIMULATION");
  assert.equal(s.mode, "TRAINING");
  assert.ok(s.current.decisions.length >= 5);
  assert.ok(s.plan && s.assessment.level === 4);
});

test("crisis mode starts a timed, simulated hospital incident with adaptive events", async () => {
  const s = await orch.createCrisisSession({ userId: 20 });
  assert.equal(s.state, "SIMULATION");
  assert.equal(s.mode, "CRISIS");
  assert.equal(s.crisisMode, true);
  assert.equal(s.current.sector, "healthcare");
  assert.equal(s.crisis.durationMs, orch.CRISIS_DURATION_MS);
  assert.equal(s.crisis.events[0].key, "intrusion-detected");

  await orch.submitDecision(s.sessionId, 20, "d_monitor", 1);
  const updated = await orch.getSession(s.sessionId, 20);
  assert.ok(updated.crisis.events.some((event) => event.key === "lateral-movement"));
  assert.ok(updated.crisis.responseTimeMs >= 0);

  await orch.submitDecision(s.sessionId, 20, "d_monitor", 1);
  const escalated = await orch.getSession(s.sessionId, 20);
  assert.ok(escalated.crisis.events.some((event) => event.key === "records-query"));
  await orch.submitDecision(s.sessionId, 20, "d_monitor", 1);
  const breached = await orch.getSession(s.sessionId, 20);
  assert.equal(breached.crisis.outcome, "breach");
  assert.ok(breached.crisis.events.some((event) => event.key === "simulated-data-exposure"));
  const fingerprint = await orch.getBehavioralFingerprint(20);
  assert.equal(fingerprint.axes.find((axis) => axis.axis === "evidenceAnalysis").value, 25);
  assert.ok(fingerprint.axes.find((axis) => axis.axis === "pressureJudgment").value < 30);
});

test("crisis deadline is enforced by the server and concludes the simulation", async () => {
  const s = await orch.createCrisisSession({ userId: 21 });
  await orch.submitDecision(s.sessionId, 21, "d_monitor", 1);
  const raw = await orch._getRaw(s.sessionId, 21);
  raw.crisisDeadlineAt = Date.now() - 1;
  await store.save(raw);

  const expired = await orch.getSession(s.sessionId, 21);
  assert.equal(expired.state, "FEEDBACK");
  assert.equal(expired.crisis.outcome, "timeout");
  assert.ok(expired.crisis.events.some((event) => event.key === "time-expired"));
});

test("behavioral fingerprint reports insufficient data then scores simulated decisions", async () => {
  const uid = 22;
  const empty = await orch.getBehavioralFingerprint(uid);
  assert.equal(empty.insufficientData, true);

  const s = await orch.createSession({ userId: uid });
  await playPhase(s.sessionId, uid, goodTrainingSeq());
  const fingerprint = await orch.getBehavioralFingerprint(uid);
  assert.equal(fingerprint.insufficientData, false);
  assert.equal(fingerprint.decisionCount, 3);
  assert.ok(fingerprint.axes.some((axis) => axis.axis === "evidenceAnalysis" && axis.available));
  assert.ok(fingerprint.axes.some((axis) => axis.axis === "pressureJudgment" && !axis.available));
});

test("decision timing uses server-observed time instead of the client value", async () => {
  const s = await orch.createSession({ userId: 23 });
  const raw = await orch._getRaw(s.sessionId, 23);
  raw.training.decisionStartedAt = Date.now() - 5000;
  await store.save(raw);

  const result = await orch.submitDecision(s.sessionId, 23, "d_collect_logs", 0);
  assert.ok(result.lastConsequence.elapsedMs >= 5000);
});

test("session is resumable from the exact saved state", async () => {
  const s = await orch.createSession({ userId: 2 });
  await orch.submitDecision(s.sessionId, 2, "d_collect_logs", 1000);
  // Simulate a browser reload: fetch the session fresh from the store.
  const resumed = await orch.getSession(s.sessionId, 2);
  assert.equal(resumed.current.world.step, 1);
  // Can keep acting after "reload".
  const res = await orch.submitDecision(s.sessionId, 2, "d_suspend_account", 1000);
  assert.ok(res.session.current.world.step === 2);
});

test("ownership is enforced (another user cannot read or act)", async () => {
  const s = await orch.createSession({ userId: 10 });
  await assert.rejects(() => orch.getSession(s.sessionId, 999), /Forbidden/);
  await assert.rejects(() => orch.submitDecision(s.sessionId, 999, "d_collect_logs", 0), /Forbidden/);
});

test("institution isolation prevents cross-institution session access", async () => {
  const s = await orch.createSession({ userId: 12, institutionId: 101 });
  await assert.rejects(
    () => orch.getSession(s.sessionId, 12, 202),
    /Forbidden/
  );
  await assert.rejects(
    () => orch.submitDecision(s.sessionId, 12, "d_collect_logs", 0, 202),
    /Forbidden/
  );
});

test("invalid decision option is rejected", async () => {
  const s = await orch.createSession({ userId: 11 });
  await assert.rejects(() => orch.submitDecision(s.sessionId, 11, "d_not_a_real_option", 0), /Invalid decision/);
});

test("full loop: training → verification (different sector) → completed", async () => {
  const s = await orch.createSession({ userId: 3, assessmentLevel: 4 });
  const trainedSector = s.current.sector;
  await playPhase(s.sessionId, 3, goodTrainingSeq());
  const afterTrain = await orch.getSession(s.sessionId, 3);
  assert.equal(afterTrain.state, "FEEDBACK");
  assert.ok(afterTrain.training.evaluation.total > 0);

  const v = await orch.startVerification(s.sessionId, 3);
  assert.equal(v.state, "VERIFICATION");
  assert.notEqual(v.current.sector, trainedSector); // transfer, not recall

  const vseq = v.current.sector === "finance"
    ? ["d_collect_logs", "d_suspend_account", "d_block_network", "d_escalate"]
    : goodTrainingSeq();
  await playPhase(s.sessionId, 3, vseq);
  const done = await orch.getSession(s.sessionId, 3);
  assert.equal(done.state, "COMPLETED");
  assert.ok(done.verification.evaluation.total > 0);
});

test("hints are allowed in TRAINING but blocked in VERIFICATION", async () => {
  const s = await orch.createSession({ userId: 4 });
  const h1 = await orch.requestHint(s.sessionId, 4, 2);
  assert.equal(h1.allowed, true);
  assert.ok(h1.message.ar && h1.message.en);

  await playPhase(s.sessionId, 4, goodTrainingSeq());
  await orch.startVerification(s.sessionId, 4);
  const h2 = await orch.requestHint(s.sessionId, 4, 3);
  assert.equal(h2.allowed, false); // no leakage during assessment
});

test("readiness is evidence-based: INSUFFICIENT_EVIDENCE until a verification exists", async () => {
  const uid = 5;
  // No sessions yet.
  let rd = await orch.getReadiness(uid);
  assert.equal(rd.readiness.status, "INSUFFICIENT_EVIDENCE");

  // Train only (no verification) → still insufficient evidence.
  const s = await orch.createSession({ userId: uid });
  await playPhase(s.sessionId, uid, goodTrainingSeq());
  rd = await orch.getReadiness(uid);
  assert.equal(rd.readiness.status, "INSUFFICIENT_EVIDENCE");
  assert.ok(rd.readiness.disclaimer.ar.length > 0);

  // Complete a verification → status upgrades and skill can be verified.
  const v = await orch.startVerification(s.sessionId, uid);
  const vseq = v.current.sector === "finance"
    ? ["d_collect_logs", "d_suspend_account", "d_block_network", "d_escalate"]
    : goodTrainingSeq();
  await playPhase(s.sessionId, uid, vseq);
  rd = await orch.getReadiness(uid);
  assert.notEqual(rd.readiness.status, "INSUFFICIENT_EVIDENCE");
});

test("illegal state transition is refused (verify before feedback)", async () => {
  const s = await orch.createSession({ userId: 6 });
  await assert.rejects(() => orch.startVerification(s.sessionId, 6), /FEEDBACK|BAD_STATE/);
});

test("step cap ends the phase (governance)", async () => {
  const s = await orch.createSession({ userId: 7 });
  // Spam monitor (never contains) up to the cap; phase must end by itself.
  let ended = false;
  for (let i = 0; i < orch.CAPS.maxStepsPerPhase + 2; i += 1) {
    const res = await orch.submitDecision(s.sessionId, 7, "d_monitor", 100).catch((e) => ({ err: e }));
    if (res.err) { ended = true; break; }
    if (res.phaseEnded) { ended = true; break; }
  }
  assert.equal(ended, true);
});

test.after(() => store._reset());
