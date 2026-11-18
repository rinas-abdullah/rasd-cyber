// AI-Generated After-Action Review (brief §8). Builds a professional AAR from
// ONLY the events actually recorded in the session (world timeline + decisions +
// evaluation). The AI may phrase the prose, but every claim is grounded in a
// recorded event — the builder never invents incidents the simulation didn't log
// (brief §8 last line, §14 "report without fabricated events").

const provider = require("../ai/orchestratorProvider");
const { STAGE_LABELS } = require("../agents/adversaryAgent");

// Bilingual labels for non-decision timeline notes recorded by the world.
const ADVERSARY_NOTE_LABELS = {
  adversary_contained: { ar: "تم احتواء الخصم", en: "Adversary contained" },
  data_exfiltrated: { ar: "تسريب بيانات افتراضي", en: "Simulated data exfiltration" },
};
function adversaryNoteLabel(note) {
  if (ADVERSARY_NOTE_LABELS[note]) return ADVERSARY_NOTE_LABELS[note];
  const stage = String(note || "").replace(/^adversary_/, "");
  const label = STAGE_LABELS[stage];
  return label ? { ar: `الخصم: ${label.ar}`, en: `Adversary: ${label.en}` } : null;
}

const KIND_LABELS = {
  collect_logs: { ar: "جمع السجلات", en: "log collection" },
  suspend_account: { ar: "تعليق الحساب", en: "account suspension" },
  isolate: { ar: "عزل الأصل", en: "asset isolation" },
  reset_credentials: { ar: "إعادة تعيين بيانات الاعتماد", en: "credential reset" },
  block_network: { ar: "حجب الاتصال", en: "network blocking" },
  escalate: { ar: "التصعيد", en: "escalation" },
  notify_business: { ar: "إبلاغ أصحاب العلاقة", en: "stakeholder notification" },
  monitor: { ar: "المراقبة", en: "monitoring" },
  ignore: { ar: "التجاهل", en: "ignoring" },
};
const IMPROVEMENT_LABELS = {
  "containment-before-exfiltration": { ar: "الاحتواء قبل التسريب", en: "containment before exfiltration" },
  "evidence-collection": { ar: "جمع الأدلة", en: "evidence collection" },
  "decisiveness-under-time": { ar: "الحسم تحت ضغط الوقت", en: "decisiveness under time pressure" },
  "timely-escalation": { ar: "التصعيد في الوقت المناسب", en: "timely escalation" },
};
const OUTCOME_LABELS = {
  contained: { ar: "احتواء", en: "contained" },
  breach: { ar: "تسريب", en: "breach" },
  timeout: { ar: "انتهاء المهلة", en: "timed out" },
};
const SECTOR_LABELS = {
  healthcare: { ar: "الرعاية الصحية", en: "healthcare" },
  finance: { ar: "القطاع المالي", en: "finance" },
  education: { ar: "التعليم", en: "education" },
};
const lbl = (map, key, lang) => (map[key] ? map[key][lang] : key);

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
    label: e.type === "decision" ? decisionLabel(scenario, e.ref) : adversaryNoteLabel(e.note),
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
    ar: `حادث محاكاة (${lbl(SECTOR_LABELS, scenario.sector, "ar")}) حول ${scenario.objective.ar} انتهى بحالة: ${world.outcome === "contained" ? "احتواء" : world.outcome === "breach" ? "تسريب" : "غير مكتمل"}.`,
    en: `A simulated ${scenario.sector} incident on "${scenario.objective.en}" ended as: ${world.outcome || "incomplete"}.`,
  };

  // Deterministic, bilingual narrative used whenever no live model answers.
  const outcomeKey = world.outcome || "incomplete";
  const deterministicNarrative = {
    en:
      `Outcome: ${lbl(OUTCOME_LABELS, outcomeKey, "en")}. ` +
      `Effective actions: ${strengths.map((k) => lbl(KIND_LABELS, k, "en")).join(", ") || "none"}. ` +
      `Areas to improve: ${improvements.map((k) => lbl(IMPROVEMENT_LABELS, k, "en")).join(", ") || "none"}.`,
    ar:
      `النتيجة: ${outcomeKey === "incomplete" ? "غير مكتمل" : lbl(OUTCOME_LABELS, outcomeKey, "ar")}. ` +
      `القرارات الفعّالة: ${strengths.map((k) => lbl(KIND_LABELS, k, "ar")).join("، ") || "لا يوجد"}. ` +
      `مجالات التحسين: ${improvements.map((k) => lbl(IMPROVEMENT_LABELS, k, "ar")).join("، ") || "لا يوجد"}.`,
  };

  // Optional AI narrative, grounded in the recorded timeline only.
  const narrativeFallback = () => deterministicNarrative.en;
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
    narrative: {
      text: narrative.text || narrativeFallback(),
      // Arabic text is only available for the deterministic narrative; a live
      // model answer is shown as returned.
      textAr: narrative.aiMode === "live" && narrative.text ? null : deterministicNarrative.ar,
      aiMode: narrative.aiMode,
      error: narrative.error || null,
    },
    recommendation: evaluation && evaluation.passed
      ? { ar: "جاهز للانتقال إلى اختبار تحقق مستقل.", en: "Ready to move to an independent verification test." }
      : { ar: "يُنصح بجولة تدريب إضافية قبل التحقق.", en: "An additional training round is recommended before verification." },
  };
}

module.exports = { build };
