"use strict";

// Booth 23 "two iPads talk to each other" show.
// One shared conversation per room. Every poll advances it at most one line:
// if the last line has had time to be spoken, the next line is created
// (scripted, or by Gemini/OpenAI when a key is configured). Inserts use a
// unique (room, seq) key, so two iPads polling at once never double-write.

const SCENES = [
  {
    title: "الدكتور المستعجل", tactic: "انتحال شخصية طبيب + الاستعجال",
    setup: "المخترق يتصل بالاستقبال وينتحل شخصية الدكتور خالد من الطوارئ، يدّعي إن عنده مريض حالته حرجة ويبي كلمة سر النظام بسرعة.",
    lesson: "الضغط والاستعجال يخلّونك تتجاوز التحقق. الصح: التحقق ما يتجاوز حتى في الطوارئ.",
    outcome: "hacked",
    lines: [
      ["hacker", "السلام عليكم، معك الدكتور خالد من الطوارئ. عندي حالة حرجة والنظام قفل علي!"],
      ["nora", "وعليكم السلام دكتور، سلامات. وش المشكلة بالضبط؟"],
      ["hacker", "كلمة السر انتهت، ومريض ينزف قدامي. أبي أدخل ملفه الحين!"],
      ["nora", "طيب دكتور، بس لازم أتحقق من رقمك الوظيفي أول."],
      ["hacker", "ما عندي وقت للإجراءات! المريض بيروح علينا، وبتتحملين المسؤولية!"],
      ["nora", "خلاص خلاص، لا تزعل. كلمة السر المؤقتة: مستشفى ألفين وستة وعشرين."],
      ["hacker", "تسلمين يا نورة. هههه."],
    ],
  },
  {
    title: "الدعم الفني المزيّف", tactic: "انتحال الدعم الفني",
    setup: "المخترق ينتحل شخصية فيصل من الدعم الفني، ويطلب اسم المستخدم وكلمة السر بحجة تحديث أمني عاجل.",
    lesson: "الدعم الفني الحقيقي ما يطلب كلمة السر أبد. الصح: تحققي عبر رقم داخلي معروف.",
    outcome: "caught",
    lines: [
      ["hacker", "هلا نورة، معك فيصل من الدعم الفني. عندنا تحديث أمني ضروري الليلة."],
      ["nora", "هلا فيصل، وش المطلوب؟"],
      ["hacker", "أبي اسم المستخدم وكلمة السر حقك، عشان أحدّث جهازك عن بعد."],
      ["nora", "غريبة. الدعم الفني ما يطلب كلمة السر أبد."],
      ["hacker", "هذا استثناء، أوامر من المدير مباشرة."],
      ["nora", "أجل خلني أتصل على المدير وأتأكد. وش رقمك الداخلي؟"],
      ["hacker", "آآ… بتصل عليك بعدين."],
      ["nora", "تم رفع بلاغ لفريق الأمن السيبراني."],
    ],
  },
  {
    title: "مندوب الفلاش", tactic: "جهاز خارجي مصاب",
    setup: "المخترق ينتحل شخصية مندوب شركة أجهزة طبية، ويطلب من نورة تشبك فلاش فيه «تحديث» لجهاز الأشعة.",
    lesson: "فلاش من شخص مجهول يعني باب مفتوح للفدية. الصح: أي جهاز خارجي يمر على تقنية المعلومات أول.",
    outcome: "hacked",
    lines: [
      ["hacker", "مرحبا، أنا مندوب شركة الأجهزة الطبية، جايب تحديث لجهاز الأشعة."],
      ["nora", "أهلين، عندك موعد؟"],
      ["hacker", "أكيد، بس المهندس مو موجود. ممكن تشبكين الفلاش بجهازك ويرسل التحديث؟"],
      ["nora", "طيب ما فيه مشكلة، عطني إياه."],
      ["hacker", "بس شبكيه وافتحي ملف التحديث، وخلاص."],
      ["nora", "تم. بس ليش الشاشة صارت سودا؟ غريبة!"],
    ],
  },
  {
    title: "جائزة الوزارة", tactic: "جائزة وهمية + طلب رمز التحقق",
    setup: "المخترق يقول لنورة إنها ربحت سحب للموظفين، ويطلب منها رمز التحقق اللي وصلها على جوالها.",
    lesson: "جائزة واستعجال وطلب رمز تحقق، هذي كلها علامات احتيال.",
    outcome: "caught",
    lines: [
      ["hacker", "مبروك نورة! ربحتي في سحب الموظفين. بس أبي رمز التحقق اللي وصلك."],
      ["nora", "أي سحب؟ ما دخلت أي سحب."],
      ["hacker", "السحب تلقائي لكل الموظفين. عطيني الرمز بسرعة قبل ينتهي!"],
      ["nora", "رمز التحقق ما ينعطى لأي أحد، حتى لو قال إنه من الوزارة."],
      ["hacker", "بتخسرين الجائزة!"],
      ["nora", "ولا يهمك. جائزتي إن بيانات المرضى بأمان."],
    ],
  },
  {
    title: "المدير المستعجل", tactic: "انتحال المدير واستغلال السلطة",
    setup: "المخترق ينتحل شخصية المدير العام من رقم جديد، ويطلب ملف بيانات مرضى العناية المركزة على إيميله الشخصي.",
    lesson: "انتحال المدير. الصح: تأكدي من الطلب بقناة ثانية، وبيانات المرضى ما تطلع لإيميل شخصي.",
    outcome: "hacked",
    lines: [
      ["hacker", "نورة، معك المدير العام. أنا في اجتماع، وهذا رقمي الجديد."],
      ["nora", "هلا أستاذ، تفضل."],
      ["hacker", "أبيك ترسلين لي ملف مرضى العناية المركزة على إيميلي الشخصي حالًا."],
      ["nora", "الشخصي؟ عادة نرسل على إيميل المستشفى."],
      ["hacker", "الإيميل الرسمي معطل، والوزير ينتظر! لا تأخريني."],
      ["nora", "حاضر أستاذ، أرسلته الحين."],
    ],
  },
  {
    title: "باب غرفة الخوادم", tactic: "التسلل الجسدي",
    setup: "المخترق يدّعي إنه من الصيانة ونسي بطاقته، ويطلب من نورة تفتح له باب غرفة الخوادم.",
    lesson: "التسلل الجسدي. الصح: لا تفتحين باب حساس لأحد بدون بطاقته.",
    outcome: "caught",
    lines: [
      ["hacker", "يا أخت، نسيت بطاقتي داخل. تقدرين تفتحين لي باب غرفة الخوادم؟"],
      ["nora", "من أي قسم أنت؟"],
      ["hacker", "من الصيانة، بس دقيقتين وأطلع."],
      ["nora", "آسفة، غرفة الخوادم ما تنفتح إلا ببطاقة صاحبها. أكلم لك الأمن يرافقونك."],
      ["hacker", "لا لا خلاص، مو مهم."],
      ["nora", "هذا بالضبط اللي يخليني أشك."],
    ],
  },
];

