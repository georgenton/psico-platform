import { Injectable } from "@nestjs/common";
import type { CircleFeedbackUsefulness } from "@psico/types";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Círculos, counted — and the limits of what counting is allowed to see.
 *
 * ── Three planes ───────────────────────────────────────────────────────────
 *
 * The domain keeps its own permissions and its own retention. Technical logs
 * are sanitised elsewhere. This is the third plane: aggregates. It reads
 * milestones the domain already committed and two small tables of things
 * people volunteered, and it returns counts. It cannot return a row, an id, or
 * a word anybody wrote, because it never selects one.
 *
 * ── Milestones come from transactions, not from clicks ─────────────────────
 *
 * Every number about invitations and activities is read from the columns the
 * product itself acts on: `acceptedAt`, `revealedAt`, `closedAt`,
 * `cancelledAt`, `readyAt`, `agreedAt`. A browser event saying "they saw the
 * reveal" is a claim; `revealedAt` is a fact the server wrote inside the
 * transaction that made it true. Copying those into an analytics table would
 * create a second source that can disagree with the first.
 *
 * A consequence worth stating: a retried request is one more REQUEST and not
 * one more acceptance, because acceptance is a timestamp that is set once.
 *
 * ── Cohorts, not today-over-today ──────────────────────────────────────────
 *
 * Conversion is measured on a fixed window of things that STARTED in it. An
 * activity created yesterday has not had a week to close, so it is pending —
 * censored, in the statistical sense — and not a failure. "No next action
 * observed" is not abandonment, withdrawal is not a defect, and keeping
 * something private is an answer.
 */

/** 30 days for linkable contributions; 12 months for the weekly facts. */
export const CIRCLE_ANALYTICS_RETENTION = {
  contributionDays: 30,
  factMonths: 12,
} as const;

/**
 * The smallest number of DISTINCT contributors a cell may report.
 *
 * Below it the answer is "muestra insuficiente", not zero — a zero would be a
 * claim about the world, and this is a statement about the sample. Enforced
 * where the data is shaped rather than where it is drawn, so the CSV and the
 * API inherit it instead of re-implementing it.
 *
 * It reduces exposure. It does not make anybody anonymous: one guest can
 * appear in several activities, and a threshold of ten is a threshold, not a
 * proof.
 */
export const CIRCLE_SMALL_CELL_THRESHOLD = 10;

export interface CircleFunnelCohort {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly invitationsCreated: number;
  readonly invitationsAccepted: number;
  readonly invitationsDeclined: number;
  readonly invitationsExpired: number;
  readonly activitiesCreated: number;
  readonly activitiesRevealed: number;
  readonly activitiesClosed: number;
  readonly activitiesCancelled: number;
  /** Still inside their window. Neither success nor failure yet. */
  readonly activitiesPending: number;
  readonly artifactsProposed: number;
  readonly artifactsAgreed: number;
}

export interface CircleDurationSummary {
  readonly label: string;
  readonly samples: number;
  readonly medianMinutes: number | null;
  readonly p90Minutes: number | null;
}

export type CircleCell =
  | { readonly kind: "value"; readonly label: string; readonly value: number }
  | { readonly kind: "suppressed"; readonly label: string };

export interface CircleAnalyticsSummary {
  readonly generatedAt: string;
  readonly cohort: CircleFunnelCohort;
  readonly durations: readonly CircleDurationSummary[];
  readonly byTemplate: readonly {
    readonly templateKey: string;
    readonly templateVersion: number;
    readonly activitiesCreated: number;
    readonly activitiesRevealed: number;
    readonly activitiesClosed: number;
  }[];
  /** Weeks, each cell suppressed on its own contributor count. */
  readonly declaredTopics: readonly {
    readonly weekStart: string;
    readonly cells: readonly CircleCell[];
  }[];
  readonly usefulness: readonly {
    readonly weekStart: string;
    readonly cells: readonly CircleCell[];
  }[];
  readonly help: readonly {
    readonly weekStart: string;
    readonly cells: readonly CircleCell[];
  }[];
  readonly coverage: {
    readonly feedbackContributions: number;
    readonly helpContributions: number;
    readonly note: string;
  };
}

