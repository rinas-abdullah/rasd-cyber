// Decision Consequence Engine (brief §6) — the deterministic, auditable core
// that turns a learner decision into: a world-state change, a recorded event,
// measurable effects across 7 dimensions, an explanation, and any new evidence.
//
// This is NOT the LLM. Given the same initial world + the same decision, it
// always produces the same result (tested). The AI may later *explain* a
// consequence, but never computes it.

const { advanceAdversary, record, deepClone } = require("./incidentWorld");

// The 7 consequence dimensions (brief §6) with their starting baselines.
function freshLedger() {
  return {
    incidentContainment: 0, // 0 until the adversary is neutralised
    serviceContinuity: 100, // full; drops when critical systems are taken down needlessly
    evidencePreservation: 50, // mid; rises with log collection, falls if assets wiped
    decisionTiming: 70, // decent; falls with dithering and late action
    riskReduction: 0, // rises as real risk is removed
    escalationQuality: 0, // rises with timely, appropriate escalation
    recoveryReadiness: 0, // rises with escalation + business notification
    _effectiveActions: 0,
    _totalActions: 0,
    _dithering: 0,
  };
}

function clamp(n) {
  return Math.max(0, Math.min(100, n));
}

function applyDelta(ledger, deltas) {
  for (const [k, v] of Object.entries(deltas)) {
    if (k in ledger) ledger[k] = clamp(ledger[k] + v);
  }
}

// Bilingual explanation templates keyed by decision kind + effectiveness.
function explain(kind, effective, world) {
  const T = {
    collect_logs: {
      ar: "جُمعت سجلات إضافية فظهرت مؤشرات جديدة؛ قرار سليم يحافظ على الأدلة قبل التدخل.",
      en: "Additional logs were collected and new indicators surfaced; a sound evidence-first move.",
    },
    suspend_account: effective
      ? { ar: "عُلّق الحساب المشتبه به فتوقّف مسار إساءة الاستخدام الأساسي.", en: "The suspect account was suspended, cutting off the primary abuse path." }
      : { ar: "عُلّق حساب غير متورط؛ لم يغيّر ذلك مسار الخصم.", en: "A non-involved account was suspended; it did not change the adversary's path." },
    isolate: effective
      ? { ar: "عُزل الأصل المتأثر فمُنع التحرك الجانبي نحوه.", en: "The affected asset was isolated, blocking lateral movement toward it." }
      : { ar: "عُزل نظام حيوي دون داعٍ فتأثرت استمرارية الخدمة.", en: "A critical system was isolated unnecessarily, hurting service continuity." },
    reset_credentials: { ar: "أُعيد تعيين بيانات الاعتماد فأُبطلت الجلسات المخترقة.", en: "Credentials were reset, invalidating the compromised sessions." },
    block_network: effective
      ? { ar: "حُجب الاتصال المشبوه فقُطع مسار التسريب نحو خادم التحكم.", en: "Suspicious traffic was blocked, cutting the exfiltration path to the C2 host." }
      : { ar: "حُجب اتصال اعتيادي؛ لا أثر دفاعي حقيقي.", en: "An ordinary connection was blocked; no real defensive effect." },
    escalate: { ar: "صُعّد الحادث إلى المستوى المناسب في الوقت الملائم.", en: "The incident was escalated to the right level at the right time." },
    notify_business: { ar: "أُبلغ أصحاب العمل بالتأثير فتحسّنت جاهزية التعافي.", en: "Business stakeholders were notified, improving recovery readiness." },
    monitor: { ar: "استمرت المراقبة دون تدخل؛ تقدّم الخصم خطوة في هذه الأثناء.", en: "Monitoring continued without acting; the adversary advanced a step meanwhile." },
    ignore: { ar: "جُوهل التنبيه؛ قرار خطِر منح الخصم وقتًا إضافيًا.", en: "The alert was dismissed — a dangerous choice that bought the adversary time." },
  };
  return T[kind] || { ar: "تم تنفيذ القرار.", en: "The decision was applied." };
}

/**
 * Apply one learner decision. Pure w.r.t. inputs: clones the world and ledger,
 * returns new copies plus a consequence record. Then advances the adversary one
 * tick (time passes with every action), keeping cause→effect deterministic.
 *
 * @param {object} worldIn   current world
 * @param {object} scenario  the validated scenario
 * @param {string} optionId  the chosen decision option id
 * @param {object} ledgerIn  current consequence ledger
 * @param {object} [opts]    { elapsedMs }
 */
