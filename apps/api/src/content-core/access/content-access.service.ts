import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  assertContentAccess,
  resolveBookTarget,
  resolveUnitTarget,
  resolveWriteTarget,
} from "./content-access";

/**
 * CC-6E — the server-owned content access policy as a Nest provider. Every
 * content surface (lector, Content Core read, marks read, mark writes) calls
 * one of these methods, all of which funnel into the single `assertContentAccess`
 * gate. No surface re-implements the FREE/PRO condition.
 */
@Injectable()
export class ContentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The primitive contract. Used by `/api/lector` with a (bookId, chapterOrder)
   * it already has. Loads the book's plan (single source) and applies the gate.
   */
  async assertCanReadContent(input: {
    userId: string;
    userPlan: string;
    bookId: string;
    chapterOrder: number;
  }): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { id: input.bookId },
      select: { plan: true },
    });
    if (!book) throw new NotFoundException("BOOK_NOT_FOUND");
    assertContentAccess({
      userPlan: input.userPlan,
      bookPlan: book.plan,
      chapterOrder: input.chapterOrder,
    });
  }

  /** Content Core read + marks GET — resolve the (editionKey, unitKey) then gate. */
  async assertCanReadUnit(input: {
    userId: string;
    userPlan: string;
    editionKey: string;
    unitKey: string;
  }): Promise<void> {
    const target = await resolveUnitTarget(
      this.prisma,
      input.editionKey,
      input.unitKey,
    );
    assertContentAccess({
      userPlan: input.userPlan,
      bookPlan: target.bookPlan,
      chapterOrder: target.chapterOrder,
    });
  }

  /** Mark create — resolve the write target then gate (a blockKey grants nothing). */
  async assertCanWriteMark(input: {
    userId: string;
    userPlan: string;
    blockKey?: string;
    blockId?: string;
  }): Promise<void> {
    const target = await resolveWriteTarget(this.prisma, {
      blockKey: input.blockKey,
      blockId: input.blockId,
    });
    assertContentAccess({
      userPlan: input.userPlan,
      bookPlan: target.bookPlan,
      chapterOrder: target.chapterOrder,
    });
  }

  /**
   * Manifest — the book's discovery metadata. Product-visible for any existing
   * book (chapter 1 is a free preview, so the gate never denies here); the real
   * per-chapter gating happens at the read endpoint. Still validates the book
   * exists so unknown books don't leak a shape.
   */
  async assertCanSeeBook(input: {
    userId: string;
    userPlan: string;
    bookSlug: string;
  }): Promise<void> {
    const { bookPlan } = await resolveBookTarget(this.prisma, input.bookSlug);
    assertContentAccess({
      userPlan: input.userPlan,
      bookPlan,
      chapterOrder: 1,
    });
  }
}
