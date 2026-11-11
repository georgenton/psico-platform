/**
 * Ensambla el paquete de revisión de las cinco microguías de EEC-C01.
 *
 * Dos fuentes, y las dos del repositorio — nada se escribe a mano:
 *
 *   1. los cinco manifiestos de `artifacts/eec/C01/v1.0/feelverse/guides`,
 *      que traen las ESCENAS (título, cuerpo, nota, etiqueta de acción);
 *   2. `exercise-ingestion-catalog`, que trae la INTERACCIÓN de la práctica
 *      y la PREGUNTA del recuerdo activo con sus opciones y su devolución.
 *
 * El `preview-report` del CLI une exactamente estas dos cosas contra una base.
 * Aquí se unen sin base, porque el contenido es el mismo y así queda en un
 * artefacto estable que no depende de un entorno que se destruye.
 *
 * Copia literal: ninguna cadena se reescribe, se resume ni se corrige.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.argv[2];
if (!ROOT) {
  console.error("uso: node armar-paquete.cjs <raíz-del-repo> <salida.json>");
  process.exit(1);
}
const OUT = process.argv[3];
if (!OUT) {
  console.error("uso: node armar-paquete.mjs <raíz-del-repo> <salida.json>");
  process.exit(1);
}

const GUIDES = join(ROOT, "artifacts/eec/C01/v1.0/feelverse/guides");
const { EXERCISE_INGESTION_CATALOG } = await import(
  pathToFileURL(join(ROOT, "apps/api/dist/content-core/exercise-ingestion-catalog.js")).href,
);

const pares = EXERCISE_INGESTION_CATALOG["emociones-en-construccion"];
if (!Array.isArray(pares)) {
  console.error("el catálogo de EEC no es una lista");
  process.exit(1);
}

const porPractica = new Map();
const porRecuerdo = new Map();
for (const par of pares) {
  if (par.practice?.exerciseKey) porPractica.set(par.practice.exerciseKey, par);
  if (par.recall?.exerciseKey) porRecuerdo.set(par.recall.exerciseKey, par);
}

const salida = [];
for (const n of ["mg01", "mg02", "mg03", "mg04", "mg05"]) {
  const m = JSON.parse(
    readFileSync(join(GUIDES, `${n}.manifest.json`), "utf8"),
  );

  const parPractica = porPractica.get(m.practiceKey) ?? null;
  const parRecuerdo = porRecuerdo.get(m.recallKey) ?? null;

  salida.push({
    archivo: `artifacts/eec/C01/v1.0/feelverse/guides/${n}.manifest.json`,
    manifestId: m.manifestId,
    experiencia: `${m.experienceKey}@${m.experienceVersion}`,
    guia: `${m.guideKey}@${m.guideVersion}`,
    concepto: m.conceptKey,
    practiceKind: m.practiceKind,
    canonico: {
      version: m.canonicalVersion,
      sha256: m.canonicalSha256,
      artefactoFuente: m.sourceArtifact,
      manifestSha256: m.manifestSha256,
    },
    ancla: m.anchors?.primary ?? null,
    estadoDeclarado: { status: m.status, publishAllowed: m.publishAllowed },
    aprobacionesCitadas: m.approvalReferences ?? [],
    privacidad: m.privacyPolicy ?? null,
    accesibilidad: m.accessibilityRequirements ?? [],
    pasosDeGuia: m.guideSteps ?? [],
    escenas: (m.scenes ?? []).map((s) => ({
      orden: s.order,
      tipo: s.kind,
      titulo: s.title ?? null,
      // `body` es una LISTA de párrafos en el manifiesto, no una cadena. Se
      // conserva como lista: unirla con espacios perdería dónde parte el autor.
      cuerpo: Array.isArray(s.body) ? s.body : s.body ? [s.body] : [],
      nota: s.note ?? null,
      accion: s.actionLabel ?? null,
      anclaRef: s.anchorRef ?? null,
      stepKey: s.stepKey ?? null,
      practiceKind: s.practiceKind ?? null,
    })),
    practica: parPractica
      ? {
          exerciseKey: parPractica.practice.exerciseKey,
          titulo: parPractica.practice.title ?? null,
          tipo: parPractica.practice.type ?? null,
          encabezadoFuente: parPractica.practice.sourceHeading ?? null,
          interaccion: parPractica.practice.interaction ?? null,
        }
      : { ausente: `sin entrada para practiceKey=${m.practiceKey}` },
    recuerdo: parRecuerdo
      ? {
          exerciseKey: parRecuerdo.recall.exerciseKey,
          pregunta: parRecuerdo.recall.title ?? null,
          tipo: parRecuerdo.recall.type ?? null,
          encabezadoFuente: parRecuerdo.recall.sourceHeading ?? null,
          // Las opciones y la respuesta viven en `content`, no en `interaction`:
          // un recuerdo activo no tiene interacción, tiene pregunta cerrada.
          opciones: parRecuerdo.recall.content?.options ?? [],
          correcta: parRecuerdo.recall.content?.correctOptionKey ?? null,
          modo: parRecuerdo.recall.content?.recallMode ?? null,
          devolucion: parRecuerdo.recall.feedback ?? null,
        }
      : { ausente: `sin entrada para recallKey=${m.recallKey}` },
  });
}

writeFileSync(OUT, JSON.stringify(salida, null, 2) + "\n", "utf8");
console.log(
  JSON.stringify(
    {
      microguias: salida.length,
      escenas: salida.map((x) => x.escenas.length),
      practicasEncontradas: salida.filter((x) => !x.practica.ausente).length,
      recuerdosEncontrados: salida.filter((x) => !x.recuerdo.ausente).length,
      salida: OUT,
    },
    null,
    2,
  ),
);
