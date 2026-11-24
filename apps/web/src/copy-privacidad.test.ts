import { describe, expect, it } from "vitest";

import { bloquesDe, frase, leerBloques } from "./copy-bloques.testing";

/**
 * Lo que sólo es cierto del diario no se le promete a Eco.
 *
 * POR QUÉ. Acceso, registro, Seguridad, la reja de Eco, el modal del Mapa y el
 * componente común de privacidad decían de las conversaciones con Eco lo mismo
 * que del diario: «solo tú puedes verlos, ni siquiera nuestro equipo», «están
 * cifrados de extremo a extremo», «lo mismo aplica a tus conversaciones con
 * Eco». Es falso (ADR 0007 §C y §D): el mensaje viaja en claro para que una IA
 * responda, y las respuestas y los mensajes de crisis se guardan sin cifrar.
 *
 * QUÉ VIGILA, sobre el texto que de verdad se pinta —JSX y cadenas, nunca
 * comentarios—, en bloques: un párrafo con sus negritas es UN bloque.
 *
 *   1. Quien promete exclusividad («solo tú puedes…», «ni nuestro equipo», «de
 *      extremo a extremo»…) tiene que nombrar QUÉ protege. «Solo tú puedes
 *      leerlos» a secas, bajo un título que dice «diario y Eco», es como se
 *      coló en la tarjeta móvil de Seguridad.
 *   2. Si ese bloque menciona a Eco, tiene que decir en el mismo bloque en qué
 *      se diferencia.
 *   3. Las superficies que cubren las dos cosas a la vez no pueden callarse la
 *      diferencia: borrarla también es prometer de más.
 *
 * LO QUE NO VE. Una promesa partida entre dos bloques sin palabra de
 * exclusividad, un candado dibujado, ni un texto que llegue del servidor (para
 * el tour está `onboarding.service.spec`). Es una red contra la reaparición de
 * estas frases, no un corrector de estilo.
 */

const AMBITOS = [
  "apps/web/src",
  "apps/mobile/app",
  "apps/mobile/src",
  "apps/api/src/onboarding",
  "apps/api/src/notifications",
  "packages/types/src",
];

// ─── Las reglas ──────────────────────────────────────────────────────────────

/** Promete que nadie más lo ve, o un cifrado que Eco no tiene. */
const EXCLUSIVA = frase(
  "s[oó]lo t[uú] (?:puedes|podr[aá]s|la|lo|las|los|tienes)(?: \\S+)?" +
    "|s[oó]lo (?:puedes|podr[aá]s) \\S+ t[uú]" +
    "|nadie m[aá]s (?:que t[uú] )?puede" +
    "|ni (?:siquiera )?(?:nuestro equipo|nosotros)" +
    "|de extremo a extremo|punta[ -]a[ -]punta",
);
/** Equipara a Eco con el diario sin decirlo con «solo tú». */
const EQUIPARA = frase(
  "lo mismo (?:aplica|vale|pasa)|igual(?:mente)? de (?:privad[oa]s?|protegid[oa]s?|segur[oa]s?)" +
    "|(?:la )?misma (?:llave|protecci[oó]n|privacidad) (?:cifrada )?(?:de|que) tu diario",
);
const ECO = /(?<![a-zA-Záéíóúñ])Eco(?![a-záéíóúñ])/;
/** Lo que se puede nombrar como protegido de verdad. */
const NOMBRA_LO_PROTEGIDO =
  /diario|reflexi[oó]n|entrada|\bnota\b|lo que escribes en tu diario/i;
/** La diferencia, dicha. */
const CONTRASTE =
  /sin cifrar|su respuesta, no|sus respuestas, no|se protege de otra forma|No se env[ií]an a Eco/i;

type Falta = { regla: 1 | 2; bloque: string };

function faltas(bloques: readonly string[]): Falta[] {
  const out: Falta[] = [];
  for (const bloque of bloques) {
    const promete = EXCLUSIVA.test(bloque);
    if (promete && !NOMBRA_LO_PROTEGIDO.test(bloque))
      out.push({ regla: 1, bloque });
    if (
      (promete || EQUIPARA.test(bloque)) &&
      ECO.test(bloque) &&
      !CONTRASTE.test(bloque)
    )
      out.push({ regla: 2, bloque });
  }
  return out;
}

/**
 * Bloques revisados que no se nombran a sí mismos porque lo hace el título que
 * tienen justo encima, y que hablan SÓLO de lo que se cifra en el dispositivo.
 * Por texto exacto: si alguien los toca, dejan de coincidir y hay que volver a
 * mirarlos.
 */
const REVISADOS: Readonly<Record<string, string>> = {
  "Solo tú la ves. No se comparte con nadie.":
    "landing · bajo «Guardaste una reflexión»",
  "Un espacio privado para nombrar lo que pasa adentro. Cifrado en tu dispositivo — nadie más puede leerlo, ni siquiera nosotros.":
    "móvil · bajo «Mis Reflexiones»",
  "Una sola palabra está bien — solo tú la lees.":
    "ReflectionPromptCard · invita a escribir una reflexión; hoy sin montar",
  "Escribe lo que tengas en mente. Es para ti. Cifrado punta-a-punta.":
    "terapia · la intención de la sesión se cifra con la llave del diario",
};

