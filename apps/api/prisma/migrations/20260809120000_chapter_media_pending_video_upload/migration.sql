-- C3 — a video draft that has been allocated at the provider but whose bytes
-- have not landed yet.
--
-- This is NOT the source. The source is written only once the provider confirms
-- the upload finished encoding, which is what keeps "has a source" meaning
-- "actually playable" everywhere else in the system. Until then the draft holds
-- the allocated identifier here, so the CMS can ask about it, and so publishing
-- an unfinished upload can be refused without asking the provider anything.
ALTER TABLE "ChapterMediaVersion" ADD COLUMN "pendingVideoUid" TEXT;
