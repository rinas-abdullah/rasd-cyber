// Agent 05 — Skill Verification (brief §4, §5). After training on a skill, builds
// an INDEPENDENT scenario that measures the SAME skill in a DIFFERENT context
// (different sector/world), drawn from the verification pool and excluding the
// sector the learner trained on. This measures transfer, not recall, and
// prevents answer leakage from training into assessment.

const director = require("./scenarioDirector");
const bank = require("../scenarios/scenarioBank");

/**
 * @param {object} args
 * @param {string} args.skill
 * @param {string} args.seed              deterministic (e.g. sessionId)
 * @param {string} [args.trainedSector]   sector used during training (excluded)
 * @param {string} [args.trainedTemplateId]
 */
function buildVerification({ skill, seed, trainedSector, trainedTemplateId }) {
  const excludeSectors = trainedSector ? [trainedSector] : [];
  const { scenario, entryPointEvidence } = director.design({
    skill,
    pool: "verification",
    seed: `verify:${seed}`,
    excludeSectors,
  });

  // Guard against accidental leakage: the verification template must differ from
  // the trained template.
  if (trainedTemplateId && scenario.templateId === trainedTemplateId) {
    const err = new Error("Verification scenario must differ from the trained scenario");
    err.code = "LEAKAGE";
    throw err;
  }

  return {
    scenario,
    entryPointEvidence,
    note: {
      ar: "اختبار تحقق مستقل في سياق مختلف لقياس نقل المهارة دون مساعدة.",
      en: "Independent verification in a different context to measure skill transfer, unaided.",
    },
  };
}

module.exports = { buildVerification, listVerificationTemplates: () => bank.listTemplates().filter((t) => t.pool === "verification") };
