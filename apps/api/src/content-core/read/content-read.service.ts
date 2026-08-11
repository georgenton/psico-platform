import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config";
import { PrismaService } from "../../prisma";
import { withResolvedImageUrls } from "../../shared/content-asset";
import { readContentUnit, type ReadUnit } from "./content-read";
import { readBookManifest, type BookManifest } from "./content-manifest";
import { readUnitMarks, type ContentUnitMarks } from "./content-marks";

/**
 * Content Core — CC-6A read adapter (Nest wrapper). Read-only. Delegates to the
 * pure functions so the exact same logic runs in the real-Postgres specs.
 */
@Injectable()
export class ContentReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * One unit, with its images made fetchable.
   *
   * The resolution happens HERE rather than in `readContentUnit` so that pure
   * function stays pure — the real-Postgres specs exercise storage semantics
   * and have no business knowing how bytes reach a browser. This is the seam
   * where content leaves the server, which is exactly where a private-bucket
   * identity has to become something a client can follow.
   */
  async readUnit(editionKey: string, unitKey: string): Promise<ReadUnit> {
    const unit = await readContentUnit(this.prisma, editionKey, unitKey);
    const base = this.config.get("R2_PUBLIC_URL", { infer: true }) as
      | string
      | undefined;
    return { ...unit, blocks: withResolvedImageUrls(unit.blocks, base) };
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
