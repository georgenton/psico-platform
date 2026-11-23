import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every workflow step that compiles the monorepo through turbo
 * (`turbo run typecheck`, `turbo run build`) must run with an explicit heap.
 *
 * WHY. The measurement lives in the comment above the Typecheck step of
 * `.github/workflows/ci.yml`; it is not repeated here. In short: on a cold
 * runner `@psico/api` typechecks at ~2.86 GiB and builds at ~3.02 GiB, above
 * Node's default ceiling. A step without the flag stays green for as long as
 * the turbo cache hits, and dies with `exit 134` the first time `apps/api`
 * changes. That is exactly how Release failed on af671664 (#870) while CI,
 * which already carried the flag, passed the same code.
 *
 * WHAT IT DOES NOT DO. It does not weaken any gate: same files, same compiler,
 * and a type error still fails the job. It only checks that the heap is there.
 *
 * WHY TEXT AND NOT A YAML PARSER. No workspace declares one, and a dependency
 * for a ratchet is more than this needs. The reader below understands the
 * shape the workflows in this repo actually have (block mappings, two-space
 * indent) and resolves the env a step really sees: step over job over
 * workflow. It checks itself in both directions — it must find the steps we
 * know exist, and it must flag fixtures that lack the flag — so a reader that
 * silently stops matching fails instead of passing on nothing.
 */

/** The floor the comment in ci.yml justifies. Raising it is not the fix. */
const MIN_HEAP_MB = 6144;

const root = join(__dirname, "..", "..", "..");
const workflowsDir = join(root, ".github", "workflows");

/** A `run:` that compiles through turbo. Only the run value is tested. */
const COMPILES = /\bturbo\b.*\b(typecheck|build)\b/;

type Scope = "step" | "job" | "workflow";

interface CompileStep {
  workflow: string;
  job: string;
  name: string;
  /** The `--max-old-space-size` the step actually runs with, or null. */
  heapMb: number | null;
  /** Where NODE_OPTIONS came from, or null if nothing sets it. */
  scope: Scope | null;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isCode(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && !t.startsWith("#");
}

/** The children of the `env:` key that sits exactly at `keyIndent`. */
function envBlock(lines: string[], keyIndent: number): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (!isCode(line)) continue;
    const indent = indentOf(line);
    if (inside) {
      if (indent > keyIndent) {
        out.push(line);
        continue;
      }
      inside = false;
    }
    if (indent === keyIndent && /^env:\s*$/.test(line.trim())) inside = true;
  }
  return out;
}

/**
 * undefined — this level does not set NODE_OPTIONS (look further out);
 * null — it sets NODE_OPTIONS without a heap flag (that wins, and is wrong);
 * number — the heap it sets.
 */
function heapOf(env: string[]): number | null | undefined {
  const line = env.find((l) => /^NODE_OPTIONS:/.test(l.trim()));
  if (line === undefined) return undefined;
  const m = line.match(/--max-old-space-size=(\d+)/);
  return m ? Number(m[1]) : null;
}

/** The lines of a step's `run:` value, inline or block scalar. */
function runValue(step: string[], keyIndent: number): string[] {
  const at = step.findIndex(
    (l) => indentOf(l) === keyIndent && /^run:/.test(l.trim()),
  );
  if (at < 0) return [];
  const inline = step[at].trim().replace(/^run:\s*/, "");
  if (!/^[|>][-+]?$/.test(inline)) return [inline];
  const out: string[] = [];
  for (const line of step.slice(at + 1)) {
    if (line.trim().length > 0 && indentOf(line) <= keyIndent) break;
    if (isCode(line)) out.push(line.trim());
  }
  return out;
}

function compileSteps(workflow: string, text: string): CompileStep[] {
  const lines = text.split("\n");
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt < 0) return [];
  const workflowHeap = heapOf(envBlock(lines.slice(0, jobsAt), 0));

  // Job ids sit at indent 2 under `jobs:`; a top-level key ends the section.
  let end = lines.length;
  const jobStarts: { id: string; at: number }[] = [];
  for (let i = jobsAt + 1; i < lines.length; i++) {
    if (isCode(lines[i]) && indentOf(lines[i]) === 0) {
      end = i;
      break;
    }
    const m = lines[i].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) jobStarts.push({ id: m[1], at: i });
  }

  const found: CompileStep[] = [];
  jobStarts.forEach(({ id, at }, j) => {
    const job = lines.slice(at + 1, jobStarts[j + 1]?.at ?? end);
    const jobHeap = heapOf(envBlock(job, 4));

    const stepsAt = job.findIndex((l) => /^ {4}steps:\s*$/.test(l));
    if (stepsAt < 0) return;
    const after = job.slice(stepsAt + 1);
    const first = after.find((l) => /^\s*- /.test(l));
    if (first === undefined) return;
    const itemIndent = indentOf(first);

    // Split into steps; the dash line is rewritten so its key lines up with
    // the step's other keys at itemIndent + 2.
    const steps: string[][] = [];
    for (const line of after) {
      if (isCode(line) && indentOf(line) < itemIndent) break;
      if (indentOf(line) === itemIndent && /^\s*- /.test(line)) {
        steps.push([line.replace(/^(\s*)- /, "$1  ")]);
      } else if (steps.length > 0) {
        steps[steps.length - 1].push(line);
      }
    }

    const keyIndent = itemIndent + 2;
    for (const step of steps) {
      if (!runValue(step, keyIndent).some((l) => COMPILES.test(l))) continue;
      const nameLine = step.find(
        (l) => indentOf(l) === keyIndent && /^name:/.test(l.trim()),
      );
      const stepHeap = heapOf(envBlock(step, keyIndent));
      const [heapMb, scope]: [number | null, Scope | null] =
        stepHeap !== undefined
          ? [stepHeap, "step"]
          : jobHeap !== undefined
            ? [jobHeap, "job"]
            : workflowHeap !== undefined
              ? [workflowHeap, "workflow"]
              : [null, null];
      found.push({
        workflow,
        job: id,
        name: nameLine?.trim().replace(/^name:\s*/, "") ?? "(unnamed)",
        heapMb,
        scope,
      });
    }
  });
  return found;
}

