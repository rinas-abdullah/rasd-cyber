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
// Arabic TTS runs ~11 chars/s; leave room so the two devices never talk over each other.
const speakMs = (text) => 1500 + String(text).length * 95;

// ---------- storage ----------
let memLines = [];
let lastAiError = null;
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
// ---------- AI voices (Gemini TTS), cached per line ----------
const crypto = require("crypto");
const VOICES = {
  nora: { name: "Kore", style: "بلهجة سعودية طبيعية، بصوت موظفة استقبال سعودية شابة، لطيفة ومشغولة" },
  hacker: { name: "Algenib", style: "بلهجة سعودية طبيعية، بصوت رجل سعودي واثق ومستعجل، فيه مكر خفيف" },
};
const SAMPLE = { nora: "هلا والله، أنا نورة. جاهزة!", hacker: "هلا، أنا جاهز. خلنا نبدأ." };
let memAudio = new Map();
let memLease = new Map();
let audioReady = null;
let ttsPausedUntil = 0;
function ttsOn(env = process.env) { return aiMode(env) === "gemini" && env.DUO_TTS !== "off" && Date.now() > ttsPausedUntil; }
function audioKey(role, text, env = process.env) {
  const v = VOICES[role];
  return crypto.createHash("sha1").update([env.TTS_MODEL || "gemini-3.8-flash-tts", v.name, v.style, text].join("|")).digest("hex");
}
function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
function wavMs(buf) {
  try {
    const byteRate = buf.readUInt32LE(28);
    let i = 12;
    while (i + 8 <= buf.length) {
      const id = buf.toString("ascii", i, i + 4), size = buf.readUInt32LE(i + 4);
      if (id === "data") return Math.round((Math.min(size, buf.length - i - 8) / byteRate) * 1000);
      i += 8 + size;
    }
  } catch (_) {}
  return 0;
}
async function ensureAudioTables(db) {
  if (!audioReady) {
    audioReady = db.query(`CREATE TABLE IF NOT EXISTS booth_duo_audio (key TEXT PRIMARY KEY, wav BYTEA NOT NULL, ms INTEGER NOT NULL,
        scripted BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS booth_duo_lease (room TEXT PRIMARY KEY, until TIMESTAMPTZ NOT NULL);`)
      .catch((e) => console.warn("[boothDuo] audio tables skipped:", e.message));
  }
  return audioReady;
}
async function getAudio(key, withWav) {
  const db = pg();
  if (!db) return memAudio.get(key) || null;
  await ensureAudioTables(db);
  const r = await db.query(withWav ? "SELECT wav, ms FROM booth_duo_audio WHERE key=$1" : "SELECT ms FROM booth_duo_audio WHERE key=$1", [key]);
  return r.rows[0] || null;
}
async function putAudio(key, wav, ms, scripted) {
  const db = pg();
  if (!db) { memAudio.set(key, { wav, ms }); if (memAudio.size > 300) memAudio.delete(memAudio.keys().next().value); return; }
  await ensureAudioTables(db);
  await db.query("INSERT INTO booth_duo_audio (key, wav, ms, scripted) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO NOTHING", [key, wav, ms, !!scripted]);
  if (Math.random() < 0.05) db.query("DELETE FROM booth_duo_audio WHERE NOT scripted AND created_at < now() - interval '2 hours'").catch(() => {});
}
async function ttsCall(role, text, env = process.env, fetchImpl = globalThis.fetch) {
  const v = VOICES[role];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const model = env.TTS_MODEL || "gemini-3.8-flash-tts";
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: (role === "nora" ? env.TTS_VOICE_NORA : env.TTS_VOICE_HACKER) || v.name } } } },
      }),
    });
    if (r.status === 429) ttsPausedUntil = Date.now() + 10 * 60 * 1000;
    if (!r.ok) throw new Error("tts " + r.status + " " + (await r.text().catch(() => "")).slice(0, 160));
    const part = (await r.json())?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) throw new Error("tts: no audio");
    let buf = Buffer.from(part.inlineData.data, "base64");
    const mime = part.inlineData.mimeType || "";
    if (!/wav/i.test(mime)) buf = wavFromPcm(buf, parseInt((mime.match(/rate=(\d+)/) || [])[1], 10) || 24000);
    const ms = wavMs(buf);
    if (!ms) throw new Error("tts: empty audio");
    return { wav: buf, ms };
  } catch (e) {
    lastAiError = "TTS: " + e.message;
    console.warn("[boothDuo] TTS failed, device voice will be used:", e.message);
    return null;
  } finally { clearTimeout(timer); }
}
// { audio: key, ms } for a line, generated once and cached.
async function voiceFor(role, text, scripted, deps = {}) {
  const env = deps.env || process.env;
  if (!VOICES[role] || !ttsOn(env)) return {};
  const key = audioKey(role, text, env);
  const hit = await getAudio(key, false);
  if (hit) return { audio: key, ms: hit.ms };
  const out = await ttsCall(role, text, env, deps.ttsFetch || deps.fetch);
  if (!out) return {};
  await putAudio(key, out.wav, out.ms, scripted);
  return { audio: key, ms: out.ms };
}
async function audioWav(key) {
  if (!/^[a-f0-9]{40}$/.test(String(key))) return null;
  const a = await getAudio(key, true);
  return a && a.wav ? Buffer.from(a.wav) : null;
}
async function sample(role, deps = {}) {
  if (!VOICES[role]) return {};
  return voiceFor(role, SAMPLE[role], true, deps);
}
// One device at a time may create the next line (AI text + speech can take ~10 s).
async function lease(room, on) {
  const db = pg();
  if (!db) {
    const now = Date.now();
    if (!on) { memLease.delete(room); return true; }
    if ((memLease.get(room) || 0) > now) return false;
    memLease.set(room, now + 25000); return true;
  }
  await ensureAudioTables(db);
  if (!on) { await db.query("UPDATE booth_duo_lease SET until = now() WHERE room=$1", [room]); return true; }
  await db.query("INSERT INTO booth_duo_lease (room, until) VALUES ($1, now() - interval '1 second') ON CONFLICT DO NOTHING", [room]);
  const r = await db.query("UPDATE booth_duo_lease SET until = now() + interval '25 seconds' WHERE room=$1 AND until < now() RETURNING room", [room]);
  return r.rowCount === 1;
}
const lineWait = (l) => (l.speaker === "system" ? END_PAUSE_MS : l.meta && l.meta.ms ? l.meta.ms + 1500 : speakMs(l.text) + GAP_MS);

