// Simulation + evaluation tests (brief §14): scenario validity, deterministic
// world/consequence replay, adversary reactions, auditable scoring.

const { test } = require("node:test");
const assert = require("node:assert");

const bank = require("../backend/services/scenarios/scenarioBank");
const { createWorld, advanceAdversary } = require("../backend/services/simulation/incidentWorld");
const { freshLedger, applyDecision } = require("../backend/services/simulation/consequenceEngine");
const evaluator = require("../backend/services/agents/decisionEvaluator");

test("scenario bank produces a schema-valid scenario", () => {
  const sc = bank.instantiate("priv-acct-edu", "s1");
  assert.equal(sc.skill, "privileged-account-compromise");
  assert.ok(sc.evidence.length > 0 && sc.decisions.length > 0);
  assert.ok(sc.evidence.some((e) => e.relevant) && sc.evidence.some((e) => !e.relevant));
});

test("invalid scenario template is rejected", () => {
  assert.throws(() => bank.instantiate("does-not-exist", "s1"), /Unknown scenario template/);
});

test("world starts with only non-gated evidence revealed", () => {
  const sc = bank.instantiate("priv-acct-edu", "s2");
  const w = createWorld(sc);
  const startEv = sc.evidence.filter((e) => !e.revealedBy).map((e) => e.id).sort();
  assert.deepEqual(w.revealedEvidence.slice().sort(), startEv);
  assert.equal(w.step, 0);
  assert.equal(w.outcome, null);
});

test("applying a decision changes simulation state (step + account)", () => {
  const sc = bank.instantiate("priv-acct-edu", "s3");
  const w0 = createWorld(sc);
  const { world } = applyDecision(w0, sc, "d_suspend_account", freshLedger());
  assert.equal(world.step, 1);
  const priv = Object.values(world.accounts).find((a) => a.privileged);
  assert.equal(priv.suspended, true);
  // Input world is not mutated (purity).
  assert.equal(w0.step, 0);
});

test("consequence engine is deterministic (same inputs → same result)", () => {
  const sc = bank.instantiate("priv-acct-edu", "s4");
  // Normalise wall-clock timestamps (`at`) which are the only non-deterministic
  // field by design; the operational state transitions must be identical.
  const strip = (world) => {
    const w = JSON.parse(JSON.stringify(world));
    w.timeline = w.timeline.map((e) => ({ ...e, at: "T" }));
    return w;
  };
  const run = () => {
    let w = createWorld(sc);
    let l = freshLedger();
    for (const opt of ["d_collect_logs", "d_suspend_account", "d_escalate"]) {
      const r = applyDecision(w, sc, opt, l);
      w = r.world;
      l = r.ledger;
    }
    return { w: strip(w), l };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.w, b.w);
  assert.deepEqual(a.l, b.l);
});

test("adversary advances when not contained, and is contained by suspension", () => {
  const sc = bank.instantiate("priv-acct-edu", "s5");
  const w = createWorld(sc);
  const ev = advanceAdversary(w);
  assert.ok(ev && w.adversary.stage !== "recon"); // advanced
  // Suspend the account then tick → contained.
  const priv = Object.values(w.accounts).find((a) => a.privileged);
  w.accounts[priv.id].suspended = true;
  advanceAdversary(w);
  assert.equal(w.adversary.contained, true);
});

test("ignoring the incident leads to a breach outcome", () => {
  const sc = bank.instantiate("priv-acct-edu", "s6");
  let w = createWorld(sc);
  let l = freshLedger();
  let outcome = null;
  for (const opt of ["d_ignore", "d_monitor", "d_monitor", "d_monitor"]) {
    const r = applyDecision(w, sc, opt, l);
    w = r.world;
    l = r.ledger;
    outcome = w.outcome;
    if (outcome) break;
  }
  assert.equal(outcome, "breach");
});

test("evaluator is auditable: rubric dimensions + rationale, no LLM", () => {
  const sc = bank.instantiate("priv-acct-edu", "s7");
  let w = createWorld(sc);
  let l = freshLedger();
  const decisions = [];
  for (const opt of ["d_collect_logs", "d_suspend_account", "d_escalate"]) {
    const r = applyDecision(w, sc, opt, l);
    w = r.world;
    l = r.ledger;
    decisions.push({ optionId: opt, kind: r.consequence.kind, effective: r.consequence.effective });
  }
  const evo = evaluator.evaluate({ scenario: sc, world: w, ledger: l, decisions });
  assert.equal(evo.insufficientData, false);
  assert.ok(evo.total > 0 && evo.total <= 100);
  assert.ok(Array.isArray(evo.rationale) && evo.rationale.length > 0);
  assert.ok(evo.rationaleEn.every((line) => /^[\x00-\x7F]*$/.test(line)));
  assert.ok("incidentContainment" in evo.dimensions);
});

test("evaluator reports insufficient data with no decisions", () => {
  const sc = bank.instantiate("priv-acct-edu", "s8");
  const evo = evaluator.evaluate({ scenario: sc, world: createWorld(sc), ledger: freshLedger(), decisions: [] });
  assert.equal(evo.insufficientData, true);
  assert.equal(evo.total, 0);
  assert.equal(evo.rationaleEn[0], "No recorded decisions to score.");
});
