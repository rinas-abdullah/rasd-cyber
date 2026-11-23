"use strict";
// Booth duo show: scripted flow, visitor interjections, AI path and AI fallback.
const test = require("node:test");
const assert = require("node:assert");
const duo = require("../backend/services/boothDuo");

const NOKEY = {};
let t = Date.now();
const later = () => (t += 60000);

test("scripted scene plays in order, ends with a lesson, then the next scene starts", async () => {
  duo._reset();
  const sc = duo.SCENES[0];
  for (let i = 0; i < sc.lines.length; i++) assert.equal(await duo.advance("t1", { env: NOKEY, now: later }), true);
  const s = await duo.state("t1", 0, { env: NOKEY, now: later });
  const all = s.lines;
  assert.deepEqual(all.slice(0, sc.lines.length).map((l) => [l.speaker, l.text]), sc.lines);
  const end = all.find((l) => l.speaker === "system");
  assert.equal(end.meta.outcome, sc.outcome);
  assert.equal(end.text, sc.lesson);
  await duo.advance("t1", { env: NOKEY, now: later });
  const next = (await duo.state("t1", end.seq, { env: NOKEY, now: () => 0 })).lines[0];
  assert.equal(next.meta.start, true);
  assert.equal(next.meta.scene, 1);
});

test("does not advance before the last line has been spoken", async () => {
  duo._reset();
  assert.equal(await duo.advance("t2", { env: NOKEY }), true);
  assert.equal(await duo.advance("t2", { env: NOKEY }), false);
});

test("a visitor line gets a reply from the addressed character, then the script resumes", async () => {
  duo._reset();
  await duo.advance("t3", { env: NOKEY, now: later }); // hacker line 0
  assert.equal(await duo.say("t3", "nora", "  لا تصدقينه يا نورة  "), true);
  await duo.advance("t3", { env: NOKEY, now: later });
  await duo.advance("t3", { env: NOKEY, now: later });
  const lines = (await duo.state("t3", 0, { env: NOKEY, now: () => 0 })).lines;
  assert.equal(lines[1].speaker, "visitor");
  assert.equal(lines[1].text, "لا تصدقينه يا نورة");
  assert.equal(lines[2].speaker, "nora");
  assert.equal(lines[2].meta.react, true);
  assert.deepEqual([lines[3].speaker, lines[3].text], duo.SCENES[0].lines[1]);
});

test("Gemini mode uses the model's line and ends the scene on its outcome", async () => {
  duo._reset();
  const env = { GEMINI_API_KEY: "AIza-test" };
  const calls = [];
  const fetch = async (url, opt) => {
    calls.push({ url, opt });
    const out = calls.length === 2 ? { text: "خلاص، كلمة السر: بطاطس مقلية", outcome: "hacked" } : { text: "هلا نورة، أنا من الدعم الفني", outcome: "continue" };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }) };
  };
  await duo.advance("t4", { env, now: later, fetch });
  await duo.advance("t4", { env, now: later, fetch });
  await duo.advance("t4", { env, now: later, fetch });
  const lines = (await duo.state("t4", 0, { env, now: () => 0, fetch })).lines;
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(calls[0].opt.headers["x-goog-api-key"], "AIza-test");
  assert.equal(lines[0].text, "هلا نورة، أنا من الدعم الفني");
  assert.equal(lines[1].speaker, "nora");
  assert.equal(lines[2].speaker, "system");
  assert.equal(lines[2].meta.outcome, "hacked");
});

test("AI failure falls back to the scripted line", async () => {
  duo._reset();
  const fetch = async () => ({ ok: false, status: 500 });
  await duo.advance("t5", { env: { GEMINI_API_KEY: "AIza-x" }, now: later, fetch });
  const lines = (await duo.state("t5", 0, { env: NOKEY, now: () => 0 })).lines;
  assert.equal(lines[0].text, duo.SCENES[0].lines[0][1]);
});
