import type { PrismaClient } from "@prisma/client";

import {
  assertDatabaseIsNotReal,
  assertVisualFixtureAllowed,
} from "./visual-fixture";
import type { PsicoEnvironment } from "../shared/psico-environment";

/**
 * Personas sintéticas de QA.
 *
 * ── Por qué existe esto, y por qué NO está en el fixture ───────────────────
 *
 * El fixture visual (`visual-fixture.ts`) llena el CATÁLOGO y declara, como
 * propiedad suya, que «nunca crea cuentas y nunca toca una existente, así que
 * no puede darle a nadie un plan, un rol ni un permiso». Esa frase es la que lo
 * hace fácil de revisar, y no conviene romperla metiéndole cuentas.
 *
 * Pero una auditoría visual que sólo dispone de cuentas FREE sin desbloquear
 * ve muros de pago y rejas, no el producto. Hacen falta personas con estado:
 * alguien con PRO para el lector premium, Patrones y Voz; alguien que atraviese
 * de verdad la reja del cifrado; alguien con rol AUTHOR para `/autor/*`.
 *
 * Así que esto es una herramienta aparte con las MISMAS barreras, y el reparto
 * queda claro: el fixture pone las estanterías, esto pone a quien las mira.
 *
 * ── Lo que nunca hace ─────────────────────────────────────────────────────
 *
 *   · No toca ninguna cuenta que no sea suya. Las suyas son exactamente estas
 *     cuatro direcciones, y antes de escribir comprueba que lo que va a tocar
 *     está en la lista. Una persona real no puede acabar con rol AUTHOR por un
 *     error de esta herramienta.
 *   · No trae una contraseña por defecto. Una cuenta sintética con contraseña
 *     conocida y fija es una credencial viva; la contraseña llega por entorno y
 *     no se imprime nunca.
 *   · No rota la contraseña de una cuenta que ya existe salvo que se pida.
 *   · No crea contenido personal: ni reflexiones, ni conversaciones, ni mapa.
 *     Sólo la cuenta y el estado mínimo para poder entrar y mirar.
 */

/** Las direcciones viven en `.test` (RFC 2606): nadie recibe correo ahí. */
const DOMINIO = "psico.test";

export interface QaPersona {
  /** Nombre corto con el que se la cita en el informe. */
  readonly slug: "QA_FREE" | "QA_PRO" | "QA_CRYPTO" | "QA_AUTHOR";
  readonly email: string;
  readonly name: string;
  readonly role: "USER" | "AUTHOR";
  readonly plan: "FREE" | "PRO";
  /** Para qué existe. Se imprime en el informe; no contiene datos. */
  readonly para: string;
}

export const QA_PERSONAS: readonly QaPersona[] = [
  {
    slug: "QA_FREE",
    email: `qa-free@${DOMINIO}`,
    name: "QA Free",
    role: "USER",
    plan: "FREE",
    para: "muros de pago, estados FREE, biblioteca, perfil",
  },
  {
    slug: "QA_PRO",
    email: `qa-pro@${DOMINIO}`,
    name: "QA Pro",
    role: "USER",
    plan: "PRO",
    para: "lector PRO, Patrones, Voz, herramientas premium",
  },
  {
    slug: "QA_CRYPTO",
    email: `qa-crypto@${DOMINIO}`,
    name: "QA Cripto",
    role: "USER",
    plan: "PRO",
    para: "Reflexiones, Diario y Eco al otro lado de la reja",
  },
  {
    slug: "QA_AUTHOR",
    email: `qa-author@${DOMINIO}`,
    name: "QA Autora",
    role: "AUTHOR",
    plan: "PRO",
    para: "/autor/*",
  },
] as const;

export const QA_PERSONA_EMAILS: readonly string[] = QA_PERSONAS.map(
  (p) => p.email,
);

export const QA_PERSONAS_PASSWORD_VAR = "QA_PERSONAS_PASSWORD";

export const QA_PERSONAS_NO_PASSWORD = "QA_PERSONAS_NO_PASSWORD";
export const QA_PERSONAS_WEAK_PASSWORD = "QA_PERSONAS_WEAK_PASSWORD";
export const QA_PERSONAS_FOREIGN_ACCOUNT = "QA_PERSONAS_FOREIGN_ACCOUNT";

/** Mínimo que pide el registro del producto. Aquí se exige lo mismo. */
const MIN_PASSWORD = 10;

/**
 * La contraseña llega por entorno o no hay ejecución.
 *
 * Sin valor por defecto a propósito: un valor por defecto en el repositorio es
 * una credencial publicada el día que alguien apunte la herramienta a un sitio
 * que importe.
 */
export function readPersonasPassword(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env[QA_PERSONAS_PASSWORD_VAR];
  if (!raw || !raw.trim()) throw new Error(QA_PERSONAS_NO_PASSWORD);
  if (raw.length < MIN_PASSWORD) throw new Error(QA_PERSONAS_WEAK_PASSWORD);
  return raw;
}

/**
 * La cuarta barrera, propia de esta herramienta: sólo sus cuentas.
 *
 * Las tres del fixture responden «¿es este sitio de pruebas?». Esta responde
 * «¿es esta fila mía?», que es la pregunta que protege a una persona real de un
 * `upsert` con el correo equivocado.
 */
