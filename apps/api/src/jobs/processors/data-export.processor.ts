import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StorageService } from "../../storage";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResendService } from "../../notifications";
import { emailShell, escape } from "../../notifications/templates/base";
import { JobName, QueueName, type DataExportJobPayload } from "../queue-names";

/**
 * Generates a user data export and uploads it to R2.
 *
 * Qué sale, en tres grupos — y la diferencia entre ellos importa, porque
 * presentar una decisión de alcance como una imposibilidad criptográfica es
 * excusarse con una propiedad que no está ahí.
 *
 * INCLUIDO:
 *   - perfil, preferencias, ajustes del lector, de notificaciones y de
 *     privacidad
 *   - el ánimo ACTUAL y las rachas (`mood`, `moodUpdatedAt`, los dos
 *     `streakDays`), que viajan dentro del bloque `user`
 *   - progreso de lectura (`UserProgress` con metadatos del capítulo)
 *   - suscripción
 *   - sesiones de guía
 *
 * REQUIERE LA CLAVE DE LA PERSONA, y además HOY NO SE RECOGE — las dos cosas
 * a la vez, porque decir sólo la primera sugiere que el ciphertext está en el
 * archivo y no está: este método no consulta ninguna de las dos tablas.
 *   - entradas del Diario (`textCiphertext` + `textNonce`)
 *   - los mensajes que la persona escribió a Eco (los mismos campos)
 *
 * NO IMPLEMENTADO en esta exportación, aunque el servidor SÍ podría leerlo:
 *   - las respuestas de Eco (`assistantText`, en claro)
 *   - el HISTORIAL de ánimo, check-ins, resonancias
 *   - marcas de lectura (highlights, anotaciones)
 *   - eventos de autenticación
 *
 * Este bloque decía antes que el Diario y los hilos de Eco llegarían «en el
 * Sprint S6/S9» y que ambos eran cifrado opaco. Los dos sprints cerraron hace
 * meses, y lo segundo nunca fue cierto de las respuestas del asistente. Qué
 * incluir sigue siendo una decisión de alcance abierta (D-EXP); lo que no
 * puede volver es afirmar una imposibilidad donde hay una omisión.
 *
 * Output format: JSON with `_meta.exportSchemaVersion`. Si algún día entra una
 * categoría nueva, se sube la versión para que los consumidores lo detecten.
 *
 * On success: writes file URL + status="READY" + emails the user.
 * On final failure (after retries): writes status="FAILED" and logs.
 */
@Processor(QueueName.DATA_EXPORT)
export class DataExportProcessor extends WorkerHost {
  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly resend: ResendService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async process(job: Job<DataExportJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_DATA_EXPORT) {
      throw new Error(`DataExportProcessor unknown job name: ${job.name}`);
    }

    const { requestId, userId } = job.data;
    this.logger.log(
      `Building data export ${requestId} for user ${userId} (attempt ${job.attemptsMade + 1})`,
    );

