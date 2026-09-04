/**
 * EEC-C01 — the five guided readings, walked end to end against a real API.
 *
 * This is the runtime half of the pre-publication evidence. It runs against an
 * ISOLATED environment where the five experiences are published and the kill
 * switch is on; it must never be pointed at production, and the publisher that
 * builds such an environment refuses a deployed box before it connects.
 *
 * What it proves that a unit test cannot: sessions really start, the ledger
 * really records steps, the recall really grades server-side and answers with
 * the approved sentence, a session really resumes under its own pin, and
 * finishing one reading really leaves the other four alone.
 *
 *   E2E_API_URL=http://localhost:3011 E2E_TOKEN=… node eec-c01-runtime-walk.mjs
 *
 * Every assertion is printed with PASS/FAIL and written to a JSON artifact, so
 * the evidence is readable without re-running it.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.E2E_API_URL ?? "http://localhost:3011";
/**
 * A FRESH reader per run.
 *
 * Re-using one turns "all five start at START" into a statement about the
 * previous run rather than about the product — the first attempt at this
 * script passed nothing for that reason. A new account per run makes the
 * independence assertions mean what they say.
 */
let TOKEN = process.env.E2E_TOKEN ?? null;
const BOOK = "emociones-en-construccion";
const CHAPTER = 1;
/**
 * The reader's unit, as THIS environment serves it.
 *
 * It is environment-local: derived from the legacy chapter's id, so a throwaway
 * database mints its own. Hard-coding production's here made the server refuse
 * the context as stale — correctly, since it describes a chapter that does not
 * exist there. It must be supplied per environment.
 */
const UNIT_KEY = process.env.E2E_UNIT_KEY;
if (!UNIT_KEY) {
  console.error(
    "E2E_UNIT_KEY is required: the reader's unit is environment-local.",
  );
  process.exit(2);
}
const PILOT = "eec-c1-cuerpo-antes-que-mente";

const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail: String(detail) });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function info(name, detail) {
  results.push({ name, status: "INFO", detail: String(detail) });
  console.log(`INFO  ${name} — ${detail}`);
}

const seen5xx = [];
async function api(path, init = {}) {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status >= 500) seen5xx.push(`${res.status} ${path}`);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body, text };
}

const cardStates = (pins) =>
  api("/guide/experiences/state", {
    method: "POST",
    body: JSON.stringify({
      pins,
      reader: { bookSlug: BOOK, chapterOrder: CHAPTER, unitKey: UNIT_KEY },
    }),
  });