/** Monday 00:00 UTC of the week a moment falls in. */
export function weekStartOf(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // getUTCDay: 0 is Sunday. Monday-based weeks, so Sunday belongs to the week
  // that began six days earlier rather than starting a new one.
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round(((b.getTime() - a.getTime()) / 60_000) * 10) / 10;
}

@Injectable()
export class CirclesAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record one person's optional contribution, and whatever help counters the
   * browser held for them.
   *
   * The caller has already resolved the seat: this method never takes an actor
   * or a template from a request body. `participantId` is the deduplication
   * key — a second submission replaces the first rather than adding a vote.
   */
  async recordFeedback(input: {
    activityId: string;
    participantId: string;
    templateKey: string;
    templateVersion: number;
    topics: readonly string[];
    usefulness: CircleFeedbackUsefulness | null;
    noticeVersion: string;
    helpOpens: readonly {
      fieldKey: string;
      piece: string;
      opens: number;
    }[];
  }): Promise<void> {
    const base = {
      activityId: input.activityId,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
    };

    await this.prisma.circleFeedback.upsert({
      where: { participantId: input.participantId },
      create: {
        ...base,
        participantId: input.participantId,
        topics: [...input.topics],
        usefulness: input.usefulness,
        noticeVersion: input.noticeVersion,
      },
      update: {
        topics: [...input.topics],
        usefulness: input.usefulness,
        noticeVersion: input.noticeVersion,
      },
    });

    for (const open of input.helpOpens) {
      await this.prisma.circleHelpOpen.upsert({
        where: {
          participantId_fieldKey_piece: {
            participantId: input.participantId,
            fieldKey: open.fieldKey,
            piece: open.piece,
          },
        },
        create: {
          ...base,
          participantId: input.participantId,
          fieldKey: open.fieldKey,
          piece: open.piece,
          opens: open.opens,
        },
        // Replaced, not added to: the browser sends a total for the session,
        // and a retry of the same submission must not double it.
        update: { opens: open.opens },
      });
    }
  }

  /**
   * Everything a contributor can withdraw, gone.
   *
   * Contributions that have already been folded into a weekly fact cannot be
   * subtracted from it — the fact has no seat in it to subtract. That limit is
   * stated wherever the promise is made rather than papered over here.
   */
  async forgetContributions(
    participantIds: readonly string[],
  ): Promise<number> {
    if (participantIds.length === 0) return 0;
    const ids = [...participantIds];
    const [feedback, help] = await Promise.all([
      this.prisma.circleFeedback.deleteMany({
        where: { participantId: { in: ids } },
      }),
      this.prisma.circleHelpOpen.deleteMany({
        where: { participantId: { in: ids } },
      }),
    ]);
    return feedback.count + help.count;
  }

  /**
   * Fold what is old enough into weekly facts, then delete it.
   *
   * Idempotent: the fold recomputes a week from the rows still present and
   * writes an absolute value, so running twice writes the same number. It is
   * also order-independent — the delete is scoped by the same cutoff the fold
   * used, so a row that arrives mid-run is either included in both or neither.
   */
  async sweep(now: Date = new Date()): Promise<{
    foldedWeeks: number;
    deletedContributions: number;
    deletedFacts: number;
  }> {
    const cutoff = new Date(now);
    cutoff.setUTCDate(
      cutoff.getUTCDate() - CIRCLE_ANALYTICS_RETENTION.contributionDays,
    );

    const feedback = await this.prisma.circleFeedback.findMany({
      where: { createdAt: { lt: cutoff } },
      select: {
        participantId: true,
        templateKey: true,
        templateVersion: true,
        topics: true,
        usefulness: true,
        createdAt: true,
      },
    });
    const help = await this.prisma.circleHelpOpen.findMany({
      where: { createdAt: { lt: cutoff } },
      select: {
        participantId: true,
        templateKey: true,
        templateVersion: true,
        fieldKey: true,
        piece: true,
        opens: true,
        createdAt: true,
      },
    });

    type Bucket = { value: number; contributors: Set<string> };
    const facts = new Map<string, Bucket & { row: FactRow }>();
    const bump = (row: FactRow, participantId: string, value: number) => {
      const id = `${row.weekStart.toISOString()}|${row.templateKey}|${row.templateVersion}|${row.metric}|${row.dimension}`;
      const found = facts.get(id) ?? {
        row,
        value: 0,
        contributors: new Set<string>(),
      };
      found.value += value;
      found.contributors.add(participantId);
      facts.set(id, found);
    };

    for (const f of feedback) {
      const weekStart = weekStartOf(f.createdAt);
      for (const topic of f.topics) {
        bump(
          {
            weekStart,
            templateKey: f.templateKey,
            templateVersion: f.templateVersion,
            metric: "topic",
            dimension: topic,
          },
          f.participantId,
          1,
        );
      }
      if (f.usefulness) {
        bump(
          {
            weekStart,
            templateKey: f.templateKey,
            templateVersion: f.templateVersion,
            metric: "usefulness",
            dimension: f.usefulness,
          },
          f.participantId,
          1,
        );
      }
    }
    for (const h of help) {
      bump(
        {
          weekStart: weekStartOf(h.createdAt),
          templateKey: h.templateKey,
          templateVersion: h.templateVersion,
          metric: "help",
          dimension: `${h.fieldKey}:${h.piece}`,
        },
        h.participantId,
        h.opens,
      );
    }

    for (const { row, value, contributors } of facts.values()) {
      await this.prisma.circleWeeklyFact.upsert({
        where: {
          weekStart_templateKey_templateVersion_metric_dimension: {
            weekStart: row.weekStart,
            templateKey: row.templateKey,
            templateVersion: row.templateVersion,
            metric: row.metric,
            dimension: row.dimension,
          },
        },
        create: {
          ...row,
          value,
          contributors: contributors.size,
        },
        // Accumulated, because a later sweep folds a DIFFERENT set of rows into
        // the same week: the ones that had not aged out yet last time.
        update: {
          value: { increment: value },
          contributors: { increment: contributors.size },
        },
      });
    }

    const [deletedFeedback, deletedHelp] = await Promise.all([
      this.prisma.circleFeedback.deleteMany({
        where: { createdAt: { lt: cutoff } },
      }),
      this.prisma.circleHelpOpen.deleteMany({
        where: { createdAt: { lt: cutoff } },
      }),
    ]);

    const factCutoff = new Date(now);
    factCutoff.setUTCMonth(
      factCutoff.getUTCMonth() - CIRCLE_ANALYTICS_RETENTION.factMonths,
    );
    const deletedFacts = await this.prisma.circleWeeklyFact.deleteMany({
      where: { weekStart: { lt: factCutoff } },
    });

    return {
      foldedWeeks: facts.size,
      deletedContributions: deletedFeedback.count + deletedHelp.count,
      deletedFacts: deletedFacts.count,
    };
  }

  /** The panel. Aggregates only — there is no row-level read in here. */
  async summary(
    options: { now?: Date; windowDays?: number } = {},
  ): Promise<CircleAnalyticsSummary> {
    const now = options.now ?? new Date();
    const windowDays = options.windowDays ?? 30;
    const windowStart = new Date(now);
    windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);

    const [invitations, activities, artifacts, participants] =
      await Promise.all([
        this.prisma.circleInvitation.findMany({
          where: { createdAt: { gte: windowStart, lte: now } },
          select: {
            createdAt: true,
            acceptedAt: true,
            declinedAt: true,
            expiresAt: true,
          },
        }),
        this.prisma.circleActivity.findMany({
          where: { createdAt: { gte: windowStart, lte: now } },
          select: {
            createdAt: true,
            revealedAt: true,
            closedAt: true,
            cancelledAt: true,
            status: true,
            templateKey: true,
            templateVersion: true,
          },
        }),
        this.prisma.circleArtifact.findMany({
          where: { createdAt: { gte: windowStart, lte: now } },
          select: { createdAt: true, agreedAt: true },
        }),
        this.prisma.circleActivityParticipant.findMany({
          where: { createdAt: { gte: windowStart, lte: now } },
          select: { createdAt: true, readyAt: true },
        }),
      ]);

    const cohort: CircleFunnelCohort = {
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      invitationsCreated: invitations.length,
      invitationsAccepted: invitations.filter((i) => i.acceptedAt !== null)
        .length,
      invitationsDeclined: invitations.filter((i) => i.declinedAt !== null)
        .length,
      // Expired is a fact about the clock, not about the person: an unaccepted
      // invitation whose window has closed. It is not "rejected".
      invitationsExpired: invitations.filter(
        (i) =>
          i.acceptedAt === null && i.declinedAt === null && i.expiresAt < now,
      ).length,
      activitiesCreated: activities.length,
      activitiesRevealed: activities.filter((a) => a.revealedAt !== null)
        .length,
      activitiesClosed: activities.filter((a) => a.closedAt !== null).length,
      activitiesCancelled: activities.filter((a) => a.cancelledAt !== null)
        .length,
      activitiesPending: activities.filter(
        (a) => a.closedAt === null && a.cancelledAt === null,
      ).length,
      artifactsProposed: artifacts.length,
      artifactsAgreed: artifacts.filter((a) => a.agreedAt !== null).length,
    };

    const invitationToAccept = invitations
      .filter((i) => i.acceptedAt)
      .map((i) => minutesBetween(i.createdAt, i.acceptedAt as Date))
      .sort((a, b) => a - b);
    const createToReveal = activities
      .filter((a) => a.revealedAt)
      .map((a) => minutesBetween(a.createdAt, a.revealedAt as Date))
      .sort((a, b) => a - b);
    const revealToClose = activities
      .filter((a) => a.revealedAt && a.closedAt)
      .map((a) => minutesBetween(a.revealedAt as Date, a.closedAt as Date))
      .sort((a, b) => a - b);
    const joinToReady = participants
      .filter((p) => p.readyAt)
      .map((p) => minutesBetween(p.createdAt, p.readyAt as Date))
      .sort((a, b) => a - b);

    const durations: CircleDurationSummary[] = [
      ["Invitación → aceptación", invitationToAccept],
      ["Creación → revelado", createToReveal],
      ["Revelado → cierre", revealToClose],
      ["Entrar → confirmar", joinToReady],
    ].map(([label, samples]) => ({
      label: label as string,
      samples: (samples as number[]).length,
      medianMinutes: percentile(samples as number[], 0.5),
      // A high percentile on four samples is the maximum with a fancy name.
      p90Minutes:
        (samples as number[]).length >= CIRCLE_SMALL_CELL_THRESHOLD
          ? percentile(samples as number[], 0.9)
          : null,
    }));

    const byTemplateMap = new Map<
      string,
      {
        templateKey: string;
        templateVersion: number;
        activitiesCreated: number;
        activitiesRevealed: number;
        activitiesClosed: number;
      }
    >();
    for (const a of activities) {
      const id = `${a.templateKey}@${a.templateVersion}`;
      const found = byTemplateMap.get(id) ?? {
        templateKey: a.templateKey,
        templateVersion: a.templateVersion,
        activitiesCreated: 0,
        activitiesRevealed: 0,
        activitiesClosed: 0,
      };
      found.activitiesCreated += 1;
      if (a.revealedAt) found.activitiesRevealed += 1;
      if (a.closedAt) found.activitiesClosed += 1;
      byTemplateMap.set(id, found);
    }

    const [live, folded] = await Promise.all([
      this.liveContributionCells(windowStart, now),
      this.foldedCells(windowStart),
    ]);

    return {
      generatedAt: now.toISOString(),
      cohort,
      durations,
      byTemplate: [...byTemplateMap.values()].sort((a, b) =>
        a.templateKey === b.templateKey
          ? a.templateVersion - b.templateVersion
          : a.templateKey.localeCompare(b.templateKey),
      ),
      declaredTopics: mergeWeeks(live.topic, folded.topic),
      usefulness: mergeWeeks(live.usefulness, folded.usefulness),
      help: mergeWeeks(live.help, folded.help),
      coverage: {
        feedbackContributions: live.feedbackCount,
        helpContributions: live.helpCount,
        note:
          "Las aperturas de ayuda se cuentan en el navegador y sólo se envían " +
          "si la persona acepta contribuir al final. Quien se va antes no " +
          "aparece aquí: la cobertura es parcial a propósito.",
      },
    };
  }

  /** Cells from contributions still inside the 30-day window. */
  private async liveContributionCells(from: Date, to: Date) {
    const [feedback, help] = await Promise.all([
      this.prisma.circleFeedback.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          participantId: true,
          topics: true,
          usefulness: true,
          createdAt: true,
        },
      }),
      this.prisma.circleHelpOpen.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          participantId: true,
          fieldKey: true,
          piece: true,
          opens: true,
          createdAt: true,
        },
      }),
    ]);

    const topic = new Map<string, Map<string, Bucket>>();
    const usefulness = new Map<string, Map<string, Bucket>>();
    const helpCells = new Map<string, Map<string, Bucket>>();

    for (const f of feedback) {
      const week = weekStartOf(f.createdAt).toISOString();
      for (const t of f.topics) add(topic, week, t, 1, f.participantId);
      if (f.usefulness) {
        add(usefulness, week, f.usefulness, 1, f.participantId);
      }
    }
    for (const h of help) {
      const week = weekStartOf(h.createdAt).toISOString();
      add(
        helpCells,
        week,
        `${h.fieldKey}:${h.piece}`,
        h.opens,
        h.participantId,
      );
    }

    return {
      topic,
      usefulness,
      help: helpCells,
      feedbackCount: feedback.length,
      helpCount: help.length,
    };
  }

  /** Cells already folded into weekly facts. */
  private async foldedCells(from: Date) {
    const rows = await this.prisma.circleWeeklyFact.findMany({
      where: { weekStart: { gte: weekStartOf(from) } },
      select: {
        weekStart: true,
        metric: true,
        dimension: true,
        value: true,
        contributors: true,
      },
    });
    const topic = new Map<string, Map<string, Bucket>>();
    const usefulness = new Map<string, Map<string, Bucket>>();
    const help = new Map<string, Map<string, Bucket>>();
    const target = (metric: string) =>
      metric === "topic" ? topic : metric === "usefulness" ? usefulness : help;

    for (const r of rows) {
      const week = r.weekStart.toISOString();
      const map = target(r.metric);
      const weekMap = map.get(week) ?? new Map<string, Bucket>();
      const cell = weekMap.get(r.dimension) ?? {
        value: 0,
        contributors: new Set<string>(),
        contributorCount: 0,
      };
      cell.value += r.value;
      cell.contributorCount += r.contributors;
      weekMap.set(r.dimension, cell);
      map.set(week, weekMap);
    }
    return { topic, usefulness, help };
  }
}