export function assertIsOwnPersona(email: string): void {
  if (!QA_PERSONA_EMAILS.includes(email.trim().toLowerCase())) {
    throw new Error(QA_PERSONAS_FOREIGN_ACCOUNT);
  }
}

export interface QaPersonaOutcome {
  slug: QaPersona["slug"];
  /** La dirección NO se incluye: el informe va a stdout. */
  role: QaPersona["role"];
  plan: QaPersona["plan"];
  outcome: "created" | "updated" | "would-create" | "would-update";
  passwordRotated: boolean;
  /**
   * El id sí se publica, y a propósito.
   *
   * Autorizar a una persona como organizadora de Círculos en QA se hace
   * escribiendo su id en `CIRCLES_PILOT_USER_IDS`, así que quien ejecuta esto
   * necesita leerlo. No es un dato personal: la cuarta barrera garantiza que
   * sólo puede ser una de estas cuatro cuentas sintéticas, que viven en un
   * dominio donde nadie recibe correo. Nulo en seco, porque en seco no existe.
   */
  userId: string | null;
}

export interface QaPersonasReport {
  environment: PsicoEnvironment;
  applied: boolean;
  accounts: { users: number; syntheticDomains: number };
  personas: QaPersonaOutcome[];
}

export interface ApplyPersonasOptions {
  apply?: boolean;
  rotatePasswords?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Inyectable para las pruebas: hashear de verdad es lento. */
  hash?: (plain: string) => Promise<string>;
}

/**
 * Corre todas las barreras y luego escribe. `apply: false` —el valor por
 * defecto— para después de las barreras y cuenta qué haría, sin tocar una fila.
 */
export async function applyQaPersonas(
  prisma: PrismaClient,
  opts: ApplyPersonasOptions = {},
): Promise<QaPersonasReport> {
  const env = opts.env ?? process.env;
  const apply = opts.apply ?? false;
  const rotate = opts.rotatePasswords ?? false;

  const environment = assertVisualFixtureAllowed(env);
  // La contraseña se comprueba ANTES de tocar la base: es una comprobación
  // local y barata, y así quien la olvidó recibe `QA_PERSONAS_NO_PASSWORD` en
  // vez de un fallo de conexión saneado a `UNEXPECTED_ERROR`, que no dice qué
  // arreglar. Va después de la barrera de postura, que no consulta nada, así
  // que no adelanta ninguna decisión de seguridad.
  const password = readPersonasPassword(env);
  const accounts = await assertDatabaseIsNotReal(prisma, env);

  const report: QaPersonasReport = {
    environment,
    applied: apply,
    accounts,
    personas: [],
  };

  const hash =
    opts.hash ??
    (async (plain: string) => {
      const bcrypt = await import("bcryptjs");
      return bcrypt.hash(plain, 10);
    });

  for (const persona of QA_PERSONAS) {
    assertIsOwnPersona(persona.email);

    const existente = await prisma.user.findUnique({
      where: { email: persona.email },
      select: { id: true },
    });

    if (!apply) {
      report.personas.push({
        slug: persona.slug,
        role: persona.role,
        plan: persona.plan,
        outcome: existente ? "would-update" : "would-create",
        passwordRotated: false,
        userId: null,
      });
      continue;
    }

    const passwordHash = await hash(password);
    // `cryptoSalt` sólo al crear: rotarlo dejaría ilegible cualquier reflexión
    // que esa persona hubiera escrito en una auditoría anterior.
    const { randomBytes } = await import("node:crypto");
    const cryptoSalt = randomBytes(16).toString("base64url");

    const user = await prisma.user.upsert({
      where: { email: persona.email },
      create: {
        email: persona.email,
        name: persona.name,
        passwordHash,
        authProvider: "LOCAL",
        emailVerified: true,
        cryptoSalt,
        role: persona.role,
        plan: persona.plan,
        profile: { create: {} },
      },
      update: {
        name: persona.name,
        role: persona.role,
        plan: persona.plan,
        // Nunca se rota en silencio: una auditoría en marcha con esa sesión
        // abierta se quedaría fuera sin saber por qué.
        ...(rotate ? { passwordHash } : {}),
      },
      select: { id: true },
    });

    // El onboarding, ya cerrado: la auditoría entra al panel y no al recorrido
    // de bienvenida, que tiene su propia cobertura.
    // Los mismos dos campos que usa `scripts/seed-demo-users.mjs`, que es el
    // mecanismo canónico para cuentas sintéticas: cerrar el onboarding y el
    // recorrido guiado, para que la auditoría entre al panel y no a la
    // bienvenida — que tiene su propia cobertura.
    const ahora = new Date();
    await prisma.onboardingState.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        onboardingCompletedAt: ahora,
        tourCompletedAt: ahora,
      },
      update: {},
    });

    report.personas.push({
      slug: persona.slug,
      role: persona.role,
      plan: persona.plan,
      outcome: existente ? "updated" : "created",
      passwordRotated: apply && (!existente || rotate),
      userId: user.id,
    });
  }

  return report;
}