    // Defensive: confirm the request still exists. The user may have
    // requested deletion of their account in the meantime — in which case
    // we cancel the export.
    const request = await this.prisma.dataExportRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { select: { id: true, email: true, deleteRequestedAt: true } },
      },
    });
    if (!request || request.user.deleteRequestedAt) {
      this.logger.warn(
        `Skipping export ${requestId} — request missing or user pending deletion`,
      );
      return;
    }

    try {
      // 1. Mark PROCESSING so concurrent retries can detect in-flight work.
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: "PROCESSING" },
      });

      // 2. Assemble payload.
      const payload = await this.buildPayload(userId);

      // 3. Upload JSON to R2.
      //
      // `putObject`, and what we persist is the KEY. This used to call
      // `uploadFile`, which returns `${R2_PUBLIC_URL}/${key}` — and that base is
      // the authenticated S3 endpoint, so the link mailed to the user was never
      // downloadable by a browser, and on a box without the variable the job
      // threw `R2_PUBLIC_URL_NOT_CONFIGURED` and burned its retries.
      //
      // A key is also the only representation that is safe to store here. This
      // file is the user's whole profile, reading history and subscription; a
      // long-lived URL sitting in a database row is a link that works for
      // anybody who ever sees it. The key is worthless on its own — it is signed
      // only when the owner asks, through `UsersService.getDataExportDownload`.
      const buffer = Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
      const key = `data-exports/${userId}/${requestId}.json`;
      await this.storage.putObject(buffer, key, "application/json");

      // 4. Mark READY + persist the object key.
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: "READY", fileUrl: key, completedAt: new Date() },
      });

      // 5. Notify the user — separate Resend send (could be queued through
      //    the email queue, but we're already in a worker so a direct call
      //    is fine).
      // The mail no longer carries a link to the file itself. It used to, and
      // that is a copy of the user's entire export living in an inbox forever —
      // readable by anyone who later reads that mailbox. It now points at the
      // profile page, where the download is one authenticated click and the
      // signed URL lives for minutes.
      const appUrl = this.config.get("APP_URL", { infer: true });
      const profileUrl = `${appUrl.replace(/\/$/, "")}/dashboard/perfil`;
      const html = emailShell({
        preheader: "Tu exportación de datos está lista.",
        bodyHtml: `
          <p style="margin:0 0 16px; font-size:17px; font-weight:600;">Tu exportación está lista</p>
          <p style="margin:0 0 16px;">
            Generamos un archivo JSON con tu perfil, progreso de lectura y suscripción.
          </p>
          <p style="margin:24px 0;">
            <a href="${escape(profileUrl)}"
               style="display:inline-block; padding:14px 28px; border-radius:14px; background:#7C5BC4; color:#FFFFFF; text-decoration:none; font-weight:600; font-size:15px;">
              Descargar desde mi perfil
            </a>
          </p>
          <p style="margin:24px 0 0; color:#7E6F5F; font-size:13px;">
            Te pedimos iniciar sesión para descargarla: el archivo contiene tus datos
            y no viaja en un enlace público. Desde ahí también puedes pedir otra.
          </p>`,
      });
      await this.resend.send({
        to: request.user.email,
        subject: "Tu exportación de datos · Psico Platform",
        html,
        text: `Tu exportación está lista. Descárgala, con tu sesión iniciada, en: ${profileUrl}`,
        tag: "data-export-ready",
      });

      this.logger.log(
        `Data export ${requestId} READY · ${buffer.length} bytes uploaded`,
      );
    } catch (err) {
      // Final-attempt bookkeeping. On non-final attempts BullMQ will retry,
      // and we DON'T want to mark FAILED yet — the next retry might succeed.
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await this.prisma.dataExportRequest.update({
          where: { id: requestId },
          data: { status: "FAILED" },
        });
        this.logger.error(
          `Data export ${requestId} FINAL FAILURE: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
      throw err; // bubble up so BullMQ retries / marks failed
    }
  }

  /**
   * Assembles the export payload. Each section returns its own shape so
   * the JSON file is self-documenting.
   */
  private async buildPayload(userId: string) {
    const [user, progress, subscription, guideSessions] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          preferences: true,
          readerPreferences: true,
          notificationSettings: true,
          privacySettings: true,
        },
      }),
      this.prisma.userProgress.findMany({
        where: { userId },
        include: {
          chapter: {
            select: {
              title: true,
              order: true,
              book: { select: { slug: true, title: true } },
            },
          },
          // A native chapter has no Chapter row, and a person's reading history
          // is theirs whether or not the chapter came from the legacy tables.
          // Resolved through stable relationships — the unit and its edition —
          // so a completed chapter that has since been unplaced or unpublished
          // still exports rather than vanishing.
          contentUnit: {
            select: {
              id: true,
              unitKey: true,
              edition: { select: { slug: true, editionKey: true } },
              // The most recent PUBLISHED placement, and the version IT
              // referenced. Never the newest ContentUnitVersion: that can be an
              // unpublished draft, and a reader's export is not a place to hand
              // out editorial work in progress.
              //
              // Using the last published placement rather than only the current
              // one is what lets a completion survive its chapter being
              // unpublished — the progress is real history and stays exportable.
              manifestEntries: {
                where: { revision: { status: "PUBLISHED" } },
                orderBy: { revision: { number: "desc" } },
                take: 1,
                select: {
                  order: true,
                  unitVersion: { select: { title: true } },
                },
              },
            },
          },
        },
        orderBy: { completedAt: "asc" },
      }),
      this.prisma.subscription.findUnique({ where: { userId } }),
      // CC-7.4B: the user's guided sessions + their accepted-step ledger.
      // Catalog keys, states, timestamps and the objective result enum ONLY —
      // never GuideCommandReceipt, idempotency keys or fingerprints (internal
      // operation data, ADR 0019 §9).
      this.prisma.guideSession.findMany({
        where: { userId },
        orderBy: { startedAt: "asc" },
        include: { steps: { orderBy: { order: "asc" } } },
      }),
    ]);

    if (!user) throw new Error(`User ${userId} not found during export`);

    // Book titles for the native rows, resolved once through the edition slug.
    const nativeSlugs = [
      ...new Set(
        progress
          .map((p) => p.contentUnit?.edition.slug)
          .filter((slug): slug is string => Boolean(slug)),
      ),
    ];
    const nativeBookTitles = new Map(
      (
        await this.prisma.book.findMany({
          where: { slug: { in: nativeSlugs } },
          select: { slug: true, title: true },
        })
      ).map((b) => [b.slug, b.title]),
    );

    return {
      _meta: {
        exportSchemaVersion: 1,
        generatedAt: new Date().toISOString(),
        // Tres grupos, y la diferencia entre ellos importa.
        //
        // La primera versión de esta nota decía que el Diario y Eco «están
        // cifrados de extremo a extremo y el servidor no tiene la clave».
        // Eso es cierto del Diario y de los MENSAJES de la persona
        // (`textCiphertext` + `textNonce`), y **falso** de las respuestas de
        // Eco: se guardan en `assistantText`, en claro. Presentar una decisión
        // de alcance como una imposibilidad criptográfica es excusarse con una
        // propiedad que ahí no existe.
        //
        // Tampoco promete una fecha ni una atención manual: la versión
        // anterior invitaba a escribir «y te decimos qué podemos entregar»,
        // que es un compromiso que nadie ha definido.
        //
        // Y tres correcciones más, de la misma familia — la nota describía un
        // archivo distinto del que se entrega:
        //
        //   1. Declaraba AUSENTES los ajustes de notificaciones, que este
        //      mismo método incluye (`notificationSettings`, arriba). Igual
        //      con los de privacidad, que no nombraba en ninguno de los tres
        //      grupos.
        //   2. Declaraba ausente «tu registro de ánimo» sin más, cuando el
        //      bloque `user` sí lleva el ánimo ACTUAL (`mood`,
        //      `moodUpdatedAt`). Lo que falta es el historial, y decirlo al
        //      revés hace creer que no se exporta nada del ánimo.
        //   3. El grupo del medio decía «requiere tu clave y por eso no puede
        //      venir aquí como texto legible», que se lee como «está, pero
        //      cifrado». No está: este método no consulta `DiaryEntry` ni
        //      `EcoMessage`, así que no sale ni una línea de cifrado. Las dos
        //      cosas son ciertas a la vez —no se podría leer Y tampoco se
        //      incluye— y hay que decir las dos.
        //
        // Qué incluir sigue siendo una decisión de alcance abierta (D-EXP).
        //
        // `data-export-scope.pg-spec.ts` coteja esta nota contra el payload
        // real en las dos direcciones — que nombre lo que trae y que no
        // declare ausente lo que trae—, y además contra el ESQUEMA, que es la
        // dirección que faltaba: una tabla que la base guarda y este método
        // nunca consulta no aparece en el payload, así que ninguna de las dos
        // primeras podía verla. Por eso la enumeración de lo ausente se
        // declara como «las principales, no todas»: era verdad y se leía como
        // si fuera la lista completa.
        note:
          "Este archivo incluye: tu perfil, tus preferencias, tus ajustes " +
          "del lector, de notificaciones y de privacidad, tu ánimo actual y " +
          "tus rachas, tu progreso de lectura, tu suscripción y tus " +
          "sesiones de guía. " +
          "Requiere tu clave, así que no podría venir aquí como texto " +
          "legible — y hoy tampoco viene cifrado, porque esta exportación no " +
          "lo recoge: tu Diario y los mensajes que tú escribiste a Eco, " +
          "cifrados de extremo a extremo con una clave que sólo tú tienes. " +
          "No está incluido en esta exportación, aunque no dependa de tu " +
          "clave: las respuestas de Eco, el historial de tu ánimo, los " +
          "check-ins, las resonancias, tus marcas y notas de lectura y los " +
          "eventos de inicio de sesión. " +
          "Esa lista son las principales, no todas: el archivo todavía no " +
          "recoge todo lo que el servicio guarda de ti — quedan fuera, por " +
          "ejemplo, tus reseñas, tus favoritos, tu actividad de lectura y " +
          "los resúmenes que el servicio escribe sobre tu semana. Estamos " +
          "ampliándolo; mientras tanto, preferimos decírtelo a que lo " +
          "supongas.",
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        name: user.name,
        city: user.city,
        avatarUrl: user.avatarUrl,
        role: user.role,
        plan: user.plan,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider,
        createdAt: user.createdAt,
        mood: user.mood,
        moodUpdatedAt: user.moodUpdatedAt,
        currentStreakDays: user.currentStreakDays,
        longestStreakDays: user.longestStreakDays,
      },
      profile: user.profile,
      preferences: user.preferences,
      readerPreferences: user.readerPreferences,
      notificationSettings: user.notificationSettings,
      privacySettings: user.privacySettings,
      progress: progress.map((p) => ({
        // Legacy and native entries share a shape so the export stays readable;
        // each side fills it from whichever identity the row actually has.
        chapterTitle:
          p.chapter?.title ??
          p.contentUnit?.manifestEntries[0]?.unitVersion.title ??
          null,
        // `null` when a native chapter is no longer placed in the published
        // manifest. The completion is still real; only its position is gone.
        chapterOrder:
          p.chapter?.order ?? p.contentUnit?.manifestEntries[0]?.order ?? null,
        bookSlug: p.chapter?.book.slug ?? p.contentUnit?.edition.slug ?? null,
        // A slug is not a title. Book is still legacy-owned in this phase, so
        // the edition's slug is the bridge to the real one; null is honest when
        // there is no Book row rather than labelling a slug as a title.
        bookTitle:
          p.chapter?.book.title ??
          (p.contentUnit
            ? (nativeBookTitles.get(p.contentUnit.edition.slug) ?? null)
            : null),
        contentUnitId: p.contentUnitId,
        completedAt: p.completedAt,
        score: p.score,
      })),
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            createdAt: subscription.createdAt,
          }
        : null,
      guideSessions: guideSessions.map((session) => ({
        guideKey: session.guideKey,
        guideVersion: session.guideVersion,
        status: session.status,
        editionId: session.editionId,
        unitId: session.unitId,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        cancelledAt: session.cancelledAt,
        steps: session.steps.map((step) => ({
          stepKey: step.stepKey,
          kind: step.kind,
          conceptKey: step.conceptKey,
          itemKey: step.itemKey,
          exerciseKey: step.exerciseKey,
          confirmationKey: step.confirmationKey,
          recallResult: step.recallResult,
          acceptedAt: step.acceptedAt,
        })),
      })),
    };
  }
}
