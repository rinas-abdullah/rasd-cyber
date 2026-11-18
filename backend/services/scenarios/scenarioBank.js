// Scenario Bank — authored, approved templates the Scenario Director draws from.
//
// Design rules (brief §4 Agent 01, §5, §13.2):
//  - Every template declares the canonical `skill` it measures.
//  - Templates are split into `training` and `verification` pools. For a given
//    skill the verification pool uses a DIFFERENT sector/context than training,
//    so a verification scenario measures skill TRANSFER, not recall of the exact
//    training case (no answer leakage).
//  - A template is a deterministic seed, not free LLM text: the Scenario Director
//    may only vary surface details the bank allows; world logic stays fixed so
//    the simulation and scoring remain auditable.
//
// Canonical decision kinds and the rubric "ideal order" live with each template.

const { Scenario } = require("../orchestrator/schemas");

// Shared decision catalogue for incident-response scenarios. Each scenario
// exposes a subset by kind; labels are bilingual.
const DECISION_LIBRARY = {
  collect_logs: { ar: "جمع سجلات إضافية", en: "Collect additional logs" },
  suspend_account: { ar: "تعليق الحساب المشتبه به", en: "Suspend the suspect account" },
  isolate: { ar: "عزل الأصل المتأثر", en: "Isolate the affected asset" },
  reset_credentials: { ar: "إعادة تعيين بيانات الاعتماد", en: "Reset credentials" },
  escalate: { ar: "تصعيد الحادث", en: "Escalate the incident" },
  block_network: { ar: "حجب الاتصال الشبكي المشبوه", en: "Block suspicious network traffic" },
  notify_business: { ar: "إبلاغ أصحاب العمل بالتأثير", en: "Notify business stakeholders" },
  monitor: { ar: "مراقبة النشاط دون تدخل", en: "Monitor activity without acting" },
  ignore: { ar: "تجاهل التنبيه مؤقتًا", en: "Dismiss the alert for now" },
};

function decisions(kinds, targetAsset = null) {
  return kinds.map((kind) => ({
    id: `d_${kind}`,
    label: DECISION_LIBRARY[kind],
    kind,
    targetAsset,
  }));
}

