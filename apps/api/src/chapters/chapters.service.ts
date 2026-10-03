import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StorageService } from "../storage";
import { lockEditionForBookSlugTx } from "../content-core/revision-lifecycle";
// Only the MIME→extension map, not `audioObjectKey`: that mints keys under the
// `media/` prefix owned by the newer ChapterMedia system, and an object written
// by this legacy uploader must stay distinguishable from one of those.
import { assertUploadableAudio, audioExtension } from "../shared/audio-upload";
import { randomBytes } from "node:crypto";
import type { CreateChapterDto } from "./dto/create-chapter.dto";
import type { UploadAudioDto } from "./dto/upload-audio.dto";

const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  ANNUAL: 2,
  B2B: 3,
};

@Injectable()
export class ChaptersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findOne(slug: string, order: number, userPlan: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        order,
        isPublished: true,
        book: { slug, isPublished: true },
      },
      include: {
        book: { select: { plan: true, slug: true } },
        audios: true,
        exercises: { orderBy: { order: "asc" } },
      },
    });

    if (!chapter) {
      throw new NotFoundException(
        `Chapter ${order} not found in book '${slug}'`,
      );
    }

    if ((PLAN_RANK[chapter.book.plan] ?? 0) > (PLAN_RANK[userPlan] ?? 0)) {
      throw new ForbiddenException(
        `Este contenido requiere plan ${chapter.book.plan}. Actualiza tu plan.`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { book: _book, ...chapterData } = chapter;
    return chapterData;
  }

  async create(slug: string, dto: CreateChapterDto) {
    const book = await this.prisma.book.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);

    const conflict = await this.prisma.chapter.findUnique({
      where: { bookId_order: { bookId: book.id, order: dto.order } },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException(
        `Chapter with order ${dto.order} already exists in book '${slug}'`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // A chapter created here has no `ContentUnit`, so on a book Content Core
      // serves it lands as UNADOPTED — which is exactly the state that makes
      // the book ineligible to be reordered. Taking the edition lock first is
      // what stops this insert from landing between a reorder checking that
      // eligibility and committing its new structure.
      await lockEditionForBookSlugTx(tx, slug);

      const chapter = await tx.chapter.create({
        data: {
          bookId: book.id,
          order: dto.order,
          title: dto.title,
          description: dto.description ?? null,
          durationMinutes: dto.durationMinutes ?? null,
        },
      });
      // Keep book-level denorms in sync. durationMinutes on Book is the sum
      // across chapters; we increment on create (S5) and would decrement on
      // delete (a chapter delete endpoint doesn't exist yet — when it lands,
      // recompute or decrement here).
      await tx.book.update({
        where: { id: book.id },
        data: {
          totalChapters: { increment: 1 },
          durationMinutes: { increment: dto.durationMinutes ?? 0 },
        },
      });
      return chapter;
    });
  }

  async uploadAudio(
    slug: string,
    order: number,
    file: Express.Multer.File,
    dto: UploadAudioDto,
  ) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { order, book: { slug } },
      select: { id: true },
    });
    if (!chapter) {
      throw new NotFoundException(
        `Chapter ${order} not found in book '${slug}'`,
      );
    }

    // `Audio.fileUrl` holds the OBJECT KEY, not a URL — `LectorService.getAudio`
    // mints a short-lived signed GET from it behind the PRO gate, and the audio
    // fixtures have always stored bare keys.
    //
    // This used to call `storage.uploadFile`, which returns
    // `${R2_PUBLIC_URL}/${key}`. That took the master OUT of the signing path:
    // the read side sees an `http` value, passes it through unsigned, and the
    // player gets a URL that R2 refuses because it carries no credentials. A
    // key is also the only one of the two that cannot go stale.
    // Checked BEFORE a key is minted, bytes are stored or a row is written — so
    // a refusal leaves nothing behind in R2 or the database.
    //
    // This endpoint had no file validation at all: `audioExtension` falls back
    // to `m4a`, so any bytes at all — a PDF, an executable — landed in the
    // bucket labelled as audio, with no size ceiling. It is ADMIN-only, which
    // bounds who could do it but not what the object then claims to be.
    //
    // The policy is the catalog's existing one rather than a new one. It accepts
    // the mp3 and m4a family, which is every format production actually holds
    // (3 mp3 + 1 m4a at the time of writing), so nothing in use is narrowed.
    assertUploadableAudio(file);

    // The leaf is server-chosen. It used to be `Date.now()` plus the extension
    // from `file.originalname` — attacker-controlled text deciding where bytes
    // land, and a timestamp anybody could guess. The extension now comes from
    // the MIME we accepted; the object's Content-Type is set from that same
    // value, which is what players actually read.
    const key = `audio/${slug}/${order}/${randomBytes(8).toString("hex")}.${audioExtension(file.mimetype)}`;
    await this.storage.putObject(file.buffer, key, file.mimetype);

    return this.prisma.audio.create({
      data: {
        chapterId: chapter.id,
        title: dto.title,
        fileUrl: key,
        durationSeconds: dto.durationSeconds,
      },
    });
  }
}
