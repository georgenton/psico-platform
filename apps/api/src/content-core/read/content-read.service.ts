import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { readContentUnit, type ReadUnit } from "./content-read";

/**
 * Content Core — CC-6A read adapter (Nest wrapper). Read-only. Delegates to the
 * pure `readContentUnit` so the exact same logic runs in the real-Postgres specs.
 */
@Injectable()
export class ContentReadService {
  constructor(private readonly prisma: PrismaService) {}

  readUnit(editionKey: string, unitKey: string): Promise<ReadUnit> {
    return readContentUnit(this.prisma, editionKey, unitKey);
  }
}
