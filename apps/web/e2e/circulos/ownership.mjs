/**
 * What a stack run owns, and how a LATER process proves it before signalling.
 *
 * `--down` runs minutes or hours after `--keep`, in a different process, with
 * nothing in memory. All it has is a state file naming pids. A pid alone is not
 * an identity — the OS recycles them — so a cleanup script that trusts one is a
 * cleanup script that eventually kills somebody's editor.
 *
 * The decision is separated from the doing on purpose: `planTeardown` is a pure
 * function of (recorded state, what the OS says now), so the rule can be tested
 * without starting or killing anything.
 */

/**
 * Read `ps -p <pid> -o state=,lstart=` into a start time, or null.
 *
 * Null means "there is no process here to signal", and a ZOMBIE counts as
 * null: it is a corpse, not a process. These services are the run's children
 * and nothing ever `wait`s on them, so once killed they sit in the process
 * table until the parent exits — and `ps -p` keeps listing them. Reading that
 * as "alive" made teardown wait out the full grace period on each service and
 * then announce "STILL RUNNING" about four processes that were already dead,
 * which is how a warning becomes noise nobody reads.
 *
 * The start time is whitespace-normalised because `ps` pads a single-digit day
 * ("Sun Sep  7"), and the recorded value goes through this same function.
 */
export function readProcessStart(psOutput) {
  const text = (psOutput ?? "").trim();
  if (text === "") return null;
  const [state, ...rest] = text.split(/\s+/);
  if (state.startsWith("Z")) return null;
  const started = rest.join(" ").trim();
  return started === "" ? null : started;
}

/**
 * Does this recorded service still refer to the process we started?
 *
 * The pair (pid, start time) is what makes it an identity. If the pid is alive
 * but started at a different moment, it is somebody else's process wearing a
 * number we used to have, and it must be left alone.
 */
export function stillOurs(service, observedStart) {
  if (observedStart === null || observedStart === undefined) return false;
  return observedStart === service.lstart;
}

/**
 * Decide what to do with each recorded service.
 *
 * `probe(pid)` returns the process's start time as the OS reports it, or null
 * when nothing is running under that pid.
 *
 *   gone    — nothing to do
 *   stop    — ours, still running: signal its process group
 *   spare   — alive but NOT ours: a reused pid, leave it alone
 */
export function planTeardown(state, probe) {
  const plan = [];
  for (const service of state?.services ?? []) {
    const observed = probe(service.pid);
    if (observed === null || observed === undefined) {
      plan.push({ service, action: "gone" });
    } else if (stillOurs(service, observed)) {
      plan.push({ service, action: "stop" });
    } else {
      plan.push({ service, action: "spare" });
    }
  }
  return plan;
}

/**
 * The containers and directories a run owns.
 *
 * Only what the state file names. Never a pattern: `circulos-e2e-*` would also
 * match a concurrent run's containers, and removing those is the same mistake
 * as killing a reused pid.
 */
export function ownedResources(state) {
  return {
    containers: [...(state?.containers ?? [])],
    directories: [state?.work, state?.logs].filter(Boolean),
  };
}
