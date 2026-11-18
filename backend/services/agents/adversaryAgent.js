// Agent 02 — Adversary Agent (brief §4). The adversary's behaviour is defined by
// the deterministic rules in simulation/incidentWorld.js (advanceAdversary). This
// module is the agent *interface* over those rules: it describes the adversary's
// current intent and next likely move for the UI and for the AI narrator, and it
// guarantees the adversary only ever acts through simulated, in-world events.
//
// Hard safety boundary (brief §4, §11): this agent NEVER executes a real action,
// NEVER reaches a host outside the simulated world, and has no free-form tools.
// All it can do is read world state and return simulated-event descriptions.

const STAGE_LABELS = {
  recon: { ar: "استطلاع", en: "Reconnaissance" },
  lateral_movement: { ar: "حركة جانبية", en: "Lateral movement" },
  collection: { ar: "تجميع بيانات", en: "Collection" },
  exfiltration: { ar: "تسريب بيانات", en: "Exfiltration" },
  contained: { ar: "محتوى", en: "Contained" },
};

const STAGE_EVENTS = {
  recon: { ar: "يفحص الخصم الحسابات والأصول بحثًا عن نقطة ارتكاز.", en: "The adversary is probing accounts and assets for a foothold." },
  lateral_movement: { ar: "يحاول الخصم التحرك نحو نظام حيوي.", en: "The adversary attempts to move toward a critical system." },
  collection: { ar: "يجمع الخصم بيانات حساسة استعدادًا للتسريب.", en: "The adversary is staging sensitive data for exfiltration." },
  exfiltration: { ar: "ينقل الخصم البيانات إلى خارج المؤسسة.", en: "The adversary is moving data out of the organisation." },
  contained: { ar: "أُوقف نشاط الخصم.", en: "The adversary's activity has been stopped." },
};

function summary(world) {
  const adv = world.adversary;
  return {
    stage: adv.stage,
    stageLabel: STAGE_LABELS[adv.stage] || STAGE_LABELS.recon,
    contained: adv.contained,
    exfiltrated: adv.exfiltrated,
    narration: STAGE_EVENTS[adv.stage] || STAGE_EVENTS.recon,
    targetAccountId: adv.targetAccountId,
    targetAssetId: adv.targetAssetId,
  };
}

// What the adversary will do next if the defender does nothing — for UI tension.
// Read-only projection; does not mutate the world.
function nextIntent(world) {
  const order = ["recon", "lateral_movement", "collection", "exfiltration"];
  const idx = order.indexOf(world.adversary.stage);
  const next = world.adversary.contained ? "contained" : order[Math.min(idx + 1, order.length - 1)];
  return { stage: next, label: STAGE_LABELS[next], narration: STAGE_EVENTS[next] };
}

module.exports = { summary, nextIntent, STAGE_LABELS };
