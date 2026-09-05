/**
 * EEC-C04's five microguides, as the browser needs them.
 *
 * GENERATED from `artifacts/eec/C04/v1.0/feelverse/guides/*.manifest.json`
 * plus the PUBLIC half of the server-side recall catalog — the same artifacts
 * the production DRAFTs are created from. Regenerate with
 * `node scripts/eec/build-web-microguides.mjs` rather than editing by hand: a
 * table typed twice is a table that drifts, and the web bundle test fails the
 * build if this file and the manifests disagree.
 *
 * The correct option is NOT among the options here, and nothing in this file
 * knows which one it is — so nothing here could leak it.
 */

import type { GuidePresentation } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";
import {
  microguidePresentation,
  microguideReaderCopy,
  type MicroguideChapter,
  type MicroguideEntry,
} from "./guide-microguide-bundle";

const EEC_C04: MicroguideChapter = {
  keyPrefix: "eec-c4",
  chapterLabel: "capítulo 4",
};

export const EEC_C04_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "cuerpo-datos-no-veredictos",
    practiceSlug: "misma-sensacion-otros-contextos",
    title: "El cuerpo aporta datos, no veredictos",
    summary:
      "«Corazón acelerado = miedo» es cómodo y engañoso. Vas a comparar una misma sensación en contextos distintos y a ver qué permite decir en cada uno.",
    duration: "8–10 minutos",
    intro: {
      title: "El cuerpo informa; no dictamina",
      body: [
        "«Corazón acelerado = miedo» es cómodo y engañoso. Vas a comparar una misma sensación en contextos distintos y a ver qué permite decir en cada uno.",
      ],
      note: "No te pediremos observar tu cuerpo ahora, ni respirar de una manera concreta. Trabajaremos con ejemplos.",
    },
    passage: {
      title: "No existe un diccionario corporal de las emociones",
      body: "Lee la sección donde el capítulo reconoce las asociaciones familiares y señala dónde empieza el problema.",
    },
    concept: {
      title: "Asociación frecuente no es traducción fija",
      body: [
        "Hay asociaciones reconocibles: el miedo puede venir con aceleración, la vergüenza con rubor, la ira con tensión. El capítulo no las niega.",
        "Lo que rechaza es convertirlas en traducciones rígidas. Una sensación informa que algo ocurre; no determina por sí sola qué emoción hay ni cuál es su causa.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "La misma sensación, otros contextos",
      body: [
        "Compara un conjunto de señales en dos situaciones y elige qué factores podrían cambiar su significado. Nada se marca como incorrecto.",
      ],
      note: "Es una comparación entre ejemplos; no interpreta tus sensaciones ni concluye nada sobre ti.",
    },
    recall: {
      question:
        "Según el capítulo 4, ¿qué aporta por sí sola una sensación corporal?",
      options: [
        {
          optionKey: "opcion-informa",
          label:
            "Informa que algo ocurre, sin determinar qué emoción es ni cuál es su causa.",
        },
        {
          optionKey: "opcion-traduce",
          label:
            "Indica la emoción correspondiente, porque cada sensación tiene su equivalente.",
        },
        {
          optionKey: "opcion-nada",
          label:
            "No aporta nada útil: para saber lo que sentimos hay que ignorar el cuerpo.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "El cuerpo aporta datos valiosos y no funciona como diccionario. Una sensación abre preguntas útiles; el veredicto sobre qué emoción es y por qué necesita más que la sensación.",
      ],
    },
  },
  {
    slug: "notar-interpretar-nombrar",
    practiceSlug: "senal-atencion-interpretacion-nombre",
    title: "Notar, interpretar y nombrar no son lo mismo",
    summary:
      "Notar algo en el cuerpo, prestarle atención, interpretarlo y ponerle nombre ocurren casi a la vez, y no son lo mismo. Vas a separarlos en un caso leve.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuatro cosas que suelen ir juntas",
      body: [
        "Notar algo en el cuerpo, prestarle atención, interpretarlo y ponerle nombre ocurren casi a la vez, y no son lo mismo. Vas a separarlos en un caso leve.",
      ],
      note: "Elegiremos una situación cotidiana de baja intensidad. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Interocepción: notar no es lo mismo que interpretar",
      body: "Lee la sección donde el capítulo distingue notar, detectar con precisión y comprender, y explica por qué más atención no siempre significa mejor comprensión.",
    },
    concept: {
      title: "Notar, medir e interpretar son pasos distintos",
      body: [
        "Un termómetro puede indicar fiebre sin diagnosticar su causa. Con el cuerpo pasa algo parecido: se puede notar con mucha intensidad una señal y aun así no saber qué significa.",
        "Por eso conviene una escucha con curiosidad, contexto y posibilidad de corregirse: en vez de «si siento esto, significa aquello», sostener «noto esto, y todavía no sé qué significa».",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Señal, atención, interpretación y nombre",
      body: [
        "Separa un caso leve en cuatro campos y observa qué aporta cada uno. No se trata de encontrar el nombre correcto.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 4, notar una sensación corporal con mucha intensidad significa que…",
      options: [
        {
          optionKey: "opcion-notar-no-es-interpretar",
          label:
            "Se notó una señal; notar, medir con precisión e interpretar siguen siendo cosas distintas.",
        },
        {
          optionKey: "opcion-mas-precision",
          label: "Se conoce con más exactitud qué emoción es y de dónde viene.",
        },
        {
          optionKey: "opcion-exagera",
          label:
            "La sensación probablemente se está exagerando y conviene ignorarla.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Notar no es medir, y medir no es interpretar. El cuerpo aporta información y esa información todavía necesita contexto. Un síntoma nuevo, intenso o persistente merece consulta, no una explicación emocional automática.",
      ],
    },
  },
  {
    slug: "cuerpo-y-cerebro-no-hacen-fila",
    practiceSlug: "la-cadena-que-no-es-fila",
    title: "Cuerpo y cerebro no hacen fila",
    summary:
      "La frase describe bien una experiencia y explica mal un mecanismo. Vas a mirarla de cerca: qué observa, qué supone y qué deja fuera.",
    duration: "8–10 minutos",
    intro: {
      title: "«El cuerpo habló antes que tú»",
      body: [
        "La frase describe bien una experiencia y explica mal un mecanismo. Vas a mirarla de cerca: qué observa, qué supone y qué deja fuera.",
      ],
      note: "Trabajaremos con la escena del capítulo, no con un recuerdo tuyo.",
    },
    passage: {
      title: "El frenazo antes del nombre",
      body: "Lee la escena del frenazo y el matiz que el capítulo introduce justo después.",
    },
    concept: {
      title: "Notarlo primero no es que ocurriera primero",
      body: [
        "El cuerpo cambia antes de que exista una frase consciente: eso el capítulo lo sostiene. Lo que no se sigue de ahí es que el cuerpo haya pronunciado la palabra «miedo».",
        "La coordinación entre cuerpo, cerebro y entorno es recíproca. Que una señal se note primero no demuestra que exista una fila donde el cuerpo va delante y la mente detrás.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "La cadena que no es una fila",
      body: [
        "Toma la afirmación «primero el cuerpo, después la mente» y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 4, notar el cambio corporal antes que el nombre demuestra que…",
      options: [
        {
          optionKey: "opcion-reciprocidad",
          label:
            "El cuerpo cambió antes de que hubiera una frase; no que exista una fila fija cuerpo-primero.",
        },
        {
          optionKey: "opcion-cuerpo-primero",
          label:
            "El cuerpo produce la emoción y la mente solo la nombra después.",
        },
        {
          optionKey: "opcion-mente-primero",
          label:
            "La interpretación siempre ocurre antes de cualquier cambio corporal.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "El cuerpo puede cambiar antes de que aparezca una palabra, y eso no establece un orden fijo cuerpo-primero. Lo que el capítulo describe es coordinación recíproca, no una fila.",
      ],
    },
  },
  {
    slug: "metafora-teoria-evidencia",
    practiceSlug: "que-tipo-de-afirmacion-es",
    title: "Metáfora, teoría y evidencia no son lo mismo",
    summary:
      "Una metáfora útil, una propuesta teórica y un hallazgo con evidencia pueden sonar parecido en una conversación. Vas a clasificar afirmaciones sobre cuerpo y emoción según qué tipo de afirmación son.",
    duration: "8–10 minutos",
    intro: {
      title: "Tres cosas que suenan igual",
      body: [
        "Una metáfora útil, una propuesta teórica y un hallazgo con evidencia pueden sonar parecido en una conversación. Vas a clasificar afirmaciones sobre cuerpo y emoción según qué tipo de afirmación son.",
      ],
      note: "Se trata de afirmaciones del capítulo, no de opiniones sobre personas o terapias concretas.",
    },
    passage: {
      title: "Neurocepción: una idea influyente bajo examen",
      body: "Lee la sección donde el capítulo separa tres preguntas que suelen mezclarse al hablar de neurocepción y teoría polivagal.",
    },
    concept: {
      title: "Popular, útil y demostrado no son lo mismo",
      body: [
        "El capítulo separa tres preguntas: si existen procesos no conscientes que preparan la acción, si «neurocepción» es el nombre científico general de todos ellos, y si las afirmaciones específicas de esa teoría están confirmadas.",
        "Las respuestas no coinciden, y por eso conviene decir de qué tipo es cada afirmación. Una controversia no se resuelve por la seguridad con que alguien habla, sino examinando qué predice cada afirmación y cómo se mide.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "¿Qué tipo de afirmación es esta?",
      body: [
        "Clasifica varias afirmaciones sobre cuerpo y emoción entre metáfora útil, propuesta teórica, hallazgo con respaldo o afirmación que necesita más evidencia.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 4, que una explicación sobre el cuerpo sea intuitiva y popular demuestra que…",
      options: [
        {
          optionKey: "opcion-cada-mecanismo",
          label:
            "Nada por sí solo: cada uno de sus mecanismos necesita evidencia independiente.",
        },
        {
          optionKey: "opcion-confirmada",
          label:
            "Que ha sido confirmada, porque de otro modo no se habría extendido tanto.",
        },
        {
          optionKey: "opcion-inutil",
          label:
            "Que es inútil para conversar y conviene descartarla por completo.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Una explicación puede ser intuitiva, popular y útil para conversar, y aun así cada uno de sus mecanismos necesita evidencia propia. Distinguir metáfora, teoría y evidencia no le quita valor: le pone lugar.",
      ],
    },
  },
  {
    slug: "observar-requiere-eleccion",
    practiceSlug: "elegir-como-observar",
    title: "Observar el cuerpo también requiere elección",
    summary:
      "Mirar hacia adentro ayuda a algunas personas en algunos momentos, y no a todas siempre. Vas a elegir entre varias formas seguras de atención para una escena hipotética.",
    duration: "8–10 minutos",
    intro: {
      title: "Atender al cuerpo es una opción, no un deber",
      body: [
        "Mirar hacia adentro ayuda a algunas personas en algunos momentos, y no a todas siempre. Vas a elegir entre varias formas seguras de atención para una escena hipotética.",
      ],
      note: "No tendrás que cerrar los ojos ni cambiar la respiración. Puedes detenerte en cualquier momento.",
    },
    passage: {
      title:
        "La conciencia corporal puede ayudar; también necesita condiciones",
      body: "Lee la sección donde el capítulo revisa mindfulness y body scan, menciona experiencias adversas documentadas y fija las tres reglas de su actividad.",
    },
    concept: {
      title: "Útil para algunas personas, no universalmente regulador",
      body: [
        "El capítulo reconoce que estas prácticas pueden ser experiencias útiles, y evita el salto siguiente: «útil» no significa beneficioso para cualquier persona en cualquier momento. La literatura sobre meditación también documenta efectos no deseados.",
        "De ahí sus tres reglas: no trabajar deliberadamente con algo traumático o muy intenso, no obligar a cerrar los ojos ni a cambiar la respiración, y poder detenerse en cualquier momento.",
      ],
      note: "Esta microguía no propone una técnica de regulación ni sustituye una consulta cuando hace falta.",
    },
    practice: {
      title: "Elegir cómo observar",
      body: [
        "Ante una escena hipotética, elige entre atención al entorno, una observación corporal breve o una pausa. Ninguna opción es obligatoria ni mejor que las otras.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 4, que una práctica de atención corporal ayude a alguien permite concluir que…",
      options: [
        {
          optionKey: "opcion-no-universal",
          label:
            "Le ayudó a esa persona en ese momento: «útil» no significa beneficioso para cualquiera siempre.",
        },
        {
          optionKey: "opcion-universal",
          label:
            "Es una técnica reguladora que conviene recomendar a todo el mundo.",
        },
        {
          optionKey: "opcion-peligrosa",
          label:
            "Es una práctica peligrosa que debería evitarse por precaución.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Observar el cuerpo puede ayudar y también necesita condiciones. La meta no es sentir más, sino distinguir mejor y conservar la posibilidad de elegir —incluida la de parar.",
      ],
    },
  },
];

export const EEC_C04_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C04_MICROGUIDES.map((m) => microguidePresentation(EEC_C04, m));

export const EEC_C04_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C04_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C04, m));