interface FactRow {
  weekStart: Date;
  templateKey: string;
  templateVersion: number;
  metric: string;
  dimension: string;
}

interface Bucket {
  value: number;
  contributors: Set<string>;
  contributorCount: number;
}

function add(
  map: Map<string, Map<string, Bucket>>,
  week: string,
  dimension: string,
  value: number,
  participantId: string,
): void {
  const weekMap = map.get(week) ?? new Map<string, Bucket>();
  const cell = weekMap.get(dimension) ?? {
    value: 0,
    contributors: new Set<string>(),
    contributorCount: 0,
  };
  cell.value += value;
  cell.contributors.add(participantId);
  weekMap.set(dimension, cell);
  map.set(week, weekMap);
}

/**
 * Live rows and folded facts for the same week, then suppressed together.
 *
 * Suppression happens HERE, once, on the merged total — not on each half. A
 * cell with six live contributors and six folded ones has twelve, and
 * suppressing each half separately would hide a cell that clears the threshold
 * while also making the two halves subtractable from a total that did not.
 */
function mergeWeeks(
  live: Map<string, Map<string, Bucket>>,
  folded: Map<string, Map<string, Bucket>>,
): { weekStart: string; cells: CircleCell[] }[] {
  const weeks = new Set([...live.keys(), ...folded.keys()]);
  const out: { weekStart: string; cells: CircleCell[] }[] = [];

  for (const week of [...weeks].sort()) {
    const merged = new Map<string, { value: number; contributors: number }>();
    for (const [dimension, cell] of live.get(week) ?? []) {
      const found = merged.get(dimension) ?? { value: 0, contributors: 0 };
      found.value += cell.value;
      found.contributors += cell.contributors.size;
      merged.set(dimension, found);
    }
    for (const [dimension, cell] of folded.get(week) ?? []) {
      const found = merged.get(dimension) ?? { value: 0, contributors: 0 };
      found.value += cell.value;
      found.contributors += cell.contributorCount;
      merged.set(dimension, found);
    }

    const cells: CircleCell[] = [...merged.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, cell]) =>
        cell.contributors >= CIRCLE_SMALL_CELL_THRESHOLD
          ? { kind: "value" as const, label, value: cell.value }
          : { kind: "suppressed" as const, label },
      );
    out.push({ weekStart: week, cells });
  }
  return out;
}
