import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { readContentUnit, type ReadUnit } from "./content-read";
import { readBookManifest, type BookManifest } from "./content-manifest";
import { readUnitMarks, type ContentUnitMarks } from "./content-marks";

/**
 * Content Core — CC-6A read adapter (Nest wrapper). Read-only. Delegates to the
 * pure functions so the exact same logic runs in the real-Postgres specs.
 */
@Injectable()
export class ContentReadService {
  constructor(private readonly prisma: PrismaService) {}

  readUnit(editionKey: string, unitKey: string): Promise<ReadUnit> {
    return readContentUnit(this.prisma, editionKey, unitKey);
  }

  // CC-6A.1 — book manifest discovery (bookSlug → editionKey + units).
  readManifest(bookSlug: string): Promise<BookManifest> {
    return readBookManifest(this.prisma, bookSlug);
  }

  // CC-6C — the current user's marks for a unit, keyed by blockKey.
  readUnitMarks(
    userId: string,
    editionKey: string,
    unitKey: string,
  ): Promise<ContentUnitMarks> {
    return readUnitMarks(this.prisma, userId, editionKey, unitKey);
  }
}
