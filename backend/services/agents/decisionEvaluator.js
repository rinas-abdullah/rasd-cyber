// Agent 03 — Decision Evaluator (brief §4). Scores a completed simulation from
// an AUDITABLE rubric over recorded facts (the ledger + world + ideal order),
// never from an LLM opinion. The AI may later explain or propose a review of a
// score, but the number here is reproducible and testable.

const { Evaluation } = require("../orchestrator/schemas");

const WEIGHTS = Object.freeze({
  incidentContainment: 25,
  decisionTiming: 15,
  evidencePreservation: 15,
  riskReduction: 10,
  escalationQuality: 10,
  serviceContinuity: 10,
  recoveryReadiness: 5,
  orderCorrectness: 10,
});

// Longest-common-subsequence ratio of the learner's effective decision-kind
// order against the scenario's ideal order → 0..1.
function orderScore(effectiveKinds, idealOrder) {
  if (!idealOrder.length) return 1;
  const a = effectiveKinds.filter((k) => idealOrder.includes(k));
  const b = idealOrder;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n] / n;
}

/**
 * @param {object} args
 * @param {object} args.scenario
 * @param {object} args.world      final world
 * @param {object} args.ledger     final consequence ledger
 * @param {Array}  args.decisions  ordered [{optionId, kind, effective}]
 */
function evaluate({ scenario, world, ledger, decisions }) {
  const insufficientData = !ledger || ledger._totalActions === 0;
  if (insufficientData) {
    return Evaluation.parse({
      total: 0,
      insufficientData: true,
      dimensions: {},
      rationale: ["لا توجد قرارات مسجّلة لتقييمها / No recorded decisions to score."],
      rationaleEn: ["No recorded decisions to score."],
      passed: false,
    });
  }

  const effectiveKinds = decisions.filter((d) => d.effective).map((d) => d.kind);
  const order = orderScore(effectiveKinds, scenario.idealOrder);

  const dims = {
    incidentContainment: Math.round(ledger.incidentContainment),
    decisionTiming: Math.round(ledger.decisionTiming),
    evidencePreservation: Math.round(ledger.evidencePreservation),
    riskReduction: Math.round(ledger.riskReduction),
    escalationQuality: Math.round(ledger.escalationQuality),
    serviceContinuity: Math.round(ledger.serviceContinuity),
    recoveryReadiness: Math.round(ledger.recoveryReadiness),
    orderCorrectness: Math.round(order * 100),
  };

  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    total += ((dims[k] || 0) / 100) * w;
  }
  total = Math.round(total);

  // A breach caps the score regardless of partial credit.
  if (world.outcome === "breach") total = Math.min(total, 45);

  const defenseAccuracy = ledger._totalActions ? ledger._effectiveActions / ledger._totalActions : 0;
  const passed = total >= 60 && world.outcome !== "breach";

  const rationale = [
    `الاحتواء ${dims.incidentContainment}/100، التوقيت ${dims.decisionTiming}/100، حفظ الأدلة ${dims.evidencePreservation}/100.`,
    `دقة الدفاع: ${ledger._effectiveActions}/${ledger._totalActions} قرارًا فعّالًا (${Math.round(defenseAccuracy * 100)}%).`,
    `ترتيب الاستجابة مقابل المسار المثالي: ${dims.orderCorrectness}/100.`,
    world.outcome === "breach"
      ? "وقع تسريب بيانات داخل المحاكاة؛ حُدّت الدرجة القصوى."
      : world.outcome === "contained"
        ? "احتُوي الخصم داخل المحاكاة."
        : "انتهت الجلسة دون احتواء كامل.",
  ];
  const rationaleEn = [
    `Containment ${dims.incidentContainment}/100, timing ${dims.decisionTiming}/100, and evidence preservation ${dims.evidencePreservation}/100.`,
    `Defense accuracy: ${ledger._effectiveActions}/${ledger._totalActions} effective decisions (${Math.round(defenseAccuracy * 100)}%).`,
    `Response order against the ideal sequence: ${dims.orderCorrectness}/100.`,
    world.outcome === "breach"
      ? "A simulated data breach occurred; the maximum score was capped."
      : world.outcome === "contained"
        ? "The simulated adversary was contained."
        : "The session ended without full containment.",
  ];

  return Evaluation.parse({
    total,
    insufficientData: false,
    dimensions: dims,
    rationale,
    rationaleEn,
    passed,
  });
}

module.exports = { evaluate, WEIGHTS, orderScore };