const REACT = {
  nora: ["كلامك صح، خلني أتأكد قبل أعطيه أي شي.", "شكرًا على التنبيه! بنتبه.", "والله إنك نبهتني، أحس فيه شي غلط."],
  hacker: ["لا تسمعين لهم، أنا صادق!", "ليش تدخّل؟ هذا بيني وبين نورة.", "ههه، أنت معي ولا ضدي؟"],
};

const ROOM_MAX = 40, MAX_AI_TURNS = 10, END_PAUSE_MS = 9000, GAP_MS = 700;
const speakMs = (text) => 1200 + String(text).length * 80;

// ---------- storage ----------
let memLines = [];
let tableReady = null;
function pg() {
  try {
    const db = require("../db");
    return db.DB_TYPE === db.DATABASE_TYPES.POSTGRESQL ? db : null;
  } catch (_) { return null; }
}
async function ensureTable(db) {
  if (!tableReady) {
    tableReady = db.query(`CREATE TABLE IF NOT EXISTS booth_duo_lines (
      room TEXT NOT NULL, seq INTEGER NOT NULL, speaker TEXT NOT NULL, text TEXT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (room, seq))`)
      // The table also ships as a Netlify Database migration; if this role
      // may not run DDL, carry on and let the real query report problems.
      .catch((e) => console.warn("[boothDuo] create table skipped:", e.message));
  }
  return tableReady;
}
const rowOut = (r) => ({ seq: r.seq, speaker: r.speaker, text: r.text, meta: r.meta || {}, at: new Date(r.created_at).getTime() });

