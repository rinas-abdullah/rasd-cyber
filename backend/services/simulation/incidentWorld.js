// Adaptive Incident World — the deterministic state model the whole simulation
// runs on (brief §5). Every field changes only through typed transitions, so a
// world can be rebuilt by replaying the same decisions and always lands in the
// same state (tested in test/simulation.test.js).
//
// The AI never mutates this directly. The Orchestrator calls these pure helpers;
// the model only chooses which allowed event to surface and explains it.

// Adversary kill-chain stages, in order. The simulated adversary advances one
// stage per "tick" while it is not contained. Reaching EXFILTRATION = breach.
const ADVERSARY_STAGES = ["recon", "lateral_movement", "collection", "exfiltration", "contained"];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Build the initial world from a validated scenario.
 */
function createWorld(scenario) {
  const assets = {};
  for (const a of scenario.world.assets) {
    assets[a.id] = { id: a.id, name: a.name, critical: a.critical, isolated: false, wiped: false };
  }
  const accounts = {};
  for (const ac of scenario.world.accounts) {
    accounts[ac.id] = { id: ac.id, name: ac.name, privileged: ac.privileged, suspended: false, credentialsReset: false };
  }
  const controls = {};
  for (const c of scenario.world.controls) {
    controls[c.id] = { id: c.id, name: c.name, enabled: c.enabled };
  }

  // Evidence available at the start = items with revealedBy === null.
  const revealedEvidence = scenario.evidence.filter((e) => !e.revealedBy).map((e) => e.id);

  return {
    scenarioId: scenario.scenarioId,
    templateId: scenario.templateId,
    skill: scenario.skill,
    sector: scenario.sector,
    step: 0,
    assets,
    accounts,
    controls,
    network: { suspiciousBlocked: false },
    revealedEvidence,
    adversary: {
      stage: "recon",
      contained: false,
      exfiltrated: false,
      // The privileged account the adversary is abusing (first privileged one).
      targetAccountId: (scenario.world.accounts.find((a) => a.privileged) || {}).id || null,
      // The critical asset the adversary is heading for.
      targetAssetId: (scenario.world.assets.find((a) => a.critical) || {}).id || null,
    },
    businessImpact: { serviceContinuity: 100, unnecessaryDowntime: 0 },
    escalated: false,
    businessNotified: false,
    timeline: [], // { step, type, ref, note, at }
    defenderActions: [], // decision option ids in order
    outcome: null, // null | "contained" | "breach"
  };
}

function record(world, type, ref, note) {
  world.timeline.push({ step: world.step, type, ref: ref || null, note: note || null, at: new Date().toISOString() });
}

/**
 * Advance the simulated adversary by one tick according to fixed rules.
 * Deterministic: depends only on current world state, never on randomness or the
 * model. Returns the event it produced (or null if already contained).
 */
function advanceAdversary(world) {
  const adv = world.adversary;
  if (adv.contained || world.outcome) return null;

  const target = world.accounts[adv.targetAccountId];
  const asset = world.assets[adv.targetAssetId];

  // Containment rule: the adversary is contained once the abused account is
  // suspended (or credentials reset) AND, if it had already reached the network
  // stage, suspicious traffic is blocked.
  const accountNeutralised = target && (target.suspended || target.credentialsReset);
  const assetSealed = asset && asset.isolated;
  if (accountNeutralised && (adv.stage === "recon" || adv.stage === "lateral_movement" || assetSealed || world.network.suspiciousBlocked)) {
    adv.stage = "contained";
    adv.contained = true;
    world.outcome = world.outcome || "contained";
    record(world, "adversary", null, "adversary_contained");
    return { kind: "contained", note: "adversary_contained" };
  }

  // Otherwise it progresses one stage.
  const idx = ADVERSARY_STAGES.indexOf(adv.stage);
  const nextStage = ADVERSARY_STAGES[Math.min(idx + 1, ADVERSARY_STAGES.length - 2)];
  // If next stage would be exfiltration and nothing stopped it → breach.
  if (adv.stage === "collection") {
    if (!accountNeutralised && !world.network.suspiciousBlocked) {
      adv.stage = "exfiltration";
      adv.exfiltrated = true;
      world.outcome = "breach";
      record(world, "adversary", null, "data_exfiltrated");
      return { kind: "exfiltration", note: "data_exfiltrated" };
    }
  }
  adv.stage = nextStage;
  record(world, "adversary", null, `adversary_${nextStage}`);
  return { kind: "advance", stage: nextStage, note: `adversary_${nextStage}` };
}

module.exports = {
  ADVERSARY_STAGES,
  createWorld,
  advanceAdversary,
  record,
  deepClone,
};