describe("lo que sólo es cierto del diario no se le promete a Eco", () => {
  const porFichero = leerBloques(AMBITOS);

  it("ninguna pantalla promete exclusividad sin decir de qué, ni se la atribuye a Eco", () => {
    const hallazgos = [...porFichero].flatMap(([fichero, bloques]) =>
      faltas(bloques)
        .filter((f) => !(f.bloque in REVISADOS))
        .map((f) => `${fichero} · regla ${f.regla} → ${f.bloque}`),
    );
    expect(hallazgos).toEqual([]);
  });

  it("las superficies que cubren las dos cosas dicen la diferencia", () => {
    for (const fichero of [
      "apps/web/src/app/(auth)/login/_LoginForm.tsx",
      "apps/web/src/app/(auth)/register/page.tsx",
      "apps/web/src/components/privacy/PrivacyInfoButton.tsx",
      "apps/web/src/components/dashboard/diario/UnlockGate.tsx",
      "apps/web/src/components/dashboard/security/DiaryLockCard.tsx",
      "apps/mobile/src/components/dashboard/diario/DiarySecurityInfo.tsx",
      "apps/mobile/src/components/dashboard/diario/UnlockGate.tsx",
      "apps/mobile/src/components/dashboard/security/DiaryLockCard.tsx",
    ]) {
      const bloques = porFichero.get(fichero);
      expect(bloques, `no se leyó ${fichero}`).toBeDefined();
      expect(
        bloques!.some((b) => ECO.test(b) && CONTRASTE.test(b)),
        `${fichero} ya no dice en qué se diferencia Eco`,
      ).toBe(true);
    }
  });

  it("la lista de revisados no acumula frases que ya no existen", () => {
    const todos = new Set([...porFichero.values()].flat());
    expect(Object.keys(REVISADOS).filter((r) => !todos.has(r))).toEqual([]);
  });

  it("la prueba lee pantallas de verdad", () => {
    // Verde por vacío es el peor verde: un refactor que mueva los componentes
    // no puede dejar esto recorriendo cero bloques.
    expect(porFichero.size).toBeGreaterThan(250);
    const conEco = [...porFichero.values()].flat().filter((b) => ECO.test(b));
    expect(conEco.length).toBeGreaterThan(40);
  });
});

describe("el detector reconoce las frases que hubo, con su forma real", () => {
  // Las que se publicaron hasta el 2026-11-23. Si el detector dejara de verlas,
  // la prueba de arriba pasaría sin vigilar nada.
  const RETIRADAS: ReadonlyArray<[string, string]> = [
    [
      "acceso",
      `const A = () => <p>Tu diario y tus conversaciones con Eco
        siguen protegidos — <b>solo tú puedes verlos</b>. <X /></p>;`,
    ],
    [
      "registro",
      `const A = () => <p>Tu diario y tus conversaciones con Eco quedan
        protegidos: <b>solo tú puedes verlos</b>, ni siquiera nuestro equipo.</p>;`,
    ],
    [
      "reja de Eco",
      `const c = { blurb: "Eco usa la misma llave cifrada de tu diario. Escribe la contraseña. Solo tú puedes leerlas." };`,
    ],
    [
      "tarjeta de Seguridad (web)",
      `const A = () => <p>Tu diario y tus conversaciones con Eco se abren con{" "}
        <b>la misma contraseña de tu cuenta</b>. Solo tú puedes leerlos — ni
        nuestro equipo.</p>;`,
    ],
    [
      "tarjeta de Seguridad (móvil)",
      `const A = () => <Text>Se abren con la misma contraseña de tu cuenta. Solo tú puedes leerlos.</Text>;`,
    ],
    [
      "componente común",
      `const A = () => <p>Lo mismo aplica a tus conversaciones con Eco.</p>;`,
    ],
    [
      "modal del Mapa",
      `const A = () => <p>El análisis nunca lee el texto de tu diario ni de tus
        charlas con Eco — están cifrados de extremo a extremo.</p>;`,
    ],
    [
      "sugerencia de Inicio",
      `const A = () => <span>A partir de tu actividad reciente · solo tú puedes verlo</span>;`,
    ],
  ];

  it.each(RETIRADAS)("%s", (_donde, fuente) => {
    expect(faltas(bloquesDe(fuente)).length).toBeGreaterThan(0);
  });

  it("y deja pasar lo que sí es cierto", () => {
    for (const fuente of [
      `const A = () => <h2>Solo tú puedes leer tu diario</h2>;`,
      `const A = () => <p>Una reflexión es sobre ti — se cifra y solo tú la lees</p>;`,
      // El mismo párrafo del acceso, ya corregido.
      `const A = () => <p>Lo que escribes en tu diario <b>solo puedes leerlo tú</b>. Eco funciona con inteligencia artificial y se protege de otra forma.</p>;`,
      // Un comentario puede citar la frase vieja; lo que cuenta es lo pintado.
      `// Eco: solo tú puedes leerlas\nconst A = () => <p>Conversa con Eco</p>;`,
    ])
      expect(faltas(bloquesDe(fuente))).toEqual([]);
  });

  it("resuelve las constantes compartidas, no sólo el texto escrito a mano", () => {
    const [bloque] = bloquesDe(
      "const c = { blurb: `Abre tus conversaciones. ${ECO_PRIVACY_NOTE}` };",
    );
    expect(bloque).toContain("Tu mensaje se guarda cifrado; su respuesta, no.");
  });
});
