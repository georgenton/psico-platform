-- B3 · Prioridad A — de dónde viene editorialmente cada versión de experiencia.
--
-- Aditiva en dos pasos, y el segundo es el que importa: las filas que ya
-- existen se marcan como HISTÓRICAS de forma explícita. Dejarlas en NULL haría
-- que «creada antes de que este control existiera» y «creada después por un
-- camino que se olvidó de declarar su procedencia» se leyeran igual, y esas dos
-- cosas piden respuestas distintas. Ninguna de las dos publica.
ALTER TABLE "ChapterExperienceVersion" ADD COLUMN "editorialOrigin" JSONB;

UPDATE "ChapterExperienceVersion"
   SET "editorialOrigin" = jsonb_build_object(
         'kind', 'legacy_unsealed',
         'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       )
 WHERE "editorialOrigin" IS NULL;
