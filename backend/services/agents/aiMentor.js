// Agent 04 — AI Mentor (brief §4). Adaptive guidance that scales with the
// learner's level and mistakes. Two strict modes:
//   TRAINING      → hints allowed, escalating from a nudge to a near-direct cue.
//   VERIFICATION  → hints that could change the outcome are BLOCKED; the mentor
//                   only confirms that assessment is unaided (no leakage, brief §4).
//
// Phrasing can be produced by the AI provider, but a deterministic fallback
// always exists, and the mentor NEVER reveals the exact correct decision in
// verification mode (and only at the highest level in training).

const provider = require("../ai/orchestratorProvider");
const { MentorReply } = require("../orchestrator/schemas");

// Deterministic hint derivation from world state (what to steer toward).
function deriveHint(world, scenario, level) {
  const relevantUnseen = scenario.evidence.filter(
    (e) => e.relevant && !world.revealedEvidence.includes(e.id)
  );
  const priv = Object.values(world.accounts).find((a) => a.privileged);
  const accountOpen = priv && !priv.suspended && !priv.credentialsReset;

  if (level <= 1) {
    return {
      ar: "ابدأ بتكوين صورة كاملة: ما الأدلة المتاحة، وما الذي ينقصك قبل اتخاذ قرار؟",
      en: "Start by building the full picture: what evidence do you have, and what is missing before you act?",
    };
  }
  if (level === 2) {
    if (relevantUnseen.length) {
      return {
        ar: "هناك مؤشرات لم تُجمع بعد؛ فكّر في توسيع مصادر السجلات قبل الحكم.",
        en: "There are indicators you haven't gathered yet; consider widening your log sources before judging.",
      };
    }
    if (accountOpen) {
      return {
        ar: "راجع حالة الحساب ذي الصلاحيات المرتفعة — هل ما يزال نشطًا؟",
        en: "Review the state of the privileged account — is it still active?",
      };
    }
  }
  // level 3 (training only): near-direct cue, still not a full solution.
  if (accountOpen) {
    return {
      ar: "النشاط المشبوه يتركّز حول حساب ذي صلاحيات؛ احتواؤه (تعليقه) أولوية قبل أن يتقدّم الخصم.",
      en: "The suspicious activity centres on a privileged account; containing it (suspending it) is the priority before the adversary advances.",
    };
  }
  return {
    ar: "راجع ترتيب خطواتك: جمع الأدلة، ثم الاحتواء، ثم التصعيد.",
    en: "Review your sequence: collect evidence, then contain, then escalate.",
  };
}

/**
 * @param {object} args
 * @param {"TRAINING"|"VERIFICATION"} args.mode
 * @param {object} args.world
 * @param {object} args.scenario
 * @param {number} [args.level]  requested hint level 0..3
 * @param {string} [args.lang]
 */
async function mentor({ mode, world, scenario, level = 1 }) {
  if (mode === "VERIFICATION") {
    return MentorReply.parse({
      mode,
      allowed: false,
      level: 0,
      message: {
        ar: "التلميحات معطّلة في وضع التحقق المستقل لضمان نزاهة التقييم. اعتمد على تحليلك.",
        en: "Hints are disabled during independent verification to keep the assessment fair. Rely on your own analysis.",
      },
      aiMode: provider.currentMode(),
    });
  }

  const lvl = Math.max(0, Math.min(3, Math.round(level)));
  const base = deriveHint(world, scenario, lvl);

  // Optionally let the provider rephrase; deterministic fallback = base text.
  const res = await provider.complete({
    system:
      "You are a cybersecurity training mentor. Give a short, supportive hint in the learner's language. " +
      "Never reveal the exact correct action unless explicitly asked at the highest hint level. Keep it to 2 sentences.",
    task: `Hint level: ${lvl}. Rephrase this hint naturally without adding new facts.`,
    untrusted: `${base.en}\n${base.ar}`,
    fallback: () => "", // empty → we keep the deterministic bilingual `base`
  });

  // If the provider returned live text, attach it as an English rephrase; the
  // bilingual deterministic text remains the guaranteed content.
  const message = res.text && res.aiMode === "live" ? { ar: base.ar, en: res.text } : base;

  return MentorReply.parse({
    mode,
    allowed: true,
    level: lvl,
    message,
    aiMode: res.aiMode,
  });
}

module.exports = { mentor, deriveHint };