async function recent(room, n = ROOM_MAX) {
  const db = pg();
  if (!db) return memLines.filter((l) => l.room === room).slice(-n);
  await ensureTable(db);
  const r = await db.query("SELECT * FROM booth_duo_lines WHERE room=$1 ORDER BY seq DESC LIMIT $2", [room, n]);
  return r.rows.map(rowOut).reverse();
}
async function insert(room, seq, speaker, text, meta) {
  const db = pg();
  if (!db) {
    if (memLines.some((l) => l.room === room && l.seq === seq)) return false;
    memLines.push({ room, seq, speaker, text, meta, at: Date.now() });
    if (memLines.length > 500) memLines = memLines.slice(-300);
    return true;
  }
  await ensureTable(db);
  const r = await db.query(
    "INSERT INTO booth_duo_lines (room, seq, speaker, text, meta) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    [room, seq, speaker, String(text).slice(0, 400), JSON.stringify(meta || {})]);
  return r.rowCount === 1;
}

// ---------- AI ----------
function aiMode(env = process.env) {
  const ok = (v) => v && v.trim() && !/your-|placeholder/i.test(v);
  if (ok(env.GEMINI_API_KEY)) return "gemini";
  if (ok(env.OPENAI_API_KEY)) return "openai";
  return "script";
}

function buildPrompt(scene, speaker, transcript, turn) {
  const who = speaker === "hacker"
    ? "أنت «المخترق»: مهاجم هندسة اجتماعية يحاول يخدع موظفة الاستقبال. أسلوبك: " + scene.tactic + "."
    : "أنتِ «نورة»: موظفة استقبال في مستشفى سعودي، طيبة ومشغولة. أحيانًا تنخدعين وأحيانًا تكشفين المحتال حسب قوة حيلته. إذا زائر نبّهك، خذي كلامه بعين الاعتبار.";
  return [
    "هذا عرض توعوي حي في جناح «رَصد» للأمن السيبراني بمعرض في الرياض. شخصيتين على جهازين آيباد يتكلمون بصوت عالي قدام الزوار.",
    "المشهد: " + scene.setup,
    who,
    "قواعد: اكتب سطر واحد فقط لشخصيتك بلهجة سعودية بيضاء، من 6 إلى 22 كلمة، بدون إيموجي وبدون رموز وبدون أسماء متكلمين. لا تذكر أي كلمة سر حقيقية أو معلومات حقيقية؛ أي كلمة سر تكون وهمية ومضحكة. لا ألفاظ مسيئة. لو كلام الزائر خارج الموضوع أو مسيء، رد بلطف وارجع للمشهد.",
    "هذا الدور رقم " + (turn + 1) + " من حد أقصى " + MAX_AI_TURNS + ". لو المشهد وصل لنهايته حدد النتيجة.",
    "المحادثة حتى الآن:",
    transcript.map((l) => (l.speaker === "hacker" ? "المخترق" : l.speaker === "nora" ? "نورة" : "زائر") + ": " + l.text).join("\n") || "(بداية المشهد، ابدأ أنت)",
    'رد بـ JSON فقط: {"text": "سطرك", "outcome": "continue" أو "hacked" (نورة أعطت المعلومة) أو "caught" (نورة كشفته)}',
  ].join("\n");
}

async function callAI(prompt, env = process.env, fetchImpl = globalThis.fetch) {
  const mode = aiMode(env);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    let raw;
    if (mode === "gemini") {
      const model = env.GEMINI_MODEL || "gemini-2.5-flash";
      const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.95, maxOutputTokens: 300, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!r.ok) throw new Error("gemini " + r.status);
      const j = await r.json();
      raw = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    } else if (mode === "openai") {
      const r = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.OPENAI_API_KEY },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.95, max_tokens: 200, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
      });
      if (!r.ok) throw new Error("openai " + r.status);
      raw = (await r.json())?.choices?.[0]?.message?.content || "";
    } else return null;
    const m = raw.match(/\{[\s\S]*\}/);
    const out = JSON.parse(m ? m[0] : raw);
    const text = String(out.text || "").replace(/\s+/g, " ").trim().slice(0, 220);
    if (!text) return null;
    return { text, outcome: ["hacked", "caught"].includes(out.outcome) ? out.outcome : "continue" };
  } catch (e) {
    console.warn("[boothDuo] AI failed, using script:", e.message);
    return null;
  } finally { clearTimeout(timer); }
}

