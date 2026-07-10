-- Book part grouping on Chapter (e.g. "Parte I · Deconstruyendo lo que sabíamos")
ALTER TABLE "Chapter" ADD COLUMN "partNumber" INTEGER;
ALTER TABLE "Chapter" ADD COLUMN "partTitle" TEXT;