async function walk(guide) {
  const pin = { guideKey: guide.guideKey, guideVersion: guide.guideVersion };
  const label = guide.guideKey.replace("eec-c1-", "");

  // ── START ────────────────────────────────────────────────────────────────
  const before = await cardStates([pin]);
  const beforeStatus = before.body?.items?.[0]?.status;
  check(`${label} · starts from START`, beforeStatus === "START", beforeStatus);

  const started = await api("/guide/sessions", {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: randomUUID(), ...pin }),
  });
  const session = started.body?.session;
  check(
    `${label} · session opens on its own pin`,
    session?.guideKey === guide.guideKey && session?.guideVersion === 1,
    `${session?.guideKey}@${session?.guideVersion}`,
  );
  const sessionId = session?.sessionId;
  const total = session?.totalSteps;
  check(`${label} · three steps, as the guide declares`, total === 3, total);

  // ── CONTINUE, seen from the chapter ──────────────────────────────────────
  const mid = await cardStates([pin]);
  check(
    `${label} · the chapter now offers CONTINUE`,
    mid.body?.items?.[0]?.status === "CONTINUE",
    mid.body?.items?.[0]?.status,
  );
  check(
    `${label} · resuming lands on the SAME pinned version`,
    mid.body?.items?.[0]?.resumePin?.guideKey === guide.guideKey &&
      mid.body?.items?.[0]?.resumePin?.guideVersion === 1,
    JSON.stringify(mid.body?.items?.[0]?.resumePin),
  );

  // ── The three steps ──────────────────────────────────────────────────────
  const steps = session?.currentStepKey ? [session.currentStepKey] : [];
  let current = session?.currentStepKey;
  let recallFeedback = null;

  for (let i = 0; i < 3 && current; i += 1) {
    const isRecall = current.startsWith("recordar-");
    if (isRecall) {
      // The wrong option first: the outcome must be REVIEW, with the approved
      // words for that branch and no sign of the right answer.
      const opts = await api(
        `/guide/sessions/state?guideKey=${guide.guideKey}&guideVersion=1`,
      );
      void opts;
      const wrong = await api(
        `/guide/sessions/${sessionId}/steps/${current}/recall`,
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: randomUUID(),
            selectedOptionKey: guide.wrongOption,
          }),
        },
      );
      recallFeedback = wrong.body?.feedback ?? null;
      check(
        `${label} · a wrong answer says REVIEW`,
        recallFeedback?.outcome === "REVIEW",
        recallFeedback?.outcome,
      );
      check(
        `${label} · and carries the approved sentence`,
        typeof recallFeedback?.message === "string" &&
          recallFeedback.message.length > 20,
        (recallFeedback?.message ?? "").slice(0, 60),
      );
      check(
        `${label} · the recall response hides the answer`,
        !wrong.text.includes("correctOptionKey"),
      );
      // Replay: same key, same verdict, same words.
      const key = randomUUID();
      const a = await api(
        `/guide/sessions/${sessionId}/steps/${current}/recall`,
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: key,
            selectedOptionKey: guide.wrongOption,
          }),
        },
      );
      const b = await api(
        `/guide/sessions/${sessionId}/steps/${current}/recall`,
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: key,
            selectedOptionKey: guide.wrongOption,
          }),
        },
      );
      check(
        `${label} · a replay returns the same verdict and the same words`,
        JSON.stringify(a.body?.feedback) === JSON.stringify(b.body?.feedback),
        JSON.stringify(b.body?.feedback?.outcome),
      );
    } else {
      await api(`/guide/sessions/${sessionId}/steps/${current}/complete`, {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: randomUUID() }),
      });
    }
    const state = await api(
      `/guide/sessions/state?guideKey=${guide.guideKey}&guideVersion=1`,
    );
    current = state.body?.session?.currentStepKey ?? null;
    if (current) steps.push(current);
  }

  // ── COMPLETE ─────────────────────────────────────────────────────────────
  const done = await api(`/guide/sessions/${sessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: randomUUID() }),
  });
  check(
    `${label} · completes`,
    done.status === 200 || done.status === 201,
    `${done.status} ${done.body?.session?.status ?? ""}`,
  );

  const after = await cardStates([pin]);
  check(
    `${label} · the chapter now says COMPLETED`,
    after.body?.items?.[0]?.status === "COMPLETED",
    after.body?.items?.[0]?.status,
  );

  return { label, pin, steps, recallFeedback };
}

async function registerReader() {
  const email = `eec-e2e-${randomUUID().slice(0, 8)}@example.test`;
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "E2eReader!2026x", name: "E2E" }),
  });
  const body = await res.json();
  if (!body?.accessToken) {
    throw new Error(`could not register a reader: ${res.status}`);
  }
  return body.accessToken;
}

async function main() {
  TOKEN = TOKEN ?? (await registerReader());

  // ── The route ────────────────────────────────────────────────────────────
  const route = await api(`/guide/route/${BOOK}/${CHAPTER}`);
  const guides = route.body?.available === true ? route.body.guides : [];
  check("the route offers exactly five readings", guides.length === 5, guides.length);
  check(
    "in the order the chapter teaches them",
    guides.map((g) => g.order).join(",") === "1,2,3,4,5",
    guides.map((g) => g.order).join(","),
  );
  check(
    "the historical pilot is not one of them",
    !guides.some((g) => g.guideKey === PILOT),
  );
  check(
    "each card carries a title, a description and a duration",
    guides.every(
      (g) => g.title && g.description && /\d/.test(g.estimatedMinutes ?? ""),
    ),
  );

  // Their initial verdicts are independent.
  const pins = guides.map((g) => ({
    guideKey: g.guideKey,
    guideVersion: g.guideVersion,
  }));
  const initial = await cardStates(pins);
  check(
    "all five start independently at START",
    (initial.body?.items ?? []).every((i) => i.status === "START"),
    (initial.body?.items ?? []).map((i) => i.status).join(","),
  );
  check(
    "one batched request answers for all five",
    (initial.body?.items ?? []).length === 5,
  );

  // ── Walk each one ────────────────────────────────────────────────────────
  // A deliberately wrong option per reading, taken from the catalog. Chosen
  // rather than guessed: an unknown key would be refused as invalid, and a
  // refusal is not the same evidence as a graded REVIEW.
  const WRONG = {
    "eec-c1-teorias-como-lentes": "opcion-todas-igual-validas",
    "eec-c1-rostro-como-pista": "opcion-diccionario-universal",
    "eec-c1-alarma-antes-del-relato": "opcion-amigdala-produce-miedo",
    "eec-c1-emocion-informa-no-manda": "opcion-emocion-determina",
    "eec-c1-construida-no-significa-falsa": "opcion-inventada",
  };

  const walked = [];
  for (const [i, g] of guides.entries()) {
    const wrongOption = WRONG[g.guideKey] ?? null;
    if (!wrongOption) {
      info(`${g.guideKey} · no wrong option known`, "skipping the recall branch");
    }
    walked.push(await walk({ ...g, wrongOption }));

    // Finishing this one must not have moved the others.
    const others = pins.filter((p) => p.guideKey !== g.guideKey);
    const state = await cardStates(others);
    const completedOthers = (state.body?.items ?? []).filter(
      (x) => x.status === "COMPLETED",
    ).length;
    check(
      `finishing ${g.guideKey.replace("eec-c1-", "")} left the others alone`,
      completedOthers === i,
      `${completedOthers} completed of ${others.length}`,
    );
  }

  check("all five were walked", walked.length === 5, walked.length);

  // ── The pilot's lineage still resolves ───────────────────────────────────
  // The pilot is not OFFERED by the new route — that is the point of the
  // route — but a session pinned to its exact version must still open and
  // resume. Nobody's run is stranded by a chapter gaining new readings.
  const pilotSession = await api("/guide/sessions", {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      guideKey: PILOT,
      guideVersion: 1,
    }),
  });
  check(
    "a session pinned to the historical pilot still opens",
    pilotSession.body?.session?.guideKey === PILOT &&
      pilotSession.body?.session?.guideVersion === 1,
    `${pilotSession.status} ${pilotSession.body?.session?.guideKey ?? pilotSession.body?.code ?? ""}`,
  );
  const pilotResume = await api(
    `/guide/sessions/state?guideKey=${PILOT}&guideVersion=1`,
  );
  check(
    "and it resumes under that exact pin",
    pilotResume.body?.session?.guideKey === PILOT,
    pilotResume.body?.session?.status ?? pilotResume.status,
  );
  check(
    "while the new route still does not offer it",
    !guides.some((g) => g.guideKey === PILOT),
  );

  // ── Runtime hygiene ──────────────────────────────────────────────────────
  check("no 5xx anywhere in the walk", seen5xx.length === 0, seen5xx.join(" · "));

  writeFileSync(
    join(HERE, "eec-c01-runtime-walk.result.json"),
    JSON.stringify(
      { api: API, book: BOOK, chapter: CHAPTER, results, failures },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n${results.filter((r) => r.status === "PASS").length} PASS · ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
