/* RASD AI Command Center — drives the full AI-orchestrated loop against the real
 * backend (/api/ai/*). Every control performs a real request; there are no fake
 * buttons. The UI clearly separates SIMULATED content (scenario, adversary,
 * evidence) from MEASURED results (scores, readiness), shows the honest AI mode
 * (live vs dev-deterministic), and renders real loading / empty / error states.
 * Bilingual (AR/EN) with RTL/LTR switching. */
(function () {
  "use strict";

  var API = "/api";
  var state = {
    lang: localStorage.getItem("rasd_lang") || "ar",
    session: null,
    aiStatus: null,
    fingerprint: null,
    busy: false,
  };
  var crisisTimerId = null;
  var crisisClientDeadline = null;

  var T = {
    title: { ar: "مركز قيادة رَصد الذكي", en: "RASD AI Command Center" },
    subtitle: {
      ar: "الذكاء الاصطناعي يدير دورة التدريب: تقييم، تخطيط، محاكاة، تقييم أداء، تحقق من المهارة.",
      en: "AI operates the training loop: assess, plan, simulate, evaluate, verify.",
    },
    signIn: { ar: "تسجيل دخول تجريبي", en: "Demo sign-in" },
    signedInAs: { ar: "مُسجّل", en: "Signed in" },
    start: { ar: "ابدأ جلسة تدريب", en: "Start training session" },
    startCrisis: { ar: "ابدأ وضع الأزمة", en: "START CRISIS" },
    crisisTitle: { ar: "أزمة مستشفى افتراضية", en: "Virtual hospital crisis" },
    crisisNotice: { ar: "محاكاة تدريبية فقط — لا اتصال بمستشفى حقيقي أو أنظمة تشغيلية.", en: "TRAINING SIMULATION ONLY — no real hospital or operational systems are connected." },
    crisisTime: { ar: "الوقت المتبقي", en: "Time remaining" },
    crisisResponse: { ar: "زمن الاستجابة المسجل", en: "Recorded response time" },
    crisisEvents: { ar: "تطورات الأزمة", en: "Crisis events" },
    finishCrisis: { ar: "إنهاء مراجعة الأزمة", en: "Finish crisis review" },
    fingerprint: { ar: "البصمة السلوكية السيبرانية", en: "Cyber behavioral fingerprint" },
    fingerprintIntro: { ar: "مؤشرات مستخلصة من قرارات جلسات المحاكاة المسجلة.", en: "Indicators derived from recorded simulation decisions." },
    fingerprintInsufficient: { ar: "البيانات غير كافية لبناء بصمة موثوقة بعد.", en: "Not enough data to build a useful fingerprint yet." },
    fingerprintCount: { ar: "القرارات المسجلة", en: "Recorded decisions" },
    fingerprintStrengths: { ar: "نقاط قوة مرصودة", en: "Observed strengths" },
    fingerprintGrowth: { ar: "مجالات للتطوير", en: "Areas to develop" },
    fingerprintNotice: { ar: "هذه مؤشرات تدريب افتراضي فقط، وليست قياسًا مباشرًا لمركز عمليات أو شهادة مهنية.", en: "Simulation-only indicators, not a live SOC measurement or professional certification." },
    skill: { ar: "المهارة", en: "Skill" },
    level: { ar: "المستوى", en: "Level" },
    scenario: { ar: "السيناريو (محاكاة)", en: "Scenario (simulated)" },
    adversary: { ar: "الخصم (محاكاة)", en: "Adversary (simulated)" },
    evidence: { ar: "الأدلة المتاحة (محاكاة)", en: "Available evidence (simulated)" },
    decisions: { ar: "قرارات الاستجابة", en: "Response decisions" },
    feed: { ar: "سجل الأحداث", en: "Event log" },
    hint: { ar: "اطلب تلميحًا", en: "Request a hint" },
    mentor: { ar: "المرشد الذكي", en: "AI Mentor" },
    evaluation: { ar: "التقييم (مقاس)", en: "Evaluation (measured)" },
    aar: { ar: "تقرير ما بعد العملية", en: "After-Action Review" },
    verify: { ar: "ابدأ اختبار التحقق المستقل", en: "Start independent verification" },
    readiness: { ar: "ملف الجاهزية (مقاس)", en: "Readiness profile (measured)" },
    completed: { ar: "اكتملت الجلسة", en: "Session completed" },
    empty: { ar: "لا توجد جلسة نشطة. ابدأ جلسة لعرض المحاكاة.", en: "No active session. Start one to see the simulation." },
    loading: { ar: "جارٍ التنفيذ…", en: "Working…" },
    passed: { ar: "ناجح", en: "Passed" },
    failed: { ar: "غير مكتمل", en: "Not passed" },
    insufficient: { ar: "أدلة غير كافية", en: "Insufficient evidence" },
  };
  // Evaluation rubric dimensions (keys come from the decision evaluator).
  var DIMENSIONS = {
    incidentContainment: { ar: "احتواء الحادث", en: "Incident containment" },
    serviceContinuity: { ar: "استمرارية الخدمة", en: "Service continuity" },
    evidencePreservation: { ar: "حفظ الأدلة", en: "Evidence preservation" },
    decisionTiming: { ar: "توقيت القرار", en: "Decision timing" },
    riskReduction: { ar: "خفض المخاطر", en: "Risk reduction" },
    escalationQuality: { ar: "جودة التصعيد", en: "Escalation quality" },
    recoveryReadiness: { ar: "جاهزية التعافي", en: "Recovery readiness" },
    orderCorrectness: { ar: "صحة ترتيب الاستجابة", en: "Response order" },
  };
  var SECTORS = {
    healthcare: { ar: "الرعاية الصحية", en: "healthcare" },
    finance: { ar: "القطاع المالي", en: "finance" },
    education: { ar: "التعليم", en: "education" },
  };
  var AI_MODES = {
    "dev-deterministic": { ar: "وضع حتمي (بدون ذكاء اصطناعي حي)", en: "deterministic mode (no live AI)" },
    live: { ar: "ذكاء اصطناعي حي", en: "live AI" },
  };
  var READINESS_STATUS = {
    READY_EVIDENCE: { ar: "أدلة جاهزية كافية", en: "Readiness evidence" },
    INSUFFICIENT_EVIDENCE: { ar: "أدلة غير كافية", en: "Insufficient evidence" },
  };
  function t(k) { return (T[k] && T[k][state.lang]) || k; }
  function L(obj) { return obj ? (obj[state.lang] || obj.en || "") : ""; }

  function el(id) { return document.getElementById(id); }
  function setBusy(b) { state.busy = b; var o = el("ac-busy"); if (o) o.style.display = b ? "flex" : "none"; }
  function toast(msg, isErr) {
    var tnode = el("ac-toast");
    tnode.textContent = msg;
    tnode.className = "ac-toast " + (isErr ? "err" : "ok") + " show";
    setTimeout(function () { tnode.className = "ac-toast"; }, 4200);
  }

  async function api(path, opts) {
    opts = opts || {};
    opts.credentials = "include";
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    var res = await fetch(API + path, opts);
    var body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) {
      var m = (body && body.message) || ("HTTP " + res.status);
      var err = new Error(m); err.status = res.status; err.body = body;
      throw err;
    }
    return body;
  }

  // ---------- Auth ----------
  async function refreshAuth() {
    try {
      state.aiStatus = (await api("/ai/status")).data;
      renderAuth(true);
      return true;
    } catch (e) {
      state.aiStatus = null;
      renderAuth(false);
      return false;
    }
  }
  async function demoLogin() {
    setBusy(true);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email: "demo@risaq.local", password: "Risaq@Demo123!" }) });
      await refreshAuth();
      loadTemplates();
      window.dispatchEvent(new Event("rasd:authenticated"));
      toast(state.lang === "ar" ? "تم تسجيل الدخول" : "Signed in", false);
    } catch (e) {
      toast((state.lang === "ar" ? "تعذّر تسجيل الدخول: " : "Sign-in failed: ") + e.message, true);
    } finally { setBusy(false); }
  }

  function renderAuth(ok) {
    var badge = el("ac-aimode");
    if (state.aiStatus) {
      var live = state.aiStatus.aiMode === "live";
      badge.textContent = (state.lang === "ar" ? "وضع الذكاء: " : "AI mode: ") + state.aiStatus.aiMode;
      badge.className = "ac-badge " + (live ? "live" : "dev");
      badge.title = state.aiStatus.note || "";
    } else {
      badge.textContent = "";
      badge.className = "ac-badge";
    }
    el("ac-signin").style.display = ok ? "none" : "inline-flex";
    el("ac-authok").style.display = ok ? "inline-flex" : "none";
    el("ac-start").disabled = !ok;
    el("ac-start-crisis").disabled = !ok;
  }

  // ---------- Session lifecycle ----------
  async function loadTemplates() {
    try {
      var r = await api("/ai/templates");
      var sel = el("ac-skill");
      var skills = Array.from(new Set(r.data.templates.map(function (x) { return x.skill; })));
      sel.innerHTML = skills.map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("");
    } catch (e) { /* requires auth; ignored until signed in */ }
  }

  async function startSession() {
    setBusy(true);
    try {
      var skill = el("ac-skill").value || undefined;
      var level = parseInt(el("ac-level").value, 10) || 4;
      var r = await api("/ai/sessions", { method: "POST", body: JSON.stringify({ skill: skill, assessmentLevel: level }) });
      state.session = r.data;
      window.dispatchEvent(new CustomEvent("rasd:session-change", {detail:state.session}));
      renderSession();
      loadFingerprint();
      toast(state.lang === "ar" ? "بدأت الجلسة" : "Session started", false);
    } catch (e) {
      toast(e.message, true);
    } finally { setBusy(false); }
  }

  async function startCrisisSession() {
    setBusy(true);
    try {
      var level = parseInt(el("ac-level").value, 10) || 5;
      var r = await api("/ai/crisis-sessions", {
        method: "POST",
        body: JSON.stringify({ assessmentLevel: level })
      });
      state.session = r.data;
      window.dispatchEvent(new CustomEvent("rasd:session-change", { detail: state.session }));
      renderSession();
      loadFingerprint();
      toast(state.lang === "ar" ? "بدأت محاكاة الأزمة" : "Simulated crisis started", false);
    } catch (e) {
      toast(e.message, true);
    } finally { setBusy(false); }
  }

  async function submitDecision(optionId) {
    if (!state.session) return;
    setBusy(true);
    try {
      var r = await api("/ai/sessions/" + state.session.sessionId + "/decisions", { method: "POST", body: JSON.stringify({ optionId: optionId }) });
      state.session = r.data.session;
      renderSession();
      loadFingerprint();
      if (r.data.phaseEnded) { onPhaseEnded(); }
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  }

  async function requestHint() {
    if (!state.session) return;
    setBusy(true);
    try {
      var r = await api("/ai/sessions/" + state.session.sessionId + "/hint", { method: "POST", body: JSON.stringify({ level: 2 }) });
      var m = r.data;
      el("ac-mentor").innerHTML =
        '<div class="ac-mentor-msg ' + (m.allowed ? "" : "blocked") + '">' +
        '<span class="ac-chip ' + (m.aiMode === "live" ? "live" : "dev") + '">' + m.aiMode + "</span> " +
        escapeHtml(L(m.message)) + "</div>";
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  }

  async function startVerification() {
    if (!state.session) return;
    setBusy(true);
    try {
      var r = await api("/ai/sessions/" + state.session.sessionId + "/verify", { method: "POST" });
      state.session = r.data;
      el("ac-eval").innerHTML = "";
      el("ac-aar").innerHTML = "";
      renderSession();
      toast(state.lang === "ar" ? "بدأ التحقق المستقل" : "Verification started", false);
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  }

  async function endPhase() {
    if (!state.session) return;
    setBusy(true);
    try {
      var r = await api("/ai/sessions/" + state.session.sessionId + "/end-phase", { method: "POST" });
      state.session = r.data; renderSession(); onPhaseEnded();
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  }

  async function completeCrisis() {
    if (!state.session) return;
    setBusy(true);
    try {
      var r = await api("/ai/sessions/" + state.session.sessionId + "/complete", { method: "POST" });
      state.session = r.data;
      renderSession();
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  }

  async function refreshCurrentSession() {
    if (!state.session) return;
    try {
      var r = await api("/ai/sessions/" + state.session.sessionId);
      state.session = r.data;
      renderSession();
      if (state.session.state === "FEEDBACK") onPhaseEnded();
    } catch (e) {
      toast((state.lang === "ar" ? "تعذّر تحديث جلسة الأزمة: " : "Unable to refresh crisis session: ") + e.message, true);
    }
  }

  async function onPhaseEnded() {
    // Load AAR + evaluation for the finished phase, and readiness.
    try {
      var aar = (await api("/ai/sessions/" + state.session.sessionId + "/after-action")).data;
      renderAAR(aar);
    } catch (e) { /* no phase */ }
    renderEvaluation();
    loadReadiness();
  }

  async function loadReadiness() {
    try {
      var r = await api("/ai/readiness");
      renderReadiness(r.data.readiness);
    } catch (e) { /* ignore */ }
  }

  async function loadFingerprint() {
    try {
      var r = await api("/ai/behavioral-fingerprint");
      state.fingerprint = r.data;
      renderFingerprint(state.fingerprint);
    } catch (e) {
      toast((state.lang === "ar" ? "تعذّر تحميل البصمة السلوكية: " : "Unable to load behavioral fingerprint: ") + e.message, true);
    }
  }

  // ---------- Rendering ----------
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function bar(label, val) {
    return '<div class="ac-bar"><span>' + escapeHtml(label) + '</span><div class="ac-bar-track"><div class="ac-bar-fill" style="width:' + Math.max(0, Math.min(100, val)) + '%"></div></div><b>' + val + "</b></div>";
  }

  function renderSession() {
    var s = state.session;
    if (!s) {
      if (crisisTimerId) window.clearInterval(crisisTimerId);
      crisisTimerId = null;
      el("ac-stage").innerHTML = '<div class="ac-empty">' + t("empty") + "</div>";
      return;
    }
    var cur = s.current;
    window.dispatchEvent(new CustomEvent("rasd:session-change", {detail:{sessionId:s.sessionId}}));
    el("ac-sessionchip").style.display = "inline-flex";
    var sessionMode = s.mode === "VERIFICATION"
      ? (state.lang === "ar" ? "تحقق" : "verify")
      : s.crisisMode
        ? (state.lang === "ar" ? "أزمة افتراضية" : "crisis simulation")
        : (state.lang === "ar" ? "تدريب" : "train");
    el("ac-sessionchip").innerHTML = "<b>" + escapeHtml(s.state) + "</b> · " + escapeHtml(sessionMode);

    var html = "";
    // Scenario
    html += '<section class="ac-card"><h3>' + t("scenario") + ' <span class="ac-tag sim">SIM</span></h3>';
    html += '<p class="ac-obj">' + escapeHtml(L(cur.objective)) + "</p>";
    html += '<div class="ac-meta">' + escapeHtml(L(cur.world.organization) ? L({ ar: cur.world.organization.name, en: cur.world.organization.name }) : "") +
      ' · ' + escapeHtml(SECTORS[cur.sector] ? L(SECTORS[cur.sector]) : cur.sector) + ' · ' + (state.lang === "ar" ? "صعوبة" : "difficulty") + " " + cur.difficulty + "</div>";
    html += "</section>";

    // Adversary
    var adv = cur.adversary;
    html += '<section class="ac-card"><h3>' + t("adversary") + ' <span class="ac-tag sim">SIM</span></h3>';
    html += '<div class="ac-adv ' + (adv.contained ? "contained" : "active") + '"><span class="ac-dot"></span><b>' + escapeHtml(L(adv.stageLabel)) + "</b></div>";
    html += '<p class="ac-narr">' + escapeHtml(L(adv.narration)) + "</p>";
    html += "</section>";

    // Evidence
    html += '<section class="ac-card"><h3>' + t("evidence") + ' <span class="ac-tag sim">SIM</span></h3><ul class="ac-ev">';
    if (cur.availableEvidence.length === 0) html += "<li class='muted'>—</li>";
    cur.availableEvidence.forEach(function (e) { html += "<li>" + escapeHtml(L(e.label)) + ' <span class="ac-src">' + escapeHtml(e.source) + "</span></li>"; });
    html += "</ul></section>";
    if (s.crisisMode && s.crisis) {
      html += '<section class="ac-card ac-crisis"><h3>' + t("crisisTitle") + ' <span class="ac-tag sim">SIMULATED</span></h3>';
      html += '<p class="ac-narr">' + t("crisisNotice") + "</p>";
      html += '<div class="ac-meta">' + t("crisisTime") + '</div><div id="ac-crisis-timer" class="ac-crisis-timer">—</div>';
      html += '<div class="ac-meta">' + t("crisisResponse") + ': ' + formatDuration(s.crisis.responseTimeMs) + "</div>";
      html += '<h3 style="margin-top:12px">' + t("crisisEvents") + "</h3>";
      (s.crisis.events || []).forEach(function (event) {
        html += '<div class="ac-crisis-event ' + escapeHtml(event.severity || "") + '">#' +
          escapeHtml(event.step) + " · " + escapeHtml(L(event.label)) + "</div>";
      });
      html += "</section>";
    }
    el("ac-stage").innerHTML = html;
    syncCrisisTimer(s.crisisMode ? s.crisis : null);

    // Decisions
    var active = s.state === "SIMULATION" || s.state === "VERIFICATION";
    var dhtml = "";
    cur.decisions.forEach(function (d) {
      dhtml += '<button class="ac-decision" data-opt="' + d.id + '"' + (active ? "" : " disabled") + ">" + escapeHtml(L(d.label)) + "</button>";
    });
    el("ac-decisions").innerHTML = dhtml;
    Array.prototype.forEach.call(document.querySelectorAll(".ac-decision"), function (b) {
      b.addEventListener("click", function () { submitDecision(b.getAttribute("data-opt")); });
    });
    el("ac-hint").disabled = s.state !== "SIMULATION";
    el("ac-endphase").disabled = !active || cur.decisionsTaken.length === 0;

    // Feed
    var feed = "";
    var labelByKind = {};
    cur.decisions.forEach(function (d) { labelByKind[d.kind] = L(d.label); });
    (cur.decisionsTaken || []).forEach(function (d) {
      feed += '<div class="ac-feed-row"><span class="ac-step">#' + d.step + '</span>' + escapeHtml(labelByKind[d.kind] || d.kind) +
        ' <span class="ac-eff ' + (d.effective ? "yes" : "no") + '">' + (d.effective ? "✓" : "✕") + "</span></div>";
    });
    el("ac-feed").innerHTML = feed || '<div class="muted">—</div>';

    // Verify button visibility
    el("ac-verify").style.display = s.state === "FEEDBACK" && !s.crisisMode ? "inline-flex" : "none";
    el("ac-crisis-complete").style.display = s.state === "FEEDBACK" && s.crisisMode ? "inline-flex" : "none";
    if (s.state === "COMPLETED") { el("ac-completed").style.display = "block"; } else { el("ac-completed").style.display = "none"; }

    if (s.training && s.training.evaluation) renderEvaluation();
  }

  function formatDuration(ms) {
    var seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    var minutes = Math.floor(seconds / 60);
    return String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
  }

  function syncCrisisTimer(crisis) {
    if (crisisTimerId) window.clearInterval(crisisTimerId);
    crisisTimerId = null;
    crisisClientDeadline = null;
    var timer = el("ac-crisis-timer");
    if (!crisis || !timer) return;
    if (!crisis.active) {
      timer.textContent = formatDuration(crisis.remainingMs);
      return;
    }
    crisisClientDeadline = Date.now() + Math.max(0, crisis.remainingMs);
    var tick = function () {
      var remaining = Math.max(0, crisisClientDeadline - Date.now());
      timer.textContent = formatDuration(remaining);
      if (remaining === 0) {
        window.clearInterval(crisisTimerId);
        crisisTimerId = null;
        refreshCurrentSession();
      }
    };
    tick();
    crisisTimerId = window.setInterval(tick, 1000);
  }

  function renderFingerprint(fingerprint) {
    var html = '<h3>' + t("fingerprint") + ' <span class="ac-tag meas">SIMULATION DATA</span></h3>';
    if (fingerprint.insufficientData) {
      html += '<p class="muted">' + t("fingerprintInsufficient") + "</p>";
      html += '<p class="ac-meta">' + t("fingerprintCount") + ": " + fingerprint.decisionCount + "</p>";
      html += '<p class="ac-narr">' + escapeHtml(L(fingerprint.message)) + "</p>";
      el("ac-fingerprint").innerHTML = html;
      return;
    }
    html += '<p class="ac-meta">' + t("fingerprintIntro") + ' · ' + t("fingerprintCount") + ": " + fingerprint.decisionCount + "</p>";
    fingerprint.axes.forEach(function (axis) {
      html += '<div class="ac-fingerprint-axis"><span>' + escapeHtml(L(axis.label)) + '</span><div class="ac-bar-track"><div class="ac-bar-fill" style="width:' +
        (axis.value == null ? 0 : Math.max(0, Math.min(100, axis.value))) + '%"></div></div><b>' +
        (axis.value == null ? "—" : axis.value) + "</b></div>";
    });
    var labelsByAxis = {};
    fingerprint.axes.forEach(function (axis) { labelsByAxis[axis.axis] = L(axis.label); });
    html += '<p class="ac-meta">' + t("fingerprintStrengths") + ": " +
      (fingerprint.strengths.length ? fingerprint.strengths.map(function (key) { return escapeHtml(labelsByAxis[key] || key); }).join(" · ") : "—") + "</p>";
    html += '<p class="ac-meta">' + t("fingerprintGrowth") + ": " +
      (fingerprint.developmentAreas.length ? fingerprint.developmentAreas.map(function (key) { return escapeHtml(labelsByAxis[key] || key); }).join(" · ") : "—") + "</p>";
    html += '<p class="muted ac-fingerprint-notice">' + t("fingerprintNotice") + "</p>";
    el("ac-fingerprint").innerHTML = html;
  }

  function renderEvaluation() {
    var s = state.session; if (!s) return;
    var phase = (s.state === "COMPLETED" && s.verification && s.verification.evaluation) ? s.verification :
      (s.training && s.training.evaluation ? s.training : null);
    if (!phase || !phase.evaluation) { return; }
    var ev = phase.evaluation;
    var html = '<h3>' + t("evaluation") + ' <span class="ac-tag meas">MEASURED</span></h3>';
    if (ev.insufficientData) { html += '<p class="muted">' + t("insufficient") + "</p>"; el("ac-eval").innerHTML = html; return; }
    html += '<div class="ac-score ' + (ev.passed ? "pass" : "fail") + '">' + ev.total + '<small>/100 · ' + (ev.passed ? t("passed") : t("failed")) + "</small></div>";
    Object.keys(ev.dimensions).forEach(function (k) { html += bar(DIMENSIONS[k] ? L(DIMENSIONS[k]) : k, ev.dimensions[k]); });
    html += '<ul class="ac-rationale">';
    var rationale = state.lang === "en" && ev.rationaleEn ? ev.rationaleEn : ev.rationale;
    rationale.forEach(function (r) { html += "<li>" + escapeHtml(r) + "</li>"; });
    html += "</ul>";
    el("ac-eval").innerHTML = html;
  }

  function renderAAR(aar) {
    var html = '<h3>' + t("aar") + "</h3>";
    html += '<p class="ac-obj">' + escapeHtml(L(aar.summary)) + "</p>";
    html += '<div class="ac-timeline">';
    aar.timeline.forEach(function (e) {
      var lbl = e.label ? L(e.label) : (e.note || e.type);
      html += '<div class="ac-tl ' + e.type + '"><span>#' + e.step + "</span> " + escapeHtml(lbl) + "</div>";
    });
    html += "</div>";
    if (aar.ignoredEvidence && aar.ignoredEvidence.length) {
      html += '<p class="muted">' + (state.lang === "ar" ? "أدلة لم تُجمع: " : "Evidence not collected: ") +
        aar.ignoredEvidence.map(function (x) { return escapeHtml(L(x.label)); }).join(" · ") + "</p>";
    }
    var narrText = state.lang === "ar" && aar.narrative.textAr ? aar.narrative.textAr : aar.narrative.text;
    html += '<p class="ac-narr">' + escapeHtml(narrText) +
      ' <span class="ac-chip ' + (aar.narrative.aiMode === "live" ? "live" : "dev") + '">' + escapeHtml(AI_MODES[aar.narrative.aiMode] ? L(AI_MODES[aar.narrative.aiMode]) : aar.narrative.aiMode) + "</span></p>";
    html += '<p class="ac-rec">' + escapeHtml(L(aar.recommendation)) + "</p>";
    el("ac-aar").innerHTML = html;
  }

  function renderReadiness(rd) {
    var cls = rd.status === "READY_EVIDENCE" ? "pass" : rd.status === "INSUFFICIENT_EVIDENCE" ? "warn" : "dev";
    var html = '<h3>' + t("readiness") + ' <span class="ac-tag meas">MEASURED</span></h3>';
    html += '<div class="ac-rd-status ' + cls + '">' + escapeHtml(READINESS_STATUS[rd.status] ? L(READINESS_STATUS[rd.status]) : rd.status) +
      ' <small class="ac-rd-code">' + escapeHtml(rd.status) + "</small></div>";
    html += '<div class="ac-rd-grid">';
    html += '<div><span>' + (state.lang === "ar" ? "أداء التدريب" : "Training perf") + "</span><b>" + (rd.trainingPerformance == null ? "—" : rd.trainingPerformance) + "</b></div>";
    html += '<div><span>' + (state.lang === "ar" ? "الاستقلالية" : "Autonomy") + "</span><b>" + (rd.autonomy == null ? "—" : rd.autonomy) + "</b></div>";
    html += '<div><span>' + (state.lang === "ar" ? "مهارات مُتحقَّقة" : "Verified") + "</span><b>" + rd.verifiedSkills.length + "</b></div>";
    html += '<div><span>' + (state.lang === "ar" ? "غير مُتحقَّقة" : "Unverified") + "</span><b>" + rd.unverifiedSkills.length + "</b></div>";
    html += "</div>";
    if (rd.verifiedSkills.length) html += '<p class="ac-verified">✓ ' + rd.verifiedSkills.map(escapeHtml).join(", ") + "</p>";
    html += '<p class="muted ac-disc">' + escapeHtml(L(rd.disclaimer)) + "</p>";
    el("ac-readiness").innerHTML = html;
  }

  // ---------- Language / boot ----------
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
    Array.prototype.forEach.call(document.querySelectorAll("[data-ar][data-en]"), function (node) {
      node.textContent = node.getAttribute(state.lang === "ar" ? "data-ar" : "data-en");
    });
    el("ac-title").textContent = t("title");
    el("ac-subtitle").textContent = t("subtitle");
    el("ac-start").textContent = t("start");
    el("ac-start-crisis").textContent = t("startCrisis");
    el("ac-signin").textContent = t("signIn");
    el("ac-hint").textContent = t("hint");
    el("ac-verify").textContent = t("verify");
    el("ac-endphase").textContent = state.lang === "ar" ? "إنهاء المرحلة" : "End phase";
    el("ac-skill-label").textContent = t("skill");
    el("ac-level-label").textContent = t("level");
    el("ac-decisions-h").textContent = t("decisions");
    el("ac-feed-h").textContent = t("feed");
    el("ac-mentor-h").textContent = t("mentor");
    el("ac-completed").textContent = t("completed");
    el("ac-crisis-complete").textContent = t("finishCrisis");
    el("ac-langbtn").textContent = state.lang === "ar" ? "EN" : "ع";
    if (state.session) renderSession(); else el("ac-stage").innerHTML = '<div class="ac-empty">' + t("empty") + "</div>";
    if (state.fingerprint) renderFingerprint(state.fingerprint);
    renderAuth(!!state.aiStatus);
  }

  function boot() {
    el("ac-langbtn").addEventListener("click", function () {
      state.lang = state.lang === "ar" ? "en" : "ar";
      localStorage.setItem("rasd_lang", state.lang);
      applyLang();
    });
    el("ac-signin").addEventListener("click", demoLogin);
    el("ac-start").addEventListener("click", startSession);
    el("ac-start-crisis").addEventListener("click", startCrisisSession);
    el("ac-hint").addEventListener("click", requestHint);
    el("ac-verify").addEventListener("click", startVerification);
    el("ac-endphase").addEventListener("click", endPhase);
    el("ac-crisis-complete").addEventListener("click", completeCrisis);
    applyLang();
    window.addEventListener("rasd:restore", function(event) {
      state.session = event.detail;
      renderSession();
      if (state.session?.training?.evaluation || state.session?.verification?.evaluation) onPhaseEnded();
    });
    refreshAuth().then(function (ok) {
      if (ok) {
        loadTemplates();
        loadFingerprint();
        window.dispatchEvent(new Event("rasd:authenticated"));
      }
      window.dispatchEvent(new Event("rasd:booted"));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