// ---- Template definitions ----
// Skill measured across all of these: "privileged-account-compromise".
const TEMPLATES = {
  // TRAINING context: education sector
  "priv-acct-edu": {
    templateId: "priv-acct-edu",
    pool: "training",
    skill: "privileged-account-compromise",
    sector: "education",
    difficulty: 4,
    objective: {
      ar: "احتواء نشاط غير طبيعي لحساب إداري في جامعة افتراضية مع الحفاظ على الأدلة واستمرارية الخدمة.",
      en: "Contain abnormal activity on an admin account at a virtual university while preserving evidence and service continuity.",
    },
    org: { name: "جامعة الريادة (محاكاة)", sector: "education" },
    assets: [
      { id: "srv-sis", name: "خادم نظام معلومات الطلاب", critical: true },
      { id: "srv-mail", name: "خادم البريد", critical: false },
      { id: "wks-admin", name: "محطة عمل المسؤول", critical: false },
    ],
    accounts: [
      { id: "acc-admin", name: "sis-admin", privileged: true },
      { id: "acc-helpdesk", name: "helpdesk01", privileged: false },
    ],
    controls: [
      { id: "ctl-mfa", name: "المصادقة متعددة العوامل", enabled: false },
      { id: "ctl-edr", name: "كشف نقاط النهاية (EDR)", enabled: true },
    ],
    evidence: [
      { id: "ev-login-geo", source: "idp", relevant: true, revealedBy: null, label: { ar: "تسجيل دخول للمسؤول من موقع جغرافي غير معتاد", en: "Admin login from an unusual geo-location" } },
      { id: "ev-offhours", source: "idp", relevant: true, revealedBy: null, label: { ar: "نشاط خارج ساعات العمل", en: "Off-hours activity" } },
      { id: "ev-lateral", source: "edr", relevant: true, revealedBy: "d_collect_logs", label: { ar: "محاولة وصول من محطة المسؤول إلى خادم SIS", en: "Lateral access attempt from admin workstation to SIS server" } },
      { id: "ev-newrule", source: "mail", relevant: true, revealedBy: "d_collect_logs", label: { ar: "قاعدة إعادة توجيه بريد جديدة", en: "New mail forwarding rule created" } },
      { id: "ev-patch", source: "siem", relevant: false, revealedBy: null, label: { ar: "تنبيه ترقيع روتيني غير ذي صلة", en: "Routine patching alert (unrelated)" } },
      { id: "ev-printer", source: "network", relevant: false, revealedBy: "d_collect_logs", label: { ar: "ضجيج شبكة من طابعة", en: "Network noise from a printer" } },
    ],
    decisionKinds: ["collect_logs", "suspend_account", "isolate", "reset_credentials", "escalate", "notify_business", "monitor", "ignore"],
    idealOrder: ["collect_logs", "suspend_account", "escalate", "notify_business"],
    entryPointEvidence: "ev-login-geo",
    successConditions: ["account suspended before data exfiltration", "evidence preserved", "incident escalated"],
    failConditions: ["alert ignored", "asset wiped before collection", "no containment within step budget"],
  },

  // VERIFICATION context: healthcare sector (same skill, different world)
  "priv-acct-health": {
    templateId: "priv-acct-health",
    pool: "verification",
    skill: "privileged-account-compromise",
    sector: "healthcare",
    difficulty: 5,
    objective: {
      ar: "احتواء إساءة استخدام حساب ذي صلاحيات في مستشفى افتراضي مع أولوية استمرارية الأنظمة الحيوية.",
      en: "Contain privileged-account misuse at a virtual hospital, prioritising continuity of life-critical systems.",
    },
    org: { name: "مستشفى الشفاء (محاكاة)", sector: "healthcare" },
    assets: [
      { id: "srv-ehr", name: "خادم السجلات الصحية (EHR)", critical: true },
      { id: "srv-pacs", name: "خادم صور الأشعة (PACS)", critical: true },
      { id: "wks-nurse", name: "محطة التمريض", critical: false },
    ],
    accounts: [
      { id: "acc-dbadmin", name: "ehr-dbadmin", privileged: true },
      { id: "acc-nurse", name: "nurse-station-7", privileged: false },
    ],
    controls: [
      { id: "ctl-mfa", name: "المصادقة متعددة العوامل", enabled: false },
      { id: "ctl-dlp", name: "منع تسريب البيانات (DLP)", enabled: true },
    ],
    evidence: [
      { id: "ev-login-geo", source: "idp", relevant: true, revealedBy: null, label: { ar: "تسجيل دخول لحساب قاعدة بيانات EHR من شبكة خارجية", en: "EHR DB account login from an external network" } },
      { id: "ev-bulkquery", source: "siem", relevant: true, revealedBy: null, label: { ar: "استعلام ضخم غير معتاد على سجلات المرضى", en: "Unusual bulk query against patient records" } },
      { id: "ev-dlp", source: "dlp", relevant: true, revealedBy: "d_collect_logs", label: { ar: "محاولة نقل بيانات حظرها نظام DLP", en: "DLP blocked an outbound data transfer" } },
      { id: "ev-pacs-scan", source: "network", relevant: true, revealedBy: "d_collect_logs", label: { ar: "مسح للمنافذ تجاه خادم PACS", en: "Port scan toward the PACS server" } },
      { id: "ev-maint", source: "siem", relevant: false, revealedBy: null, label: { ar: "نافذة صيانة مجدولة غير ذات صلة", en: "Scheduled maintenance window (unrelated)" } },
      { id: "ev-backup", source: "siem", relevant: false, revealedBy: "d_collect_logs", label: { ar: "مهمة نسخ احتياطي روتينية", en: "Routine backup job" } },
    ],
    decisionKinds: ["collect_logs", "suspend_account", "isolate", "reset_credentials", "escalate", "block_network", "notify_business", "monitor", "ignore"],
    idealOrder: ["collect_logs", "suspend_account", "escalate", "notify_business"],
    entryPointEvidence: "ev-login-geo",
    successConditions: ["account suspended", "critical systems kept available", "evidence preserved", "incident escalated"],
    failConditions: ["critical system taken down unnecessarily", "alert ignored", "no containment within step budget"],
  },

  "hospital-crisis": {
    templateId: "hospital-crisis",
    pool: "training",
    skill: "hospital-crisis-response",
    crisisOnly: true,
    sector: "healthcare",
    difficulty: 6,
    objective: {
      ar: "أدر أزمة سيبرانية في مستشفى افتراضي، واحتوِ الحساب المشبوه مع الحفاظ على استمرارية الأنظمة الصحية الحيوية.",
      en: "Manage a simulated cyber crisis at a virtual hospital: contain the suspect account while preserving critical care systems.",
    },
    org: { name: "مستشفى الشفاء (محاكاة)", sector: "healthcare" },
    assets: [
      { id: "srv-ehr", name: "خادم السجلات الصحية (EHR)", critical: true },
      { id: "srv-pacs", name: "خادم صور الأشعة (PACS)", critical: true },
      { id: "srv-pharmacy", name: "نظام صرف الدواء", critical: true },
    ],
    accounts: [
      { id: "acc-ehradmin", name: "ehr-operations-admin", privileged: true },
      { id: "acc-clinician", name: "clinician-12", privileged: false },
    ],
    controls: [
      { id: "ctl-mfa", name: "المصادقة متعددة العوامل", enabled: false },
      { id: "ctl-dlp", name: "منع تسريب البيانات (DLP)", enabled: true },
      { id: "ctl-backup", name: "نسخ احتياطية معزولة", enabled: true },
    ],
    evidence: [
      { id: "ev-hospital-login", source: "idp", relevant: true, revealedBy: null, label: { ar: "محاولة دخول خارجية لحساب تشغيل المستشفى", en: "External sign-in attempt on a hospital operations account" } },
      { id: "ev-ehr-query", source: "siem", relevant: true, revealedBy: null, label: { ar: "استعلام غير معتاد على سجلات صحية افتراضية", en: "Unusual query against simulated health records" } },
      { id: "ev-pharmacy", source: "edr", relevant: true, revealedBy: "d_collect_logs", label: { ar: "تنبيه جديد من محطة نظام صرف الدواء", en: "New alert from the simulated medication system workstation" } },
      { id: "ev-export", source: "dlp", relevant: true, revealedBy: "d_collect_logs", label: { ar: "محاولة تصدير بيانات أوقفها نظام DLP", en: "Simulated data export attempt blocked by DLP" } },
      { id: "ev-maintenance", source: "siem", relevant: false, revealedBy: null, label: { ar: "تنبيه صيانة مجدولة غير ذي صلة", en: "Unrelated scheduled maintenance alert" } },
    ],
    decisionKinds: ["collect_logs", "suspend_account", "isolate", "reset_credentials", "block_network", "escalate", "notify_business", "monitor", "ignore"],
    idealOrder: ["collect_logs", "suspend_account", "block_network", "escalate", "notify_business"],
    entryPointEvidence: "ev-hospital-login",
    successConditions: ["suspect account contained", "simulated data exposure prevented", "critical care systems remain available", "incident escalated"],
    failConditions: ["simulated data exposure", "critical care system isolated unnecessarily", "no containment before the deadline"],
  },

  // VERIFICATION context: finance sector (same skill, third world)
  "priv-acct-finance": {
    templateId: "priv-acct-finance",
    pool: "verification",
    skill: "privileged-account-compromise",
    sector: "finance",
    difficulty: 6,
    objective: {
      ar: "احتواء حساب مسؤول مخترق في مصرف افتراضي مع حماية أنظمة المدفوعات والأدلة.",
      en: "Contain a compromised admin account at a virtual bank while protecting payment systems and evidence.",
    },
    org: { name: "بنك الثقة (محاكاة)", sector: "finance" },
    assets: [
      { id: "srv-core", name: "النظام البنكي الأساسي", critical: true },
      { id: "srv-pay", name: "بوابة المدفوعات", critical: true },
      { id: "wks-ops", name: "محطة العمليات", critical: false },
    ],
    accounts: [
      { id: "acc-sysadmin", name: "core-sysadmin", privileged: true },
      { id: "acc-teller", name: "teller-04", privileged: false },
    ],
    controls: [
      { id: "ctl-mfa", name: "المصادقة متعددة العوامل", enabled: true },
      { id: "ctl-siem", name: "مراقبة SIEM", enabled: true },
    ],
    evidence: [
      { id: "ev-mfa-fatigue", source: "idp", relevant: true, revealedBy: null, label: { ar: "موجة طلبات MFA متكررة (إرهاق المصادقة)", en: "Repeated MFA push requests (MFA fatigue)" } },
      { id: "ev-newadmin", source: "idp", relevant: true, revealedBy: null, label: { ar: "إنشاء حساب مسؤول جديد", en: "A new admin account was created" } },
      { id: "ev-paygw", source: "siem", relevant: true, revealedBy: "d_collect_logs", label: { ar: "محاولة وصول إلى بوابة المدفوعات", en: "Access attempt against the payment gateway" } },
      { id: "ev-exfil", source: "network", relevant: true, revealedBy: "d_collect_logs", label: { ar: "اتصال صادر إلى خادم تحكم خارجي", en: "Outbound connection to an external C2 host" } },
      { id: "ev-report", source: "siem", relevant: false, revealedBy: null, label: { ar: "تقرير امتثال مجدول غير ذي صلة", en: "Scheduled compliance report (unrelated)" } },
      { id: "ev-vpn", source: "network", relevant: false, revealedBy: "d_collect_logs", label: { ar: "اتصال VPN اعتيادي لموظف", en: "Ordinary staff VPN connection" } },
    ],
    decisionKinds: ["collect_logs", "suspend_account", "isolate", "reset_credentials", "escalate", "block_network", "notify_business", "monitor", "ignore"],
    idealOrder: ["collect_logs", "suspend_account", "block_network", "escalate"],
    entryPointEvidence: "ev-mfa-fatigue",
    successConditions: ["account suspended", "C2 traffic blocked", "payment systems protected", "incident escalated"],
    failConditions: ["payment gateway taken down unnecessarily", "alert ignored", "no containment within step budget"],
  },
};

