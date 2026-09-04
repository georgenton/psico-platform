/**
 * EEC-C02's five microguides, as the browser needs them.
 *
 * Same rule as C01: every string is copied from an approved source and nothing
 * is composed here.
 *
 *   - scene titles, bodies and notes come from the manifests in
 *     `artifacts/eec/C02/v1.0/feelverse/guides/`, which are the artifacts the
 *     five production DRAFTs were created from;
 *   - `title` and `duration` are the approved editorial inventory's (the five
 *     microguides Jorge approved on 2026-09-04);
 *   - `summary` is the intro's own opening line — the route card says what the
 *     guide says it will do, rather than a second sentence written for the card;
 *   - the recall question and its three option labels are the PUBLIC half of the
 *     server-side recall catalog. The correct option is not among them, and
 *     nothing in this file knows which one it is, so nothing here could leak it.
 *
 * The extra scenes each Experience has — EXAMPLE in all five, REFLECTION in
 * MG02 — live in the stored definition and are drawn by the player from there.
 * They are deliberately absent from this table: a guide has three obligatory
 * steps, and MG02's reflection is optional by design. Turning it into a fourth
 * step here would make an optional invitation a requirement for finishing.
 */

import type { GuidePresentation } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";
import {
  microguidePresentation,
  microguideReaderCopy,
  type MicroguideChapter,
  type MicroguideEntry,
} from "./guide-microguide-bundle";

const EEC_C02: MicroguideChapter = {
  keyPrefix: "eec-c2",
  chapterLabel: "capítulo 2",
};

