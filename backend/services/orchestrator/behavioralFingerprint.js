const MIN_DECISIONS = 3;

const LABELS = {
  responseSpeed: { en: "Response timing", ar: "سرعة الاستجابة" },
  evidenceAnalysis: { en: "Evidence analysis", ar: "تحليل الأدلة" },
  decisionEffectiveness: { en: "Decision effectiveness", ar: "فعالية القرارات" },
  serviceContinuity: { en: "Service continuity", ar: "استمرارية الخدمة" },
  pressureJudgment: { en: "Pressure judgment", ar: "الحكم تحت الضغط" },
};

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function computeFingerprint(sessions) {
  const sampled = sessions
    .map((session) => ({ session, phase: session.training }))
    .filter(({ phase }) => Array.isArray(phase?.decisions) && phase.decisions.length > 0);
  const decisions = sampled.flatMap(({ phase }) => phase.decisions);

  if (decisions.length < MIN_DECISIONS) {
    return {
      insufficientData: true,
      sampleSize: sampled.length,
      decisionCount: decisions.length,
      minimumDecisions: MIN_DECISIONS,
      source: "simulated-training-sessions",
      message: {
        en: `Complete at least ${MIN_DECISIONS} decisions in simulated training sessions to build a behavioral fingerprint.`,
        ar: `أكمل ${MIN_DECISIONS} قرارات على الأقل في جلسات تدريب افتراضية لبناء البصمة السلوكية.`,
      },
    };
  }

  const responseTimes = decisions.map((decision) => decision.elapsedMs).filter(Number.isFinite);
  const collectionDecisions = decisions.filter((decision) => decision.kind === "collect_logs");
  const effectiveRate = average(decisions.map((decision) => decision.effective ? 100 : 0));
  const evidenceScores = sampled.map(({ phase }) => {
    const logs = phase.decisions.filter((decision) => decision.kind === "collect_logs");
    const evidencePreservation = phase.ledger?.evidencePreservation;
    if (logs.length === 0) return 25;
    if (Number.isFinite(evidencePreservation)) return evidencePreservation;
    return average(logs.map((decision) => decision.effective ? 100 : 25));
  });
  const continuityScores = sampled
    .map(({ phase }) => phase.ledger?.serviceContinuity)
    .filter(Number.isFinite);
  const crisisSessions = sampled.filter(({ session }) => session.crisisMode);
  const pressureScores = crisisSessions.map(({ phase }) => {
    const effectiveness = average(phase.decisions.map((decision) => decision.effective ? 100 : 0)) || 0;
    const continuity = Number.isFinite(phase.ledger?.serviceContinuity) ? phase.ledger.serviceContinuity : 0;
    const responseMs = average(phase.decisions.map((decision) => decision.elapsedMs).filter(Number.isFinite));
    const speed = responseMs == null ? 0 : clamp(100 - (responseMs / 1200));
    const outcomePenalty = phase.world?.outcome === "breach" ? 30 : phase.world?.outcome === "timeout" ? 20 : 0;
    return clamp((effectiveness * 0.5) + (continuity * 0.3) + (speed * 0.2) - outcomePenalty);
  });

  const meanResponseTime = average(responseTimes);
  const scores = {
    responseSpeed: meanResponseTime == null ? null : clamp(100 - (meanResponseTime / 1200)),
    evidenceAnalysis: clamp(average(evidenceScores) || 0),
    decisionEffectiveness: clamp(effectiveRate || 0),
    serviceContinuity: continuityScores.length ? clamp(average(continuityScores)) : null,
    pressureJudgment: pressureScores.length ? clamp(average(pressureScores)) : null,
  };
  const axes = Object.entries(scores).map(([axis, value]) => ({
    axis,
    value,
    available: value != null,
    label: LABELS[axis],
    ...(axis === "responseSpeed" && meanResponseTime != null
      ? { averageResponseMs: Math.round(meanResponseTime) }
      : {}),
    ...(axis === "evidenceAnalysis"
      ? { evidenceCollectionDecisions: collectionDecisions.length }
      : {}),
    ...(axis === "pressureJudgment"
      ? { crisisSessionCount: crisisSessions.length }
      : {}),
  }));
  const availableAxes = axes.filter((axis) => axis.available);

  return {
    insufficientData: false,
    sampleSize: sampled.length,
    decisionCount: decisions.length,
    source: "simulated-training-sessions",
    notice: {
      en: "Behavioral indicators from simulated training only; they are not a live-SOC measurement or a professional certification.",
      ar: "مؤشرات سلوكية من التدريب الافتراضي فقط؛ ليست قياسًا لمركز عمليات حقيقي ولا شهادة مهنية.",
    },
    axes,
    strengths: availableAxes.filter((axis) => axis.value >= 70).map((axis) => axis.axis),
    developmentAreas: availableAxes.filter((axis) => axis.value < 50).map((axis) => axis.axis),
  };
}

module.exports = { computeFingerprint };
