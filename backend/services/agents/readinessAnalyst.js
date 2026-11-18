// Agent 06 — Readiness Analyst (brief §4, §9). Builds a continuous readiness
// profile strictly from RECORDED evidence (completed sessions), never invented
// numbers. If there is no independent verification evidence yet, it reports
// INSUFFICIENT_EVIDENCE rather than guessing, and always separates:
//   trainingPerformance | verifiedSkills | unverifiedSkills | readiness evidence.
// It never claims simulated readiness guarantees real-incident performance.

const { Readiness } = require("../orchestrator/schemas");

const DISCLAIMER = {
  ar: "تقيس هذه الجاهزية الأداء داخل محاكاة تدريبية، ولا تضمن الأداء في حوادث حقيقية.",
  en: "This readiness reflects performance inside a training simulation and does not guarantee real-incident performance.",
};

/**
 * @param {Array<object>} sessions  completed session summaries:
 *   { skill, mode: "TRAINING"|"VERIFICATION", total, passed, outcome, hintsUsed }
 */
function analyse(sessions = []) {
  const training = sessions.filter((s) => s.mode === "TRAINING");
  const verification = sessions.filter((s) => s.mode === "VERIFICATION");

  if (sessions.length === 0 || verification.length === 0) {
    // No independent evidence → do not fabricate a readiness number.
    const trainingPerformance = training.length
      ? Math.round(training.reduce((a, s) => a + (s.total || 0), 0) / training.length)
      : null;
    return Readiness.parse({
      status: "INSUFFICIENT_EVIDENCE",
      trainingPerformance,
      verifiedSkills: [],
      unverifiedSkills: [...new Set(training.map((s) => s.skill))],
      gaps: [],
      autonomy: null,
      evidenceCount: { training: training.length, verification: verification.length },
      disclaimer: DISCLAIMER,
    });
  }

  // Verified = skill passed at least one verification session.
  const verifiedSkills = [
    ...new Set(verification.filter((s) => s.passed).map((s) => s.skill)),
  ];
  const attemptedSkills = [...new Set(sessions.map((s) => s.skill))];
  const unverifiedSkills = attemptedSkills.filter((sk) => !verifiedSkills.includes(sk));

  // Gaps = skills with a failed verification or weak average.
  const gaps = [
    ...new Set(
      verification
        .filter((s) => !s.passed || (s.total || 0) < 60)
        .map((s) => s.skill)
        .filter((sk) => !verifiedSkills.includes(sk))
    ),
  ];

  // Autonomy from verification hint usage (verification blocks hints, so this is
  // typically high; kept general for future unaided-training signals). 0 hints
  // across verification ⇒ 100.
  const totalHints = verification.reduce((a, s) => a + (s.hintsUsed || 0), 0);
  const autonomy = Math.max(0, Math.round(100 - (totalHints / verification.length) * 20));

  const trainingPerformance = training.length
    ? Math.round(training.reduce((a, s) => a + (s.total || 0), 0) / training.length)
    : null;

  const status = verifiedSkills.length > 0 ? "READY_EVIDENCE" : "DEVELOPING";

  return Readiness.parse({
    status,
    trainingPerformance,
    verifiedSkills,
    unverifiedSkills,
    gaps,
    autonomy,
    evidenceCount: { training: training.length, verification: verification.length },
    disclaimer: DISCLAIMER,
  });
}

module.exports = { analyse, DISCLAIMER };
