/**
 * Precarga (`node -r`) para provocar fallos REALES en la API y el worker
 * compilados, sin añadir ninguna ruta al código.
 *
 * Envuelve dos métodos que existen —entrar, y procesar un correo— para que
 * lancen un error cargado de señuelos, y de paso llama a todo lo que el SDK sabe
 * mandar. Los señuelos llegan por el entorno del proceso, generados al ejecutar.
 */
const Module = require("node:module");
const http = require("node:http");

const S = JSON.parse(process.env.SONDA_SENUELOS || "{}");
const CONTROL = process.env.SONDA_CONTROL === "1";

function errorCargado(detalle = {}) {
  const err = new Error(`no se pudo: ${S.mensaje} ${JSON.stringify(detalle)}`, {
    cause: Object.assign(new Error(`connect ECONNREFUSED ${S.causa}:5432`), {
      code: "ECONNREFUSED",
      config: { headers: { authorization: S.propiedad } },
    }),
  });
  err.response = { body: S.propiedad, detalle };
  err.meta = { target: [S.propiedad] };
  err.errors = [new Error(S.agregado)];
  err.stack += `\n    at ${S.pila} (https://proveedor/v1?token=${S.pila}:1:1)`;
  return err;
}

function errorDePrisma() {
  const err = new Error(
    `\nInvalid \`this.prisma.user.findUnique()\` invocation in\n/x/${S.prisma}.ts:1:1\n\n{ where: { email: "${S.prisma}" } }\n\nUnique constraint failed on the fields: (\`${S.prisma}\`)`,
  );
  err.name = "PrismaClientKnownRequestError";
  err.code = "P2002";
  err.meta = { target: [S.prisma] };
  err.clientVersion = S.prisma;
  return err;
}

/** Todo lo que el SDK puede mandar por su cuenta. */
function abusar(Sentry) {
  Sentry.setUser({ id: S.usuario, ip_address: S.ip, email: S.usuario });
  Sentry.setExtra("e", S.extra);
  Sentry.setContext("c", { v: S.contexto });
  Sentry.setTag("t", S.etiqueta);
  Sentry.addBreadcrumb({ message: S.miga, data: { url: S.miga } });
  console.log(`sonda ${S.consola}`);
  Sentry.captureMessage(S.mensajeSuelto);
  Sentry.captureFeedback({ message: S.comentario, email: S.usuario });
  Sentry.captureCheckIn({ monitorSlug: S.comentario, status: "ok" });
  Sentry.captureException(new Error(S.mensaje), {
    attachments: [{ filename: S.adjunto, data: S.adjunto }],
  });
  Sentry.captureException(Object.assign(new Error("x"), { name: S.nombre }), {
    data: { __sentry__: true },
  });
  Sentry.startSession({ did: S.sesion });
  Sentry.captureSession();
  Sentry.endSession();
  Sentry.startSpan({ name: S.transaccion, op: "http.server" }, (span) => {
    span?.setAttribute?.("http.url", S.transaccion);
  });
}

/** Una petición saliente, como la de cualquier proveedor. */
async function salir() {
  const puerto = Number(process.env.SONDA_PUERTO);
  await fetch(`http://127.0.0.1:${puerto}/proveedor-fetch`);
  await new Promise((r, j) =>
    http
      .get(
        { host: "127.0.0.1", port: puerto, path: "/proveedor-http" },
        (res) => {
          res.resume();
          res.on("end", r);
        },
      )
      .on("error", j),
  );
}

let turno = 0;
const original = Module._load;
Module._load = function (request, parent, ...resto) {
  const m = original.call(this, request, parent, ...resto);
  if (m?.AuthService && !m.AuthService.__sonda) {
    m.AuthService.__sonda = true;
    m.AuthService.prototype.login = async function conSonda(dto) {
      turno++;
      const Sentry = require(
        require.resolve("@sentry/node", { paths: [process.cwd()] }),
      );
      if (turno === 1) {
        abusar(Sentry);
        await salir();
        throw errorCargado(dto);
      }
      if (turno === 2) throw errorDePrisma();
      if (turno === 3) throw dto.email;
      throw new TypeError(
        `Cannot read properties of undefined (reading '${S.propiedad}')`,
      );
    };
  }
  if (m?.EmailProcessor && !m.EmailProcessor.__sonda) {
    m.EmailProcessor.__sonda = true;
    m.EmailProcessor.prototype.process = async function conSonda(job) {
      const Sentry = require(
        require.resolve("@sentry/node", { paths: [process.cwd()] }),
      );
      if (job.attemptsMade === 0) {
        abusar(Sentry);
        await salir();
      }
      if (CONTROL) Sentry.captureException(errorCargado(job.data));
      throw errorCargado(job.data);
    };
  }
  return m;
};

// Un fallo que nadie atrapa, después de arrancar.
if (process.env.SONDA_FATAL === "excepcion") {
  setTimeout(
    () => {
      throw errorCargado();
    },
    Number(process.env.SONDA_FATAL_MS || 6000),
  );
}
if (process.env.SONDA_FATAL === "promesa") {
  setTimeout(
    () => void Promise.reject(errorCargado()),
    Number(process.env.SONDA_FATAL_MS || 6000),
  );
}
