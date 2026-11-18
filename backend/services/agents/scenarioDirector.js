// Agent 01 — Scenario Director (brief §4). Chooses a scenario for the session's
// learning objective and instantiates a structured, validated Scenario object
// from the approved bank. It does NOT free-write a story: it selects a template
// and a deterministic scenarioId, so the world is always well-formed and the
// simulation stays auditable. The AI may only vary surface details the bank
// already permits (not implemented as free text here, by design).

const bank = require("../scenarios/scenarioBank");
const { makeRng } = require("../orchestrator/rng");

/**
 * Design a scenario for a skill in a given pool.
 * @param {object} args
 * @param {string} args.skill
 * @param {"training"|"verification"} args.pool
 * @param {string} args.seed            deterministic seed (e.g. sessionId)
 * @param {string[]} [args.excludeSectors]
 */
function design({ skill, pool, seed, excludeSectors = [] }) {
  const rng = makeRng(`${seed}:${pool}`);
  const template = bank.selectForSkill(skill, pool, rng, excludeSectors);
  if (!template) {
    const err = new Error(`No ${pool} scenario available for skill "${skill}"`);
    err.code = "NO_SCENARIO";
    throw err;
  }
  const scenarioId = `${template.templateId}-${seed}`.slice(0, 60);
  const scenario = bank.instantiate(template.templateId, scenarioId);
  return { scenario, entryPointEvidence: bank.entryPointOf(template.templateId) };
}

module.exports = { design, listTemplates: bank.listTemplates };