const rowOut = (r) => ({ seq: r.seq, speaker: r.speaker, text: r.text, meta: r.meta || {}, at: new Date(r.created_at).getTime() });

async function recent(room, n = ROOM_MAX) {
  const db = pg();
  if (!db) return memLines.filter((l) => l.room === room).slice(-n);
  await ensureTable(db);
  const r = await db.query("SELECT * FROM booth_duo_lines WHERE room=$1 ORDER BY seq DESC LIMIT $2", [room, n]);
  return r.rows.map(rowOut).reverse();
}
async function insert(room, seq, speaker, text, meta, deps) {
  if (deps && (speaker === "hacker" || speaker === "nora")) {
    meta = { ...meta, ...(await voiceFor(speaker, text, !(meta && meta.ai), deps)) };
  }
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
    "قواعد: اكتب سطر واحد فقط لشخصيتك بلهجة سعودية بيضاء، من 5 إلى 16 كلمة، بدون إيموجي وبدون رموز وبدون أسماء متكلمين. لا تذكر أي كلمة سر حقيقية أو معلومات حقيقية؛ أي كلمة سر تكون وهمية ومضحكة. لا ألفاظ مسيئة. لو كلام الزائر خارج الموضوع أو مسيء، رد بلطف وارجع للمشهد.",
    "هذا الدور رقم " + (turn + 1) + " من حد أقصى " + MAX_AI_TURNS + ". لو المشهد وصل لنهايته حدد النتيجة.",
    "المحادثة حتى الآن:",
    transcript.map((l) => (l.speaker === "hacker" ? "المخترق" : l.speaker === "nora" ? "نورة" : "زائر") + ": " + l.text).join("\n") || "(بداية المشهد، ابدأ أنت)",
    'رد بـ JSON فقط: {"text": "سطرك", "outcome": "continue" أو "hacked" (نورة أعطت المعلومة) أو "caught" (نورة كشفته)}',
  ].join("\n");
}