function allCompileSteps(): CompileStep[] {
  return readdirSync(workflowsDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .flatMap((f) =>
      compileSteps(f, readFileSync(join(workflowsDir, f), "utf8")),
    );
}

describe("cada paso que compila con turbo lleva un montón explícito", () => {
  const steps = allCompileSteps();

  it("encuentra los pasos que sabemos que existen (control positivo)", () => {
    // If the reader stops matching, the next test would pass on nothing.
    const where = steps.map((s) => `${s.workflow} › ${s.job}`);
    expect(where).toEqual(
      expect.arrayContaining([
        "ci.yml › typecheck",
        "ci.yml › build",
        "release.yml › ci",
        "openapi-diff.yml › diff",
      ]),
    );
    expect(where.filter((w) => w === "release.yml › ci")).toHaveLength(2);
  });

  it(`todos corren con --max-old-space-size >= ${MIN_HEAP_MB}`, () => {
    const offenders = steps
      .filter((s) => s.heapMb === null || s.heapMb < MIN_HEAP_MB)
      .map(
        (s) =>
          `${s.workflow} › ${s.job} › ${s.name}: ` +
          (s.scope === null
            ? "sin NODE_OPTIONS"
            : `NODE_OPTIONS (${s.scope}) = ${s.heapMb ?? "sin --max-old-space-size"}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe("el lector de workflows (control contrario)", () => {
  const wrap = (body: string) =>
    ["name: X", "on: push", "jobs:", body].join("\n");

  it("marca un paso sin NODE_OPTIONS", () => {
    const [step] = compileSteps(
      "f.yml",
      wrap(
        [
          "  ci:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - name: Typecheck",
          "        run: pnpm turbo run typecheck",
          "        env:",
          "          TURBO_TOKEN: x",
        ].join("\n"),
      ),
    );
    expect(step).toMatchObject({
      name: "Typecheck",
      heapMb: null,
      scope: null,
    });
  });

  it("hereda el del trabajo, y el del paso lo sustituye", () => {
    const steps = compileSteps(
      "f.yml",
      wrap(
        [
          "  diff:",
          "    env:",
          "      NODE_OPTIONS: --max-old-space-size=6144",
          "    steps:",
          "      - name: Build",
          "        run: pnpm turbo run build --filter=@psico/api",
          "      - name: Typecheck",
          "        run: |",
          "          pnpm turbo run typecheck",
          "        env:",
          "          NODE_OPTIONS: --enable-source-maps",
        ].join("\n"),
      ),
    );
    expect(steps).toEqual([
      expect.objectContaining({ name: "Build", heapMb: 6144, scope: "job" }),
      expect.objectContaining({
        name: "Typecheck",
        heapMb: null,
        scope: "step",
      }),
    ]);
  });

  it("no confunde una clave de caché con un paso que compila", () => {
    const steps = compileSteps(
      "f.yml",
      wrap(
        [
          "  typecheck:",
          "    steps:",
          "      - name: Cache Turbo",
          "        uses: actions/cache@v4",
          "        with:",
          "          key: linux-turbo-typecheck-abc",
          "      # pnpm turbo run typecheck, in a comment",
          "      - name: Lint",
          "        run: pnpm turbo run lint",
        ].join("\n"),
      ),
    );
    expect(steps).toEqual([]);
  });

  it("lee el del workflow cuando nada más lo fija", () => {
    const text = [
      "name: X",
      "env:",
      "  NODE_OPTIONS: --max-old-space-size=8192",
      "jobs:",
      "  ci:",
      "    steps:",
      "      - run: pnpm turbo run build",
    ].join("\n");
    expect(compileSteps("f.yml", text)).toEqual([
      expect.objectContaining({
        heapMb: 8192,
        scope: "workflow",
        name: "(unnamed)",
      }),
    ]);
  });
});
