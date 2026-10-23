-- D-ORD · `processedAt` pasa a ser opcional.
--
-- Compatible con la instancia que sale: el código anterior siempre escribe un
-- valor, así que sigue funcionando contra esta columna sin tocar nada. Lo que
-- habilita es la reclamación en dos tiempos — fila primero con NULL, sello
-- después— para que un intento que muere a mitad no quede marcado como hecho.
--
-- Aditiva y reversible sin pérdida mientras no exista ninguna fila con NULL.
ALTER TABLE "StripeEvent" ALTER COLUMN "processedAt" DROP NOT NULL;