function listTemplates() {
  return Object.values(TEMPLATES).filter((t) => !t.crisisOnly).map((t) => ({
    templateId: t.templateId,
    pool: t.pool,
    skill: t.skill,
    sector: t.sector,
    difficulty: t.difficulty,
  }));
}

function getTemplate(templateId) {
  return TEMPLATES[templateId] || null;
}

/**
 * Instantiate a validated Scenario object from a template.
 * Deterministic: same (templateId, scenarioId) ⇒ identical scenario.
 */
function instantiate(templateId, scenarioId) {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`Unknown scenario template: ${templateId}`);

  const scenario = {
    scenarioId: String(scenarioId),
    templateId: t.templateId,
    pool: t.pool,
    skill: t.skill,
    sector: t.sector,
    objective: t.objective,
    difficulty: t.difficulty,
    world: {
      organization: t.org,
      assets: t.assets.map((a) => ({ ...a })),
      accounts: t.accounts.map((a) => ({ ...a })),
      controls: t.controls.map((c) => ({ ...c })),
    },
    evidence: t.evidence.map((e) => ({ ...e, revealedBy: e.revealedBy ?? null })),
    decisions: decisions(t.decisionKinds),
    idealOrder: t.idealOrder.slice(),
    successConditions: t.successConditions.slice(),
    failConditions: t.failConditions.slice(),
  };

  // Validate against the schema — guarantees every bank entry is well-formed.
  return Scenario.parse(scenario);
}

/**
 * Select a template for a skill from a pool, optionally excluding sectors
 * already seen (so verification differs from training).
 */
function selectForSkill(skill, pool, rng = Math.random, excludeSectors = []) {
  const candidates = Object.values(TEMPLATES).filter(
    (t) => t.skill === skill && t.pool === pool && !excludeSectors.includes(t.sector)
  );
  if (candidates.length === 0) return null;
  const idx = Math.floor(rng() * candidates.length) % candidates.length;
  return candidates[idx];
}

module.exports = {
  DECISION_LIBRARY,
  TEMPLATES,
  listTemplates,
  getTemplate,
  instantiate,
  selectForSkill,
  entryPointOf: (templateId) => (getTemplate(templateId) || {}).entryPointEvidence || null,
};