async function callAI(prompt, env = process.env, fetchImpl = globalThis.fetch) {
  const mode = aiMode(env);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    let raw;
    if (mode === "gemini") {
      // Free-tier models get rate-limited or overloaded; try the next one.
      const models = [env.GEMINI_MODEL, "gemini-flash-lite-latest", "gemini-2.5-flash"].filter((m, i, a) => m && a.indexOf(m) === i);
      let r;
      for (const model of models) {
      r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.95, maxOutputTokens: 300, responseMimeType: "application/json", ...(/2\.5-flash$/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
        }),
      });
      if (r.ok || ![400, 404, 429, 500, 503].includes(r.status)) break;
      lastAiError = "gemini " + model + " " + r.status;
      }
      if (!r.ok) throw new Error("gemini " + r.status + " " + (await r.text().catch(() => "")).slice(0, 160));
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
    lastAiError = e.message;
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
  const now = deps.now ? deps.now() : Date.now();
  const before = await recent(room, 1);
  if (before[0] && now - before[0].at < lineWait(before[0])) return false;
  if (!(await lease(room, true))) return false;
  try { return await step(room, deps); } finally { await lease(room, false).catch(() => {}); }
}

async function step(room, deps) {
  const env = deps.env || process.env;
  const now = deps.now ? deps.now() : Date.now();
  const lines = await recent(room);
  const last = lines[lines.length - 1];
  const seq = last ? last.seq + 1 : 1;
  if (last && now - last.at < lineWait(last)) return false;
  const mode = aiMode(env);

  const cur = sceneLines(lines);
  const ended = cur.some((l) => l.meta && l.meta.end);

  // a visitor spoke after the scene ended: the addressed character answers once
  if (ended && last.speaker === "visitor") {
    const who = last.meta.to === "hacker" ? "hacker" : "nora";
    return insert(room, seq, who, REACT[who][seq % REACT[who].length], { scene: last.meta.scene, react: true }, deps);
  }

  // new scene
  if (!last || ended || !cur.length) {
    const prevIdx = cur[0] && cur[0].meta ? cur[0].meta.scene : -1;
    const idx = ((Number.isInteger(prevIdx) ? prevIdx : -1) + 1) % SCENES.length;
    const sc = SCENES[idx];
    let text = sc.lines[0][1], used = "script";
    if (mode !== "script") {
      const ai = await callAI(buildPrompt(sc, "hacker", [], 0), env, deps.fetch);
      if (ai) { text = ai.text; used = mode; }
    }
    return insert(room, seq, "hacker", text, { scene: idx, step: 0, start: true, title: sc.title, tactic: sc.tactic, mode: used, ai: used !== "script" }, deps);
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
    if (ai) return insert(room, seq, next, ai.text, { ...base, outcome: ai.outcome, ai: true }, deps);
    // AI failed mid-scene: say this character's next scripted line, if any
    const fb = sc.lines.find((l, i) => l[0] === next && i >= spoken.length);
    return fb ? insert(room, seq, next, fb[1], { ...base }, deps) : end(sc.outcome);
  }

  // scripted
  if (last.speaker === "visitor") {
    const pool = REACT[next];
    return insert(room, seq, next, pool[seq % pool.length], { ...base, react: true }, deps);
  }
  const step = spoken.filter((l) => !(l.meta && l.meta.react)).length;
  if (step >= sc.lines.length) return end(sc.outcome);
  const [who, text] = sc.lines[step];
  return insert(room, seq, who, text, { ...base, step }, deps);
}

async function state(room = "main", after = 0, deps = {}) {
  let err = null;
  try { await advance(room, deps); } catch (e) { err = e.message; console.warn("[boothDuo] advance:", e.message); }
  const lines = await recent(room, 14);
  const out = { lines: lines.filter((l) => l.seq > after), now: Date.now(), mode: aiMode(deps.env || process.env) };
  if (deps.debug) { out.err = err; out.aiErr = lastAiError; }
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

module.exports = { SCENES, advance, state, say, aiMode, buildPrompt, callAI, speakMs, audioWav, sample, wavMs, _reset: () => { memLines = []; memAudio = new Map(); memLease = new Map(); } };
