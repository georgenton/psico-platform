/**
 * How the walk observes the stores it is testing against.
 *
 * The scenarios are the same wherever they run; what differs is how this
 * process reaches the database and the queue. Keeping that difference HERE,
 * behind three functions, is what makes "run the same walk against Railway"
 * a transport change rather than a second test framework.
 *
 *   local    — Docker containers this machine owns: `docker exec`.
 *   railway  — a hosted environment whose Postgres and Redis are on a PRIVATE
 *              network. Commands run INSIDE the API container over
 *              `railway ssh`, so neither store is ever published. Publishing
 *              them to run a test would be a lasting hole opened for a
 *              temporary convenience.
 *
 * Statements travel base64-encoded. Not for secrecy — they cross a shell and
 * then a `node -e`, and base64 is the only alphabet that survives both without
 * a quoting rule that eventually meets a query containing the wrong character.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

// ── local: the containers this machine owns ─────────────────────────────────

function localTransport(env) {
  const pgContainer = env.CIRCULOS_E2E_PG_CONTAINER;
  const pgDatabase = env.CIRCULOS_E2E_PG_DATABASE;
  const work = env.CIRCULOS_E2E_WORK;
  const redisUrl = env.CIRCULOS_E2E_REDIS_URL;

  const apiRequire = createRequire(join(work, "apps/api/package.json"));
  const { Queue } = apiRequire("bullmq");

  return {
    kind: "local",
    sql(text) {
      return execFileSync(
        "docker",
        ["exec", pgContainer, "psql", "-U", "postgres", "-d", pgDatabase, "-tAc", text],
        { encoding: "utf8" },
      ).trim();
    },
    /**
     * Put a job on the queue and hand back a way to ask how it is doing.
     *
     * Each call opens its own short-lived queue and closes it before
     * returning. The first cut kept the `Job` object from `add` and asked IT
     * for the state — while closing the queue it came from, unawaited, in a
     * `finally`. That reads fine and is a race: the handle carries the
     * connection it was created with, so whether `getState()` works depends on
     * whether the close has landed yet. It won on this machine, won in CI for
     * a while, and then lost — both worker scenarios failing with `Connection
     * is closed.`, which names the symptom and hides the cause.
     *
     * So nothing outlives its connection: the id is the only thing carried
     * across, and each question opens and closes its own.
     */
    async enqueue(queueName, jobName, data) {
      const queue = new Queue(queueName, { connection: { url: redisUrl } });
      let jobId;
      try {
        const job = await queue.add(jobName, data, {
          removeOnComplete: false,
          removeOnFail: false,
        });
        jobId = job.id;
      } finally {
        await queue.close();
      }
      return {
        async state() {
          const q = new Queue(queueName, { connection: { url: redisUrl } });
          try {
            const job = await q.getJob(jobId);
            return job ? job.getState() : "missing";
          } finally {
            await q.close();
          }
        },
      };
    },
    resetRateLimits() {
      const container = pgContainer.replace("-pg-", "-redis-");
      try {
        execFileSync(
          "docker",
          [
            "exec",
            container,
            "sh",
            "-lc",
            "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del > /dev/null",
          ],
          { stdio: "pipe" },
        );
      } catch {
        /* nothing to clear */
      }
    },
  };
}

/**
 * Run a node snippet INSIDE the hosted API container and return what it framed.
 *
 * The container is where the private network and the deployment's own secrets
 * already are, so anything that needs either — a query against a Postgres with
 * no public proxy, or an HMAC keyed by `CLIENT_ATTESTATION_SECRET` — runs there
 * and answers with a RESULT rather than with the material it used. Nothing is
 * published and no secret crosses the wire to this machine.
 *
 * Snippets travel base64-encoded: they cross a shell and then a `node -e`, and
 * base64 is the only alphabet that survives both intact.
 */
export function railwayNode(env, snippet) {
  const out = execFileSync(
    "railway",
    [
      "ssh",
      "--project", env.CIRCULOS_E2E_RAILWAY_PROJECT,
      "--environment", env.CIRCULOS_E2E_RAILWAY_ENVIRONMENT,
      "--service", env.CIRCULOS_E2E_RAILWAY_SERVICE,
      `cd /app/apps/api && node -e "eval(Buffer.from('${b64(snippet)}','base64').toString())"`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300_000 },
  );
  // `railway ssh` prefixes a line about the key it used, so every snippet
  // frames its own answer and it can be found whatever else is printed.
  const m = /<<<E2E([\s\S]*?)E2E>>>/.exec(out);
  if (!m) {
    throw new Error(`no framed answer from the container:\n${out.slice(-400)}`);
  }
  return m[1].trim();
}

// ── railway: inside the API container, over the private network ─────────────

function railwayTransport(env) {
  const inContainer = (snippet) => railwayNode(env, snippet);

  return {
    kind: "railway",
    sql(text) {
      const snippet = `
        const {Client}=require('pg');
        const q=Buffer.from('${b64(text)}','base64').toString();
        const c=new Client({connectionString:process.env.DATABASE_URL});
        c.connect()
         .then(()=>c.query(q))
         .then(r=>{
           const rows=(r.rows||[]).map(row=>Object.values(row).map(v=>v===null?'':String(v)).join('|'));
           console.log('<<<E2E'+rows.join('\\n')+'E2E>>>');
           return c.end();
         })
         .catch(e=>{console.error('SQLERR '+e.message);process.exit(1);});
      `;
      return inContainer(snippet);
    },
    async enqueue(queueName, jobName, data) {
      const snippet = `
        const {Queue}=require('bullmq');
        const q=new Queue(${JSON.stringify(queueName)},{connection:{url:process.env.REDIS_URL}});
        q.add(${JSON.stringify(jobName)}, JSON.parse(Buffer.from('${b64(JSON.stringify(data))}','base64').toString()), {removeOnComplete:false,removeOnFail:false})
         .then(j=>{console.log('<<<E2E'+j.id+'E2E>>>');return q.close();})
         .catch(e=>{console.error('QERR '+e.message);process.exit(1);});
      `;
      const jobId = inContainer(snippet);
      return {
        async state() {
          const s = `
            const {Queue}=require('bullmq');
            const q=new Queue(${JSON.stringify(queueName)},{connection:{url:process.env.REDIS_URL}});
            q.getJob(${JSON.stringify(jobId)})
             .then(j=>j?j.getState():'missing')
             .then(st=>{console.log('<<<E2E'+st+'E2E>>>');return q.close();})
             .catch(e=>{console.error('QERR '+e.message);process.exit(1);});
          `;
          return inContainer(s);
        },
      };
    },
    resetRateLimits() {
      const snippet = `
        const IORedis=require('ioredis');
        const r=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
        (async()=>{
          let cursor='0', n=0;
          do {
            const [next,keys]=await r.scan(cursor,'MATCH','throttle:*','COUNT',500);
            cursor=next;
            if(keys.length){ await r.del(...keys); n+=keys.length; }
          } while(cursor!=='0');
          console.log('<<<E2E'+n+'E2E>>>');
          await r.quit();
        })().catch(e=>{console.error('RERR '+e.message);process.exit(1);});
      `;
      try {
        inContainer(snippet);
      } catch {
        /* nothing to clear */
      }
    },
  };
}

export function makeTransport(env = process.env) {
  return env.CIRCULOS_E2E_TRANSPORT === "railway"
    ? railwayTransport(env)
    : localTransport(env);
}
