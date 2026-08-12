import { BadRequestException } from "@nestjs/common";

/**
 * A reader write names its chapter once.
 *
 * Heartbeat and completion accept two stable identities — `chapterId` for a
 * legacy chapter, `contentUnitId` for a native one — beside the positional
 * `chapterOrder` that older clients still send. Exactly one of the two is
 * meaningful for any given chapter: a chapter served by a `Chapter` row has no
 * native write identity, and a native chapter has no `Chapter` row.
 *
 * So a request carrying both is not a request we can satisfy — it describes two
 * different chapters. Picking one would mean writing somebody's progress to a
 * chapter they may not have opened, and doing it silently, which is the failure
 * mode this whole change exists to remove.
 */
export function assertSingleWriteIdentity(input: {
  chapterId?: string;
  contentUnitId?: string;
}): void {
  if (input.chapterId && input.contentUnitId) {
    throw new BadRequestException("AMBIGUOUS_READER_WRITE_IDENTITY");
  }
}