export const EEC_C02_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "universal-no-significa-uniforme",
    practiceSlug: "seis-cajones",
    title: "Lo universal no significa uniforme",
    summary:
      "«¿Las emociones son universales?» parece una sola pregunta, y en realidad son varias. Vas a separar seis niveles que el capítulo distingue y a ver qué permite concluir cada uno.",
    duration: "8–10 minutos",
    intro: {
      title: "Seis preguntas dentro de una",
      body: [
        "«¿Las emociones son universales?» parece una sola pregunta, y en realidad son varias. Vas a separar seis niveles que el capítulo distingue y a ver qué permite concluir cada uno.",
      ],
      note: "Trabajaremos con afirmaciones de ejemplo, no con tu historia personal. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "¿Qué significa realmente que una emoción sea universal?",
      body: "Lee la sección donde el capítulo abre la palabra «universal» en preguntas distintas: capacidades del cuerpo, acontecimientos que importan, categorías, expresión, reconocimiento y reglas sociales.",
    },
    concept: {
      title: "Universal no es sinónimo de uniforme",
      body: [
        "Hablar de universalidad exige decir qué nivel estamos comparando. Podemos compartir capacidades corporales y aun así agrupar las experiencias en categorías distintas; podemos producir gestos parecidos y darles significados diferentes; podemos reconocer una expresión en una tarea con opciones dadas y no interpretarla igual en una conversación real.",
        "Por eso una semejanza encontrada en un nivel no demuestra uniformidad en los demás. Decirlo con precisión no debilita la evidencia: la ubica.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Seis cajones",
      body: [
        "Clasifica cada afirmación en el nivel del que habla y observa después qué conclusión permite y cuál no permite ese tipo de evidencia.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
    },
    recall: {
      question:
        "Según el capítulo 2, si un estudio encuentra que cierta expresión facial se reconoce de forma parecida en varios países, ¿qué queda demostrado?",
      options: [
        {
          optionKey: "opcion-solo-ese-nivel",
          label:
            "Solo una semejanza en ese nivel: no demuestra que las categorías, el significado, la interpretación ni las reglas sociales sean iguales.",
        },
        {
          optionKey: "opcion-todo-uniforme",
          label:
            "Que esa emoción se vive, se nombra y se expresa de la misma manera en todas esas culturas.",
        },
        {
          optionKey: "opcion-nada",
          label:
            "Que las expresiones faciales no aportan ninguna información sobre lo que siente una persona.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Antes de responder si una emoción es universal, conviene preguntar de qué nivel hablamos. Compartir una capacidad no obliga a compartir una categoría, ni una expresión a compartir un significado.",
      ],
    },
  },
  {
    slug: "cultura-gramatica-no-destino",
    practiceSlug: "de-etiqueta-a-contexto",
    title: "La cultura es gramática, no destino",
    summary:
      "La cultura enseña qué suele notarse, qué puede decirse y qué respuesta se espera. Vas a tomar una generalización rígida y a convertirla en algo más preciso: una tendencia, un contexto, una persona concreta y lo que falta saber.",
    duration: "9–11 minutos",
    intro: {
      title: "Reglas que orientan, no que deciden",
      body: [
        "La cultura enseña qué suele notarse, qué puede decirse y qué respuesta se espera. Vas a tomar una generalización rígida y a convertirla en algo más preciso: una tendencia, un contexto, una persona concreta y lo que falta saber.",
      ],
      note: "No te pediremos datos sobre tu identidad ni sobre tu familia. Trabajamos con una frase de ejemplo.",
    },
    passage: {
      title: "La cultura como gramática emocional",
      body: "Lee la sección donde el capítulo compara la cultura emocional con una gramática: ofrece estructuras que vuelven ciertas combinaciones familiares y otras extrañas, sin decidir cada frase.",
    },
    concept: {
      title: "Gramática, no destino",
      body: [
        "Una gramática no pronuncia las frases por nosotros: hace que unas suenen naturales y otras raras. La cultura emocional funciona parecido. Ofrece significados, valores y expectativas sobre qué conviene sentir, mostrar y acompañar, y aun así no determina mecánicamente lo que una persona vive.",
        "De ahí se siguen dos cuidados. Una tendencia observada en un grupo no describe a cada integrante, y una costumbre aprendida en la infancia no es una sentencia: se pueden aprender palabras nuevas y ampliar el repertorio.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "De etiqueta a contexto",
      body: [
        "Toma la frase que aparece y sepárala en tres: qué afirma exactamente, qué está suponiendo y qué faltaría precisar — el contexto y la persona concreta.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
    },
    recall: {
      question:
        "Según el capítulo 2, ¿qué quiere decir que la cultura emocional funcione como una gramática?",
      options: [
        {
          optionKey: "opcion-influye-no-determina",
          label:
            "Que ofrece estructuras que vuelven ciertas respuestas familiares y otras extrañas, sin decidir mecánicamente lo que cada persona siente.",
        },
        {
          optionKey: "opcion-determina",
          label:
            "Que fija de antemano qué siente cada integrante del grupo y vuelve homogénea a la sociedad.",
        },
        {
          optionKey: "opcion-irrelevante",
          label:
            "Que la cultura solo afecta modales y costumbres visibles, sin relación con la vida emocional.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "La cultura emocional influye sin determinar. Distinguir entre una tendencia aprendida y una regla fija te deja espacio para mirar el contexto y a la persona concreta que tienes delante.",
      ],
    },
  },
  {
    slug: "gesto-necesita-contexto",
    practiceSlug: "del-gesto-a-la-pregunta",
    title: "Un gesto necesita contexto",
    summary:
      "Un gesto visible casi siempre admite más de una lectura. Vas a practicar un recorrido corto: describir lo que se observa, sostener dos interpretaciones posibles, notar qué contexto falta y elegir una pregunta para comprobar.",
    duration: "8–10 minutos",
    intro: {
      title: "De la conclusión a la pregunta",
      body: [
        "Un gesto visible casi siempre admite más de una lectura. Vas a practicar un recorrido corto: describir lo que se observa, sostener dos interpretaciones posibles, notar qué contexto falta y elegir una pregunta para comprobar.",
      ],
      note: "Es una escena hipotética, no un caso real. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "El rostro no habla solo",
      body: "Lee la sección donde el capítulo explica las reglas de expresión y advierte que regular lo que se muestra no equivale a no sentir.",
    },
    concept: {
      title: "Gesto, contexto, hipótesis, verificación",
      body: [
        "Una expresión aporta información, como una palabra suelta dentro de una frase que todavía no escuchamos completa. Qué ocurrió antes, quién está presente y qué se aprendió a mostrar cambian lo que esa expresión significa.",
        "Por eso conviene tratarla como una hipótesis: una lectura provisional que se comprueba preguntando, no un veredicto sobre lo que la otra persona siente. Las reglas de expresión aprendidas pueden modificar lo visible sin demostrar que la experiencia no exista.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Del gesto a la pregunta",
      body: [
        "Ordena las lecturas posibles según cuánto encajan con lo que realmente se ve, y termina eligiendo la pregunta que harías para comprobar.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
    },
    recall: {
      question:
        "Según el capítulo 2, si alguien suaviza su rostro por una regla de expresión aprendida, ¿qué se puede concluir sobre lo que siente?",
      options: [
        {
          optionKey: "opcion-regula-no-niega",
          label:
            "Que la regla puede modificar lo que se muestra; no demuestra que la experiencia esté ausente, ni cuál es.",
        },
        {
          optionKey: "opcion-no-siente",
          label:
            "Que no está sintiendo nada: si lo sintiera, se le notaría en la cara.",
        },
        {
          optionKey: "opcion-oculta-tristeza",
          label:
            "Que detrás de esa expresión suave hay tristeza que la persona está reprimiendo.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Un gesto abre una hipótesis, no la cierra. Describir lo observado, sostener dos lecturas y preguntar cuesta menos que corregir una conclusión apresurada.",
      ],
    },
  },
  {
    slug: "palabras-dan-contorno",
    practiceSlug: "la-palabra-no-basta",
    title: "Las palabras dan contorno",
    summary:
      "«Pena», «coraje», «sentido», «nervioso»: la misma palabra puede señalar experiencias distintas según la región, la familia y la escena. Vas a comparar cuatro frases en dos contextos y a notar qué información ayuda a interpretarlas.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuando la palabra alcanza y cuando no",
      body: [
        "«Pena», «coraje», «sentido», «nervioso»: la misma palabra puede señalar experiencias distintas según la región, la familia y la escena. Vas a comparar cuatro frases en dos contextos y a notar qué información ayuda a interpretarlas.",
      ],
      note: "Trabajaremos con frases de uso común, no con tu historia personal. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Las palabras dan contorno a la experiencia",
      body: "Lee la sección donde el capítulo compara las palabras con líneas en un mapa: no producen las montañas ni los ríos, pero ayudan a diferenciarlos y a orientarse.",
    },
    concept: {
      title: "Dan contorno; no dictan el territorio",
      body: [
        "Disponer de conceptos emocionales puede ayudarnos a atender, diferenciar y compartir lo que nos pasa. Decir «me siento decepcionado porque esperaba apoyo» abre más opciones que decir «estoy mal».",
        "Al mismo tiempo, no hace falta una palabra exacta para que la experiencia exista, y tener la palabra no fija su significado: «pena» puede nombrar tristeza en una región y vergüenza en otra. Cuando alguien no encuentra cómo decirlo, conviene evitar dos juicios rápidos —«no sabe lo que siente» o «está reprimiendo»— y dar tiempo u otra pregunta.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "La palabra no basta",
      body: [
        "Lee cada frase en las dos escenas propuestas y marca qué información adicional ayudaría a interpretarla: la región, con quién se habla, qué pasó antes, qué ocurre en el cuerpo, en qué lengua se dice.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
    },
    recall: {
      question:
        "Según el capítulo 2, ¿qué papel cumplen las palabras y los conceptos emocionales?",
      options: [
        {
          optionKey: "opcion-ayudan-y-dependen",
          label:
            "Los conceptos y palabras pueden ayudarnos a diferenciar y comunicar experiencias, pero su significado también depende del contexto.",
        },
        {
          optionKey: "opcion-sin-palabra-no-hay",
          label:
            "Sin una palabra precisa no puede existir la experiencia: el lenguaje crea toda emoción.",
        },
        {
          optionKey: "opcion-significado-universal",
          label:
            "Cada palabra emocional tiene un significado universal, igual en cualquier región y en cualquier familia.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Las palabras ayudan a diferenciar y comunicar, y su significado sigue dependiendo del contexto. Nombrar ayuda, pero no obliga: el silencio también puede ser una etapa del significado.",
      ],
    },
  },
  {
    slug: "rituales-dan-marco-no-guion",
    practiceSlug: "acompanar-sin-imponer",
    title: "Los rituales dan marco, no guion",
    summary:
      "Un ritual puede organizar el tiempo, reunir testigos y ofrecer palabras cuando cuesta ordenar lo que pasa. Vas a practicar cómo acompañar sin prescribir: convertir un «deberías» en una opción o en una pregunta.",
    duration: "9–11 minutos",
    intro: {
      title: "Acompañar sin dar instrucciones",
      body: [
        "Un ritual puede organizar el tiempo, reunir testigos y ofrecer palabras cuando cuesta ordenar lo que pasa. Vas a practicar cómo acompañar sin prescribir: convertir un «deberías» en una opción o en una pregunta.",
      ],
      note: "Es una escena hipotética y de baja intensidad. No te pediremos recordar una pérdida propia y puedes salir en cualquier momento.",
    },
    passage: {
      title: "Rituales: cuando sentir necesita un marco compartido",
      body: "Lee la sección donde el capítulo distingue lo que un ritual ofrece —tiempo, acciones, testigos, significado compartido— de lo que no garantiza.",
    },
    concept: {
      title: "Marco compartido, no guion",
      body: [
        "Un ritual puede decir «esta pérdida importa» y sostener a quien la vive. Su efecto depende del sentido que tenga para esa persona y de las condiciones que la rodean; participar no garantiza alivio y no participar tampoco demuestra negación.",
        "El duelo tampoco tiene una cronología igual para todos: cambia con el vínculo, las circunstancias y los recursos disponibles. Acompañar consiste en tolerar esa variedad — a veces hace falta hablar, a veces ayuda práctica, a veces compañía en silencio.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Acompañar sin imponer",
      body: [
        "Separa cuatro cosas en la escena: qué observas, qué estás suponiendo que la otra persona necesita, qué te sale decir y qué puedes ofrecer o preguntar en su lugar.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
    },
    recall: {
      question:
        "Según el capítulo 2, ¿qué se puede concluir del hecho de que alguien participe o no participe en un ritual de duelo?",
      options: [
        {
          optionKey: "opcion-no-demuestra",
          label:
            "Por sí solo no demuestra amor, negación, intensidad del duelo ni recuperación: el ritual ofrece marco y testigos, no un guion de cómo sentir.",
        },
        {
          optionKey: "opcion-participar-sana",
          label:
            "Que participar garantiza alivio y que no participar indica que la persona está negando la pérdida.",
        },
        {
          optionKey: "opcion-ritual-irrelevante",
          label:
            "Que los rituales no cumplen ninguna función y son una formalidad social sin efecto.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "El ritual ofrece marco y testigos; no un guion de cómo sentir. Una pregunta sencilla —«¿qué sería útil para ti en este momento?»— suele acompañar mejor que una interpretación segura.",
      ],
    },
  },
];

export const EEC_C02_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C02_MICROGUIDES.map((m) => microguidePresentation(EEC_C02, m));

export const EEC_C02_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C02_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C02, m));