function applyDecision(worldIn, scenario, optionId, ledgerIn, opts = {}) {
  const world = deepClone(worldIn);
  const ledger = deepClone(ledgerIn || freshLedger());

  const option = scenario.decisions.find((d) => d.id === optionId);
  if (!option) {
    const err = new Error(`Invalid decision option: ${optionId}`);
    err.code = "INVALID_DECISION";
    throw err;
  }

  world.step += 1;
  world.defenderActions.push(optionId);
  ledger._totalActions += 1;

  const adv = world.adversary;
  const target = world.accounts[adv.targetAccountId];
  const crit = world.assets[adv.targetAssetId];
  let effective = false;
  const newEvidence = [];

  switch (option.kind) {
    case "collect_logs": {
      // Reveal every evidence item gated behind this decision kind.
      for (const e of scenario.evidence) {
        if (e.revealedBy === optionId && !world.revealedEvidence.includes(e.id)) {
          world.revealedEvidence.push(e.id);
          newEvidence.push(e.id);
        }
      }
      effective = newEvidence.some((id) => (scenario.evidence.find((e) => e.id === id) || {}).relevant);
      applyDelta(ledger, { evidencePreservation: +18, riskReduction: +4, decisionTiming: +2 });
      break;
    }
    case "suspend_account": {
      if (target && !target.suspended) {
        target.suspended = true;
        effective = true;
        // Suspending the abused privileged account is THE primary containment
        // action for this skill, so it carries the largest single contribution.
        applyDelta(ledger, { incidentContainment: +50, riskReduction: +24 });
      } else {
        applyDelta(ledger, { riskReduction: -2 });
      }
      break;
    }
    case "reset_credentials": {
      if (target && !target.credentialsReset) {
        target.credentialsReset = true;
        effective = true;
        applyDelta(ledger, { incidentContainment: +20, riskReduction: +14 });
      }
      break;
    }
    case "isolate": {
      if (crit && !crit.isolated) {
        crit.isolated = true;
        // Isolation is effective only once the adversary is at/after lateral
        // movement toward that asset; otherwise it is premature downtime.
        const near = ["lateral_movement", "collection", "exfiltration"].includes(adv.stage);
        effective = near;
        if (near) {
          applyDelta(ledger, { incidentContainment: +18, riskReduction: +10 });
        } else {
          world.businessImpact.unnecessaryDowntime += 1;
          applyDelta(ledger, { serviceContinuity: -22, riskReduction: +2 });
        }
      }
      break;
    }
    case "block_network": {
      if (!world.network.suspiciousBlocked) {
        world.network.suspiciousBlocked = true;
        // Effective when exfil path matters (adversary at collection/exfil).
        const near = ["collection", "exfiltration"].includes(adv.stage);
        effective = near || adv.stage === "lateral_movement";
        applyDelta(ledger, { incidentContainment: near ? +22 : +8, riskReduction: near ? +16 : +6 });
      }
      break;
    }
    case "escalate": {
      if (!world.escalated) {
        world.escalated = true;
        effective = true;
        // Quality is higher the earlier the escalation.
        const quality = world.step <= 3 ? 40 : world.step <= 5 ? 25 : 12;
        applyDelta(ledger, { escalationQuality: quality, recoveryReadiness: +18 });
      }
      break;
    }
    case "notify_business": {
      if (!world.businessNotified) {
        world.businessNotified = true;
        effective = true;
        applyDelta(ledger, { recoveryReadiness: +16, serviceContinuity: +4 });
      }
      break;
    }
    case "monitor": {
      ledger._dithering += 1;
      applyDelta(ledger, { decisionTiming: -10 });
      break;
    }
    case "ignore": {
      ledger._dithering += 1;
      applyDelta(ledger, { decisionTiming: -18, riskReduction: -10 });
      break;
    }
    default:
      break;
  }

  if (effective) ledger._effectiveActions += 1;

  record(world, "decision", optionId, option.kind);
  const explanation = explain(option.kind, effective, world);

  // Time passes: the adversary takes its tick after the defender acts.
  const outcomeBefore = world.outcome;
  const advEvent = advanceAdversary(world);

  // Late action penalty: if the adversary just reached collection/exfiltration,
  // timing suffers.
  if (advEvent && (advEvent.stage === "collection" || advEvent.kind === "exfiltration")) {
    applyDelta(ledger, { decisionTiming: -8 });
  }

  // When the incident becomes fully contained this step, the containment
  // dimension reflects that the adversary was actually stopped (floor of 80).
  if (world.outcome === "contained" && outcomeBefore !== "contained") {
    if (ledger.incidentContainment < 80) ledger.incidentContainment = 80;
  }

  const consequence = {
    step: world.step,
    optionId,
    kind: option.kind,
    effective,
    newEvidence,
    adversaryEvent: advEvent,
    outcome: world.outcome,
    deltas: null, // filled by caller if needed; ledger carries cumulative state
    explanation,
  };

  return { world, ledger, consequence };
}

module.exports = { freshLedger, applyDecision, clamp };