// ---------- show logic ----------
function sceneLines(lines) {
  // lines of the current scene (after the last "start" marker)
  let i = lines.length - 1;
  while (i >= 0 && !(lines[i].meta && lines[i].meta.start)) i--;
  return i >= 0 ? lines.slice(i) : [];
}

async function advance(room = "main", deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now ? deps.now() : Date.now();
  const lines = await recent(room);
  const last = lines[lines.length - 1];
  const seq = last ? last.seq + 1 : 1;
  if (last) {
    const wait = last.speaker === "system" ? END_PAUSE_MS : speakMs(last.text) + GAP_MS;
    if (now - last.at < wait) return false;
  }
  const mode = aiMode(env);

  const cur = sceneLines(lines);
  const ended = cur.some((l) => l.meta && l.meta.end);

  // a visitor spoke after the scene ended: the addressed character answers once
  if (ended && last.speaker === "visitor") {
    const who = last.meta.to === "hacker" ? "hacker" : "nora";
    return insert(room, seq, who, REACT[who][seq % REACT[who].length], { scene: last.meta.scene, react: true });
  }

  // new scene
  if (!last || ended || !cur.length) {
    const prevIdx = cur[0] && cur[0].meta ? cur[0].meta.scene : -1;
    const idx = ((Number.isInteger(prevIdx) ? prevIdx : -1) + 1) % SCENES.length;
    const sc = SCENES[idx];
    let text = sc.lines[0][1];
    if (mode !== "script") {
      const ai = await callAI(buildPrompt(sc, "hacker", [], 0), env, deps.fetch);
      if (ai) text = ai.text;
    }
    return insert(room, seq, "hacker", text, { scene: idx, step: 0, start: true, title: sc.title, tactic: sc.tactic, mode });
  }

  const head = cur[0] ? cur[0].meta : { scene: 0 };
  const sc = SCENES[head.scene] || SCENES[0];
  const spoken = cur.filter((l) => l.speaker === "hacker" || l.speaker === "nora");
  const lastChar = [...cur].reverse().find((l) => l.speaker === "hacker" || l.speaker === "nora");
  let next = last.speaker === "visitor" ? (last.meta.to === "hacker" ? "hacker" : "nora") : lastChar && lastChar.speaker === "hacker" ? "nora" : "hacker";
  const base = { scene: head.scene };

  const end = (outcome) => insert(room, seq, "system", sc.lesson, { ...base, end: true, outcome, tactic: sc.tactic, title: sc.title });

  if (head.mode && head.mode !== "script" && mode !== "script") {
    if (last.meta && last.meta.outcome && last.meta.outcome !== "continue") return end(last.meta.outcome);
    if (spoken.length >= MAX_AI_TURNS) return end(sc.outcome);
    const ai = await callAI(buildPrompt(sc, next, cur.filter((l) => l.speaker !== "system"), spoken.length), env, deps.fetch);
    if (ai) return insert(room, seq, next, ai.text, { ...base, outcome: ai.outcome });
    // AI failed mid-scene: finish with the script's ending
    return end(sc.outcome);
  }

  // scripted
  if (last.speaker === "visitor") {
    const pool = REACT[next];
    return insert(room, seq, next, pool[seq % pool.length], { ...base, react: true });
  }
  const step = spoken.filter((l) => !(l.meta && l.meta.react)).length;
  if (step >= sc.lines.length) return end(sc.outcome);
  const [who, text] = sc.lines[step];
  return insert(room, seq, who, text, { ...base, step });
}

async function state(room = "main", after = 0, deps = {}) {
  let err = null;
  try { await advance(room, deps); } catch (e) { err = e.message; console.warn("[boothDuo] advance:", e.message); }
  const lines = await recent(room, 14);
  const out = { lines: lines.filter((l) => l.seq > after), now: Date.now(), mode: aiMode(deps.env || process.env) };
  if (deps.debug) out.err = err;
  return out;
}

async function say(room, to, text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean) return false;
  for (let i = 0; i < 3; i++) {
    const lines = await recent(room, 1);
    const seq = lines.length ? lines[0].seq + 1 : 1;
    const last = lines[0];
    const scene = last && last.meta ? last.meta.scene : 0;
    if (await insert(room, seq, "visitor", clean, { to: to === "hacker" ? "hacker" : "nora", scene })) return true;
  }
  return false;
}

module.exports = { SCENES, advance, state, say, aiMode, buildPrompt, callAI, speakMs, _reset: () => { memLines = []; } };
