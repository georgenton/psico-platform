/**
 * GR-3 — giving the environment back, and being able to prove it.
 *
 * This lives apart from the gate script for one reason: a teardown that has
 * never failed in a test is a teardown nobody has checked. The gate itself is
 * a top-level script that boots servers and drives a browser — you cannot ask
 * it "what would you do if DROP DATABASE failed?" without actually breaking a
 * database. These functions take their effects as arguments, so that question
 * is a unit test.
 *
 * The rule they encode: sending a signal is not the same as a process having
 * stopped, and calling drop is not the same as a database being gone. Both
 * are verified, and a failure to verify is a failure of the run.
 */

/** Retaining the evidence database has to be asked for by name. */
export const RETAIN_ACK = "KEEP_GR3_EVIDENCE_FOR_DEBUG";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Has this child actually finished? Either an exit code or a fatal signal. */
function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

/**
 * Stop a child process and confirm it stopped.
 *
 * SIGTERM first, because a server that closes its listeners cleanly leaves no
 * half-written state. SIGKILL only if it will not go. Either way the answer
 * comes from observing `exitCode`/`signalCode`, never from the fact that a
 * signal was delivered — a process that ignores SIGTERM would otherwise be
 * reported as stopped while it still holds the port.
 *
 * @returns {Promise<{stopped: boolean, how: string}>}
 */
export async function stopProcess(
  child,
  { termWaitMs = 5_000, killWaitMs = 5_000, pollMs = 100, wait = sleep } = {},
) {
  if (!child) return { stopped: true, how: "not-started" };
  if (hasExited(child)) return { stopped: true, how: "already-exited" };

  try {
    child.kill("SIGTERM");
  } catch (err) {
    return { stopped: false, how: `sigterm-failed: ${err.message}` };
  }
  for (let waited = 0; waited < termWaitMs; waited += pollMs) {
    if (hasExited(child)) return { stopped: true, how: "sigterm" };
    await wait(pollMs);
  }

  try {
    child.kill("SIGKILL");
  } catch (err) {
    return { stopped: false, how: `sigkill-failed: ${err.message}` };
  }
  // SIGKILL cannot be caught, but the exit is still asynchronous — waiting is
  // what turns "we killed it" into "it is gone".
  for (let waited = 0; waited < killWaitMs; waited += pollMs) {
    if (hasExited(child)) return { stopped: true, how: "sigkill" };
    await wait(pollMs);
  }

  return { stopped: false, how: "still-alive-after-sigkill" };
}

/**
 * Refuse, before anything is created, to run in retain mode without the
 * acknowledgement. Checked at startup rather than at teardown: discovering
 * you cannot keep the database only after building it wastes the run, and
 * leaving one behind by accident is exactly what the ack exists to prevent.
 */
export function assertRetainAllowed({ keep, ack }) {
  if (!keep) return;
  if (ack !== RETAIN_ACK) {
    throw new Error(`--keep-database requires EVIDENCE_DEBUG_RETAIN_ACK=${RETAIN_ACK}`);
  }
}

/**
 * Drop the disposable database, or retain it deliberately.
 *
 * The three outcomes are kept apart because they mean different things. A
 * dropped database is a clean run. A retained one is a debugging decision
 * somebody made out loud. A drop that FAILED is neither — it is a leftover,
 * and the run must not report success over it.
 *
 * @returns {Promise<{dropped: boolean, retained: boolean, pass: boolean, reason: string|null}>}
 */
export async function teardownDatabase({ keep = false, ack = null, drop, dbName }) {
  if (keep) {
    // Re-checked here too: startup and teardown are far apart in time.
    if (ack !== RETAIN_ACK) {
      return {
        dropped: false,
        retained: false,
        pass: false,
        reason: "retain requested without the acknowledgement",
      };
    }
    // The NAME only. A connection string carries the superuser credential.
    return { dropped: false, retained: true, pass: true, reason: null };
  }

  try {
    await drop();
    return { dropped: true, retained: false, pass: true, reason: null };
  } catch (err) {
    return {
      dropped: false,
      retained: false,
      pass: false,
      reason: `drop failed: ${err.message}`,
    };
  }
}

/**
 * The one place that decides whether the command succeeded.
 *
 * A gate that passed and then failed to clean up has not passed: the next run
 * inherits a database it did not create. Both halves are reported so a reader
 * can tell which one broke, and neither is allowed to mask the other.
 */
export function finalGatePass({ primary, teardown }) {
  return Boolean(primary) && Boolean(teardown);
}

/** The report block, in one place, so the script cannot print a happier one. */
export function teardownReport({ api, web, db, primary }) {
  const teardownPass = api.stopped && web.stopped && db.pass;
  return {
    lines: [
      `PRIMARY_GATE_PASS=${Boolean(primary)}`,
      `API_PROCESS_STOPPED=${api.stopped}`,
      `WEB_PROCESS_STOPPED=${web.stopped}`,
      // The rate-limit store lived inside the API process; it is gone exactly
      // when that process is confirmed gone, and not a moment earlier.
      `RATE_LIMIT_STORE_REMOVED=${api.stopped}`,
      `EVIDENCE_DATABASE_DROPPED=${db.dropped}`,
      `EVIDENCE_DATABASE_RETAINED_FOR_DEBUG=${db.retained}`,
      `EVIDENCE_DATABASE_TEARDOWN_PASS=${db.pass}`,
      `TEARDOWN_PASS=${teardownPass}`,
      `FINAL_GATE_PASS=${finalGatePass({ primary, teardown: teardownPass })}`,
    ],
    teardownPass,
    finalPass: finalGatePass({ primary, teardown: teardownPass }),
  };
}
