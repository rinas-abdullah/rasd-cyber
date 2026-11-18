// AI-Generated After-Action Review (brief §8). Builds a professional AAR from
// ONLY the events actually recorded in the session (world timeline + decisions +
// evaluation). The AI may phrase the prose, but every claim is grounded in a
// recorded event — the builder never invents incidents the simulation didn't log
// (brief §8 last line, §14 "report without fabricated events").

const provider = require("../ai/orchestratorProvider");

function decisionLabel(scenario, optionId) {
  const d = scenario.decisions.find((x) => x.id === optionId);
  return d ? d.label : { ar: optionId, en: optionId };
}

/**
 * @param {object} session  full session record
 * @returns {object} AAR grounded strictly in recorded events
 */
async function build(session) {
  const { scenario, world, ledger, evaluation, decisions = [] } = session;

  const timeline = world.timeline.map((e) => ({
    step: e.step,
    type: e.type,
    ref: e.ref,
    note: e.note,
    label: e.type === "decision" ? decisionLabel(scenario, e.ref) : null,
    at: e.at,
  }));

  const effective = decisions.filter((d) => d.effective);
  const ineffective = decisions.filter((d) => !d.effective);

  // Evidence the learner never surfaced that was relevant (ignored evidence).
  const ignoredEvidence = scenario.evidence
    .filter((e) => e.relevant && !world.revealedEvidence.includes(e.id))
    .map((e) => ({ id: e.id, label: e.label }));

  const strengths = [...new Set(effective.map((d) => d.kind))];
  const improvements = [];
  if (world.outcome === "breach") improvements.push("containment-before-exfiltration");
  if (ignoredEvidence.length) improvements.push("evidence-collection");
  if (ledger && ledger._dithering > 0) improvements.push("decisiveness-under-time");
  if (!world.escalated) improvements.push("timely-escalation");

  const summary = {
    ar: `حادث محاكاة (${scenario.sector}) حول ${scenario.objective.ar} انتهى بحالة: ${world.outcome === "contained" ? "احتواء" : world.outcome === "breach" ? "تسريب" : "غير مكتمل"}.`,
    en: `A simulated ${scenario.sector} incident on "${scenario.objective.en}" ended as: ${world.outcome || "incomplete"}.`,
  };

  // Optional AI narrative, grounded in the recorded timeline only.
  const narrativeFallback = () =>
    `Outcome: ${world.outcome || "incomplete"}. Effective actions: ${strengths.join(", ") || "none"}. ` +
    `Areas to improve: ${improvements.join(", ") || "none"}.`;
  const narrative = await provider.complete({
    system:
      "You are writing an after-action review for a defensive cybersecurity training simulation. " +
      "Use ONLY the facts in the provided timeline. Do not invent events. 3-4 sentences.",
    task: "Summarise what happened and the key lessons, grounded strictly in the timeline.",
    untrusted: JSON.stringify({ timeline, outcome: world.outcome, strengths, improvements }),
    fallback: narrativeFallback,
  });

  return {
    scenarioId: scenario.scenarioId,
    objective: scenario.objective,
    summary,
    outcome: world.outcome,
    timeline, // the interactive replay feeds on this
    keyDecisions: decisions.map((d) => ({ step: d.step, kind: d.kind, effective: d.effective, label: decisionLabel(scenario, d.optionId) })),
    effectiveDecisions: effective.map((d) => d.kind),
    costlyMistakes: ineffective.map((d) => d.kind),
    ignoredEvidence,
    skillsShown: strengths,
    skillsToImprove: improvements,
    evaluation,
    narrative: { text: narrative.text || narrativeFallback(), aiMode: narrative.aiMode, error: narrative.error || null },
    recommendation: evaluation && evaluation.passed
      ? { ar: "جاهز للانتقال إلى اختبار تحقق مستقل.", en: "Ready to move to an independent verification test." }
      : { ar: "يُنصح بجولة تدريب إضافية قبل التحقق.", en: "An additional training round is recommended before verification." },
  };
}

module.exports = { build };
