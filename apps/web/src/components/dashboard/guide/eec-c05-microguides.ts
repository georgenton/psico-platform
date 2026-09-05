/**
 * EEC-C05's five microguides, as the browser needs them.
 *
 * GENERATED from `artifacts/eec/C05/v1.0/feelverse/guides/*.manifest.json`
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

const EEC_C05: MicroguideChapter = {
  keyPrefix: "eec-c5",
  chapterLabel: "capítulo 5",
};

export const EEC_C05_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "emocion-no-es-historia",
    practiceSlug: "cambia-la-historia-cambia-la-emocion",
    title: "Una emoción no es una historia",
    summary:
      "«Cambia la historia y cambiarás la emoción» circula mucho. Vas a mirarla de cerca: en qué acierta, qué simplifica y qué deja fuera.",
    duration: "8–10 minutos",
    intro: {
      title: "Una frase que promete demasiado",
      body: [
        "«Cambia la historia y cambiarás la emoción» circula mucho. Vas a mirarla de cerca: en qué acierta, qué simplifica y qué deja fuera.",
      ],
      note: "Trabajaremos con la afirmación, no con tu historia personal. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "¿Una historia más coherente siempre hace bien?",
      body: "Lee la sección donde el capítulo revisa la investigación sobre identidad narrativa, sus hallazgos y sus matices.",
    },
    concept: {
      title: "El relato participa; no es toda la explicación",
      body: [
        "La manera de narrarnos puede relacionarse con cómo vivimos: algunos estudios asocian temas como agencia y comunión con el bienestar. Pero otros resultados obligan a matizar, y varias relaciones se atenúan al controlar el tono emocional del relato.",
        "Por eso el capítulo no concluye «construye una historia coherente y estarás bien». Cuerpo, contexto, aprendizaje y procesos no conscientes también participan en lo que sientes.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "«Cambia la historia y cambia la emoción»",
      body: [
        "Separa esa afirmación en lo que observa, lo que supone y lo que faltaría para sostenerla tal como suena.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 5, ¿qué relación describe la evidencia entre el relato y lo que sentimos?",
      options: [
        {
          optionKey: "opcion-participa",
          label:
            "El relato participa junto al cuerpo, el contexto y lo aprendido; no equivale por sí solo a la emoción.",
        },
        {
          optionKey: "opcion-determina",
          label:
            "Construir una historia coherente basta para mejorar cómo nos sentimos.",
        },
        {
          optionKey: "opcion-irrelevante",
          label:
            "La forma de narrarnos no guarda ninguna relación con el bienestar.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Una emoción no es una historia. El relato puede organizar, sostener o abrir lo que sentimos, y sigue conviviendo con el cuerpo, el contexto y lo aprendido. Reconocerlo evita prometer un cambio que no depende solo de narrar distinto.",
      ],
    },
  },
  {
    slug: "silencio-sin-subtitulos",
    practiceSlug: "escena-subtitulo-historia",
    title: "El silencio no viene con subtítulos",
    summary:
      "Un mensaje leído sin respuesta no trae su explicación incorporada. Vas a separar la escena, el subtítulo que le ponemos y la historia más amplia que aparece detrás.",
    duration: "8–10 minutos",
    intro: {
      title: "Lo que sé y lo que estoy añadiendo",
      body: [
        "Un mensaje leído sin respuesta no trae su explicación incorporada. Vas a separar la escena, el subtítulo que le ponemos y la historia más amplia que aparece detrás.",
      ],
      note: "La escena es de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "La pregunta más honesta",
      body: "Lee el punto donde el capítulo cambia «¿qué historia debo inventar?» por una pregunta sobre los subtítulos que añadimos, y muestra la distinción mínima entre escena, subtítulo e historia amplia.",
    },
    concept: {
      title: "La escena, el subtítulo y la historia amplia",
      body: [
        "«Mi jefa pidió hablar mañana» es una escena. «Va a despedirme» es un subtítulo. «Cuando confían en mí, termino fallando» es una historia más amplia.",
        "Las tres pueden sentirse como una sola cosa. Separarlas no niega la preocupación: permite ver en qué momento un dato empezó a convertirse en una conclusión.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Escena, subtítulo e historia",
      body: [
        "Ordena las lecturas posibles de un hecho ambiguo según lo que la información disponible permite sostener, y marca qué falta por saber.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 5, un hecho ambiguo como un mensaje leído sin respuesta trae consigo…",
      options: [
        {
          optionKey: "opcion-sin-explicacion",
          label:
            "Solo el hecho: la explicación es un subtítulo que añadimos nosotros.",
        },
        {
          optionKey: "opcion-con-significado",
          label:
            "Su significado, si prestamos suficiente atención a los detalles.",
        },
        {
          optionKey: "opcion-nada-que-pensar",
          label:
            "Nada relevante: interpretar un silencio siempre es un error que conviene evitar.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "El silencio no viene con subtítulos. Distinguir lo que ocurrió de lo que estamos añadiendo no obliga a dejar de preocuparse: solo muestra dónde termina el dato y dónde empieza la conclusión.",
      ],
    },
  },
  {
    slug: "historia-dominante-no-es-identidad",
    practiceSlug: "acontecimiento-descripcion-conclusion-excepcion",
    title: "Una historia dominante no es toda tu identidad",
    summary:
      "Algunas descripciones repetidas terminan pareciendo toda la biografía. Vas a separar un acontecimiento, la descripción que se repite, la conclusión sobre uno mismo y el detalle que no encaja.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuando una descripción ocupa demasiado espacio",
      body: [
        "Algunas descripciones repetidas terminan pareciendo toda la biografía. Vas a separar un acontecimiento, la descripción que se repite, la conclusión sobre uno mismo y el detalle que no encaja.",
      ],
      note: "Usaremos un ejemplo del capítulo. No te pediremos revisar un episodio doloroso propio.",
    },
    passage: {
      title: "Historias dominantes y acontecimientos que no encajan",
      body: "Lee la sección sobre historia dominante, resultados únicos y re-autoría, con la imagen del buscador que devuelve siempre los mismos resultados.",
    },
    concept: {
      title: "Un relato que ordena no es toda la persona",
      body: [
        "Cuando alguien está convencido de «nunca he sabido defenderme», los episodios compatibles aparecen primero y los demás quedan abajo. El capítulo lo compara con un buscador que devuelve siempre los mismos resultados.",
        "Encontrar un episodio que no encaja no demuestra lo contrario ni borra la dificultad. Es una página que el índice había dejado fuera. Re-autoría, en este enfoque, no es inventar capítulos ni cambiar el pasado: es revisar el índice de un libro ya escrito.",
      ],
      note: "Esto describe recursos de un modelo terapéutico; no es una indicación de tratamiento ni una técnica para aplicarte a solas.",
    },
    practice: {
      title: "Acontecimiento, descripción, conclusión y excepción",
      body: [
        "Separa un caso en cuatro campos y observa qué aporta cada uno. No se trata de sustituir una conclusión por otra más optimista.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 5, la re-autoría en el enfoque narrativo consiste en…",
      options: [
        {
          optionKey: "opcion-revisar-indice",
          label:
            "Revisar el índice de un libro ya escrito: incorporar hechos que el relato dominante había dejado fuera.",
        },
        {
          optionKey: "opcion-inventar",
          label:
            "Inventar capítulos nuevos que reemplacen los recuerdos difíciles.",
        },
        {
          optionKey: "opcion-positivo",
          label:
            "Demostrar que la conclusión negativa siempre fue falsa desde el principio.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Una historia dominante puede estrechar lo que vemos de nosotros sin ser una mentira. Tratarla como relato permite abrir otras descripciones sin negar hechos ni fabricar un final feliz.",
      ],
    },
  },
  {
    slug: "recordar-reconstruye",
    practiceSlug: "dato-interpretacion-informacion-nueva",
    title: "Recordar reconstruye; no inventa libremente",
    summary:
      "Que la memoria se reconstruya no significa que podamos reescribir los hechos a voluntad. Vas a comparar qué permanece como dato, qué es interpretación actual y qué podría cambiar el significado.",
    duration: "8–10 minutos",
    intro: {
      title: "Dos hermanas, una cena",
      body: [
        "Que la memoria se reconstruya no significa que podamos reescribir los hechos a voluntad. Vas a comparar qué permanece como dato, qué es interpretación actual y qué podría cambiar el significado.",
      ],
      note: "Usaremos el ejemplo del capítulo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "La memoria no es una grabación ni una página en blanco",
      body: "Lee la sección de las dos hermanas que recuerdan la misma cena y el cuidado que el capítulo pide después.",
    },
    concept: {
      title: "Reconstruir no es fabricar",
      body: [
        "La memoria autobiográfica selecciona, reconstruye e integra; las conversaciones posteriores también vuelven algunos detalles más accesibles que otros. Dos personas pueden recordar la misma noche de maneras distintas sin que una mienta.",
        "Su maleabilidad exige cuidado en la dirección contraria: si hoy no recuerdas con certeza lo que alguien dijo, una narración convincente no convierte esa frase en un hecho histórico.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Dato, interpretación e información nueva",
      body: [
        "Compara qué se sostiene como dato, qué es lectura actual y qué información nueva podría cambiar el significado sin cambiar lo ocurrido.",
      ],
      note: "Es una comparación entre ejemplos; nada se marca como incorrecto.",
    },
    recall: {
      question:
        "Según el capítulo 5, que la memoria autobiográfica sea reconstructiva significa que…",
      options: [
        {
          optionKey: "opcion-selecciona",
          label:
            "Selecciona, reconstruye e integra; eso no autoriza a reescribir los hechos a voluntad.",
        },
        {
          optionKey: "opcion-libre",
          label:
            "Podemos reinterpretar el pasado libremente, porque ningún recuerdo es fiable.",
        },
        {
          optionKey: "opcion-grabacion",
          label:
            "Funciona como una grabación: si el recuerdo es vívido, ocurrió tal cual.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Recordar reconstruye, y eso no autoriza a reescribir los hechos. Conviene sostener una categoría que a veces se olvida: «no lo sé con certeza».",
      ],
    },
  },
  {
    slug: "reescribir-abre-opciones",
    practiceSlug: "dos-formulaciones-que-abren",
    title: "Reescribir puede abrir opciones, no garantizar otra emoción",
    summary:
      "Revisar un relato puede ampliar lo que se puede hacer y preguntar. No obliga a sentirse mejor. Vas a comparar dos formulaciones sobre una misma situación.",
    duration: "8–10 minutos",
    intro: {
      title: "Abrir opciones, sin prometer calma",
      body: [
        "Revisar un relato puede ampliar lo que se puede hacer y preguntar. No obliga a sentirse mejor. Vas a comparar dos formulaciones sobre una misma situación.",
      ],
      note: "No se puntúa qué emoción «debería» aparecer. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Puedes revisar el relato sin borrar la página",
      body: "Lee el cierre con Valeria: lo que sabe, lo que interpreta, lo que no sabe, y qué se propuso realmente el ejercicio.",
    },
    concept: {
      title: "Otra perspectiva no es otra emoción garantizada",
      body: [
        "Después de separar lo que sabe de lo que interpreta, Valeria no se calma necesariamente. Puede seguir mirando el teléfono y seguir ansiosa.",
        "El objetivo no era convencerla de que todo está bien ni reemplazar su historia por una más agradable, sino recuperar la diferencia entre lo ocurrido y lo que se añade. Eso amplía opciones y preguntas; no promete un cambio emocional inmediato.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Dos formulaciones, qué abre cada una",
      body: [
        "Compara dos maneras de contar la misma situación y elige qué acciones o preguntas hace posible cada una.",
      ],
      note: "No se evalúa cuál formulación es correcta ni qué deberías sentir.",
    },
    recall: {
      question:
        "Según el capítulo 5, ¿qué promete revisar el relato de una situación?",
      options: [
        {
          optionKey: "opcion-abre-opciones",
          label:
            "Puede ampliar significado, preguntas y acciones posibles; no garantiza otra emoción.",
        },
        {
          optionKey: "opcion-calma",
          label:
            "Que la emoción difícil disminuya si la nueva versión es suficientemente amable.",
        },
        {
          optionKey: "opcion-aprendizaje",
          label:
            "Que el dolor se convierta en aprendizaje si se cuenta de la manera correcta.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Reescribir puede abrir opciones y no garantiza otra emoción. No hace falta inventar una historia positiva para ampliar lo que puedes preguntar y hacer.",
      ],
    },
  },
];

export const EEC_C05_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C05_MICROGUIDES.map((m) => microguidePresentation(EEC_C05, m));

export const EEC_C05_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C05_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C05, m));
