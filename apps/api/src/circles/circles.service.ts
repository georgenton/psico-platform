import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleInvitationRepository } from "./circle-invitation.repository";
import {
  CircleStorageError,
  invitationIsUsable,
} from "./circle-invitation.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleEventRepository } from "./circle-event.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleActivityRepository } from "./circle-activity.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleMemberRepository } from "./circle-member.repository";
import type {
  CircleMemberDb,
  CircleMemberTx,
} from "./circle-member.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesRolloutService } from "./circles-rollout.service";
import { CirclesError } from "./circles-http-errors";
import { safeInviterFirstName } from "./circles-inviter-name";
import type { CircleInvitationPreview } from "@psico/types";
import { productionCircleTemplateRegistry } from "@psico/types";
import {
  hashSecret,
  mintInvitationCode,
  mintInvitationToken,
  normalizeCode,
  MAX_PRESENTED_SECRET_LENGTH,
} from "./circles-secrets";

/**
 * The Círculos access domain (PR2).
 *
 * This cut implements exactly two things end to end — minting an invitation,
 * and trading one for an opaque guest session — plus the read that lets someone
 * check a link without spending it. Creating a Dúo, confirming a share, the
 * reveal barrier, artifacts and withdrawal all belong to PR3 and are absent
 * rather than stubbed.
 *
 * Under `pilot`, being handed a valid secret is not enough. The invitation has
 * to have been minted by a member who is still `ACTIVE`, in the circle the
 * invitation names, whose user is in the allowlist RIGHT NOW. A guest inherits
 * the inviter's enablement and cannot exceed it — which is what makes "the
 * guest surface is up under pilot" safe rather than a hole. The check runs in
 * `inspect` AND again inside the exchange transaction, because an allowlist
 * change or a member leaving between the two would otherwise slip a canje
 * through.
 *
 * ── LOCK ORDER — MANDATORY for every future Círculos command ──────────────
 *
 *     CircleMember  ->  CircleInvitation  ->  CircleGuestSession  ->
 *     CircleActivity  ->  CircleActivityParticipant  ->  CircleArtifact
 *
 * `exchange` takes the rows it needs in that order, and so does every command
 * in `circles-participation.service.ts`. This is not a style preference: two
 * commands that take the same rows in opposite orders deadlock under
 * contention, and the failure surfaces as a random 500 on a Dúo that two people
 * are using at the same time — the hardest kind of bug to reproduce and the
 * easiest to avoid.
 *
 * If a future command genuinely needs a different order, the fix is to change
 * this rule and every command with it, not to make an exception.
 *
 * The invariant the whole file is arranged around: **a negative answer is one
 * answer**. A secret that never existed, one that expired, one already used and
 * one revoked leave through the same `CIRCLE_INVITATION_UNUSABLE`, having done
 * the same work. Nothing in here has a branch that produces a different code,
 * a different status or a materially different amount of database work for a
 * different reason, because that branch is exactly what an enumeration attack
 * reads.
 */

/** How long a freshly minted invitation stays usable. */
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** How long a guest session lasts once an invitation has been traded for it. */
export const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface MintInvitationInput {
  readonly circleId: string;
  readonly activityId: string;
  readonly createdByMemberId: string;
  /** A link-only invitation omits the short code. */
  readonly withCode?: boolean;
  readonly now?: Date;
}

/**
 * The ONLY shape a raw secret ever travels in, and it travels exactly once —
 * out of `mintInvitation`, into the caller's hands. Nothing persists it,
 * re-derives it or logs it, and there is no method that returns it a second
 * time. Losing it means minting a new invitation.
 */
export interface MintedInvitation {
  readonly invitationId: string;
  readonly participantId: string;
  readonly rawToken: string;
  readonly rawCode: string | null;
  readonly expiresAt: Date;
}

export interface ExchangedGuestSession {
  readonly guestSessionId: string;
  readonly rawGuestToken: string;
  readonly expiresAt: Date;
}

/**
 * The invitation's author must still be a live member of its circle.
 *
 * ── Why this is one function and not two copies ────────────────────────────
 *
 * It used to be two, and they drifted. Both `assertInviterEligible` (the fast
 * exit, used by `inspect`) and `lockAndAssertInviter` (the authoritative one,
 * used by `exchange`) returned EARLY under `on` — so under general
 * availability nothing checked that the member existed, belonged to this
 * circle, or was still `ACTIVE`. The reasoning behind the early return was
 * "under `on` there is no allowlist to consult", which is true and is not the
 * same as "there is nothing to check".
 *
 * What that produced was not a theoretical hole. PR3's participation path
 * DOES revalidate the inviter in every mode, so the system contradicted
 * itself in a way a person would experience:
 *
 *   1. a member creates an invitation, then leaves;
 *   2. under `on`, `inspect` says the link is usable;
 *   3. `exchange` consumes it, accepts the seat, moves the activity to
 *      `PREPARING`, mints a guest session and writes events;
 *   4. the guest's very first command is refused, because participation
 *      re-derives the inviter and finds them `LEFT`.
 *
 * Somebody accepts an invitation, watches the other person's screen say the
 * Dúo has started, and then cannot do anything — with every write already
 * committed. The membership predicate is therefore mode-independent, and only
 * the ALLOWLIST is `pilot`-only.
 *
 * Throws the one uniform code. Which of the three conditions failed is not
 * something the holder of a link gets to learn.
 */
function assertInviterMembership(
  member: { circleId: string; status: string } | null | undefined,
  circleId: string,
): void {
  if (!member || member.circleId !== circleId || member.status !== "ACTIVE") {
    throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");
  }
}

@Injectable()
export class CirclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: CircleInvitationRepository,
    private readonly guestSessions: CircleGuestSessionRepository,
    private readonly events: CircleEventRepository,
    private readonly members: CircleMemberRepository,
    private readonly rollout: CirclesRolloutService,
    private readonly activities: CircleActivityRepository,
  ) {}

  /**
   * Mint an invitation and the seat it invites into.
   *
   * There is no HTTP route for this in PR2 — creating a Dúo is PR3's, and
   * shipping half of it behind a flag would be shipping it. What exists here is
   * the domain operation PR3 will call and this cut's tests exercise, so the
   * secret handling is written and proven before anything can reach it.
   */
  async mintInvitation(input: MintInvitationInput): Promise<MintedInvitation> {
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    const token = mintInvitationToken();
    const code = input.withCode === false ? null : mintInvitationCode();

    const created = await this.prisma.$transaction(async (tx) => {
      const invitation = await this.invitations.create(
        {
          circleId: input.circleId,
          activityId: input.activityId,
          createdByMemberId: input.createdByMemberId,
          tokenHash: token.hash,
          codeHash: code?.hash ?? null,
          expiresAt,
        },
        tx,
      );
      await this.events.append(
        {
          circleId: input.circleId,
          activityId: input.activityId,
          type: "INVITATION_CREATED",
          // The event names the seat, never the secret. `hasCode` is a boolean:
          // it says a code exists, which the recipient already knows, and says
          // nothing about what it is.
          metadata: { hasCode: code !== null },
        },
        tx,
      );
      return invitation;
    });

    return {
      invitationId: created.invitationId,
      participantId: created.participantId,
      rawToken: token.raw,
      rawCode: code?.raw ?? null,
      expiresAt,
    };
  }

  /**
   * Is this secret currently usable, and what is it an invitation TO?
   *
   * A read, and only a read. Opening a link must not spend it — somebody who
   * taps twice, or whose browser prefetches, has not accepted anything.
   * Acceptance is a separate, explicit call.
   *
   * ── Why this returns more than a boolean ───────────────────────────────────
   *
   * It used to return `true`, which made the screen before "Aceptar" generic:
   * the person was asked to accept something described only as "an invitation",
   * from nobody in particular. That is consent without information, and on a
   * surface whose whole point is that accepting is deliberate.
   *
   * So it returns the four things needed to decide — who is asking, what it is,
   * how long it takes — projected from the template the activity is PINNED to,
   * and nothing else. No ids, no roster, no state, no counts, no answers. See
   * `CircleInvitationPreview` for what is absent and why.
   *
   * ── What is unchanged ─────────────────────────────────────────────────────
   *
   * Every refusal is still exactly `CIRCLE_INVITATION_UNUSABLE`: nonexistent,
   * malformed, expired, consumed, declined, revoked, and an inviter who is no
   * longer eligible all take the same exit, so the richer success path opens no
   * oracle. A caller who cannot produce a usable secret learns nothing new.
   *
   * The pin is resolved with `getExact`, not `getPublished`: an activity
   * already running on a template that was later archived has to keep working,
   * and the person holding its invitation is entitled to know what they are
   * accepting. That is not a public listing — it is reachable only by holding
   * the secret — so it does not weaken the rule that DRAFT and ARCHIVED never
   * appear in the public catalog.
   */
  async inspect(
    presented: string,
    now: Date = new Date(),
  ): Promise<CircleInvitationPreview | null> {
    const invitation = await this.resolveUsableInvitation(presented, now);
    return this.previewOf(invitation);
  }

  /**
   * Project an invitation to what its holder may see before accepting.
   *
   * Returns `null` — never an error — when this build cannot describe the
   * invitation. Being describable is NOT a condition of being usable, and an
   * earlier version of this made it one: it threw `CIRCLE_INVITATION_UNUSABLE`
   * whenever the pin was absent from the registry, which turned a cosmetic gap
   * into a refusal. A real, live, perfectly acceptable invitation would have
   * been rejected because the catalog in this deployment happened not to carry
   * its template — and the person would have been told their link was dead.
   *
   * The real-PostgreSQL suite caught it: seven of PR2's access invariants,
   * which mint activities on arbitrary template pins, went red at once.
   *
   * So a missing pin, a vanished inviter row or an unreadable name costs the
   * preview and nothing else. The screen degrades to generic wording — which it
   * already handles — and the invitation stays as usable as it was.
   */
  private async previewOf(invitation: {
    readonly activityId: string;
    readonly createdByMemberId: string;
  }): Promise<CircleInvitationPreview | null> {
    try {
      const [activity, member] = await Promise.all([
        this.activities.findById(invitation.activityId),
        this.members.findById(invitation.createdByMemberId),
      ]);
      if (!activity || !member) return null;

      const definition = productionCircleTemplateRegistry.getExact(
        activity.templateKey,
        activity.templateVersion,
      );

      // A membership detached by account deletion names nobody, so there is no
      // first name to resolve and no lookup to make. `null` here is the same
      // answer the method already gives for an inviter it cannot resolve —
      // the preview is describable or it is absent, never invented.
      if (member.userId === null) return null;

      const user = await this.prisma.user.findUnique({
        where: { id: member.userId },
        // Exactly the two columns a first name can come from. Selecting the
        // row would pull an email into memory next to a value we are about to
        // serialize to somebody holding only a link.
        select: { firstName: true, name: true },
      });
      if (!user) return null;

      return Object.freeze({
        title: definition.title,
        summary: definition.summary,
        estimatedMinutes: definition.estimatedMinutes,
        inviterFirstName: safeInviterFirstName(user),
      });
    } catch {
      // Includes `CIRCLE_CATALOG_UNKNOWN_DEFINITION` and any storage failure.
      // None of them says anything about whether the invitation is usable.
      return null;
    }
  }

  /**
   * Trade an invitation for an opaque guest session.
   *
   * Single use is settled by the conditional UPDATE inside the transaction, not
   * by the check that precedes it. The check exists to answer quickly and
   * uniformly in the ordinary case; the UPDATE is what makes two simultaneous
   * exchanges resolve to one winner, and the loser takes the same exit as
   * somebody who guessed wrong.
   */
  async exchange(
    presented: string,
    now: Date = new Date(),
  ): Promise<ExchangedGuestSession> {
    const invitation = await this.resolveUsableInvitation(presented, now);
    const guestToken = mintInvitationToken();
    const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_MS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // ── 1. CircleMember, LOCKED ────────────────────────────────────────
        //
        // First, and with `FOR UPDATE`. The check in `resolveUsableInvitation`
        // is a fast exit, not the authority: an unlocked read answers "was this
        // true a moment ago", and a moment ago is not when this commits.
        await this.lockAndAssertInviter(invitation, tx);

        // ── 2. CircleInvitation ───────────────────────────────────────────
        const won = await this.invitations.consume(invitation.id, now, tx);
        if (!won) {
          // Somebody else consumed it between the read and here — including,
          // possibly, this same person's duplicate tap. Same exit as a wrong
          // guess: the caller cannot tell a race from a bad secret.
          throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");
        }

        // ── 4. CircleActivity ─────────────────────────────────────────────
        //
        // Locked BEFORE the seat, and advanced to `PREPARING` in this same
        // transaction. Accepting an invitation and the activity becoming open
        // for participation are one event in the product; splitting them across
        // two transactions would create a moment in which somebody has accepted
        // an activity that is still `INVITING` — a state the counterpart's
        // screen would have to explain.
        //
        // The transition is conditional. If a withdrawal cancelled the activity
        // between the fast exit and here, `startPreparing` moves nothing and the
        // acceptance unwinds rather than resurrecting a cancelled Dúo.
        const activity = await this.activities.lockById(
          invitation.activityId,
          tx,
        );
        if (!activity) throw new CircleStorageError();
        if (activity.status !== "INVITING") {
          throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");
        }
        const started = await this.activities.startPreparing(activity.id, tx);
        if (!started) throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");

        // ── 5. CircleActivityParticipant ──────────────────────────────────
        //
        // The seat was created with the invitation, so it exists. If it somehow
        // does not, that is an invariant failure and not an authorization
        // verdict — which is why it leaves as a storage error rather than as
        // the uniform "unusable", and why the whole transaction unwinds.
        const seat = await tx.circleActivityParticipant.findFirst({
          where: {
            invitationId: invitation.id,
            activityId: invitation.activityId,
          },
          select: { id: true },
        });
        if (!seat) throw new CircleStorageError();

        // EXACTLY one row, and the count is checked rather than assumed.
        //
        // Zero means the seat was not `INVITED` — already accepted, withdrawn,
        // declined — and more than one would mean the predicate matched
        // something it should not. Both are states in which continuing would
        // mint a guest session for a seat that never agreed to receive one, so
        // both abort: the invitation stays unconsumed, no session is created,
        // no event is appended, because the transaction never commits.
        const moved = await tx.circleActivityParticipant.updateMany({
          where: {
            id: seat.id,
            activityId: invitation.activityId,
            status: "INVITED",
          },
          data: { status: "ACCEPTED" },
        });
        if (moved.count !== 1) throw new CircleStorageError();

        const session = await this.guestSessions.create(
          {
            invitationId: invitation.id,
            activityId: invitation.activityId,
            participantId: seat.id,
            tokenHash: guestToken.hash,
            expiresAt,
            acceptedAt: now,
          },
          tx,
        );

        await this.events.append(
          {
            circleId: invitation.circleId,
            activityId: invitation.activityId,
            type: "INVITATION_ACCEPTED",
            actorParticipantId: seat.id,
          },
          tx,
        );
        await this.events.append(
          {
            circleId: invitation.circleId,
            activityId: invitation.activityId,
            type: "GUEST_SESSION_CREATED",
            actorParticipantId: seat.id,
          },
          tx,
        );

        return {
          guestSessionId: session.id,
          rawGuestToken: guestToken.raw,
          expiresAt,
        };
      });
    } catch (err) {
      if (err instanceof CirclesError) throw err;
      if (err instanceof CircleStorageError) {
        throw new CirclesError("CIRCLE_STORAGE_FAILURE");
      }
      throw new CirclesError("CIRCLE_STORAGE_FAILURE");
    }
  }

  /**
   * The shared front half of both operations, and the reason they cannot drift
   * apart: one lookup, one usability predicate, one error.
   *
   * Both candidate hashes are always computed and both lookups always run, even
   * when the two hashes are identical. Short-circuiting on the second would
   * make a link token and a typed code take measurably different paths, and
   * "how long did that take" is exactly the channel this is closing.
   */
  private async resolveUsableInvitation(presented: string, now: Date) {
    const unusable = new CirclesError("CIRCLE_INVITATION_UNUSABLE");
    if (
      typeof presented !== "string" ||
      presented.length === 0 ||
      presented.length > MAX_PRESENTED_SECRET_LENGTH
    ) {
      throw unusable;
    }

    // A link token is case-sensitive base64url; a typed code is not. Try the
    // value as given and the value normalized as a code, never guessing which
    // one the caller meant from its shape.
    const asGiven = hashSecret(presented);
    const asCode = hashSecret(normalizeCode(presented));

    let row;
    try {
      const [byRaw, byCode] = await Promise.all([
        this.invitations.findByHash(asGiven),
        this.invitations.findByHash(asCode),
      ]);
      row = byRaw ?? byCode;
    } catch {
      throw new CirclesError("CIRCLE_STORAGE_FAILURE");
    }

    if (!row || !invitationIsUsable(row, now)) throw unusable;
    await this.assertInviterEligible(row);
    return row;
  }

  /**
   * Under `pilot`, an invitation is only usable if the person who minted it is
   * still allowed to be minting invitations.
   *
   * The rollout answers "is Círculos on for a USER". A guest has no user, so
   * without this the guest surface would be a way around the allowlist: mint a
   * link while enabled, hand it to anybody, and it keeps working forever. The
   * guest instead INHERITS the inviter's enablement, re-derived server-side on
   * every use, and can never exceed it.
   *
   * Three conditions in every enabled mode, plus a fourth under `pilot`:
   *
   *     off    refuse
   *     pilot  member exists + same circle + ACTIVE + in the allowlist
   *     on     member exists + same circle + ACTIVE
   *
   * The membership predicate is NOT mode-dependent. `on` skips the ALLOWLIST
   * and nothing else — it never skips the member existing, belonging to the
   * circle the invitation names, or still being `ACTIVE`.
   *
   * An earlier version of this comment said "`on` skips the check: general
   * availability is general", and the code below has never done that. The
   * sentence was describing a behaviour that would contradict participation,
   * which re-derives the inviter in every mode: an invitation whose author had
   * left would inspect as usable, exchange successfully, mint a session and
   * write events — and then the guest's first command would be refused, with
   * everything already committed.
   *
   * Any condition failing produces exactly `CIRCLE_INVITATION_UNUSABLE` — the
   * same error, the same status, the same body as a secret that never existed.
   * Nothing distinguishes "your inviter left" or "your inviter was removed from
   * the pilot" from "you guessed wrong", because the first would confirm the
   * invitation is real.
   *
   * `off` never reaches here (the guard refuses first), and if it somehow did,
   * it fails closed.
   */
  /**
   * The inviter, LOCKED, and the decision that actually counts.
   *
   * `assertInviterEligible` outside the transaction is a fast exit: it lets an
   * obviously dead invitation fail without opening one. It is NOT authority,
   * because an unlocked read under READ COMMITTED leaves this open:
   *
   *     T1  SELECT member -> ACTIVE
   *     T2  UPDATE member -> LEFT ; COMMIT
   *     T1  consume, create session, COMMIT
   *
   * Every statement there is correct and the outcome is wrong. This method is
   * the one whose answer survives to the commit.
   *
   * The row is locked in EVERY enabled mode, including `on` — which has a
   * predicate of its own to hold: the member must exist, be in this circle and
   * still be `ACTIVE`. Only the allowlist is `pilot`-only. The lock ORDER is a
   * property of the command, not of the configuration, and a rule that applies
   * in two modes out of three is a rule somebody will get wrong.
   */
  private async lockAndAssertInviter(
    invitation: {
      readonly circleId: string;
      readonly createdByMemberId: string;
    },
    tx: CircleMemberTx,
  ): Promise<void> {
    const mode = this.rollout.currentMode();
    // Unreachable: the guard refuses before the route runs. Fails closed anyway.
    if (mode === "off") throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");

    let member;
    try {
      member = await this.members.lockById(invitation.createdByMemberId, tx);
    } catch {
      throw new CirclesError("CIRCLE_STORAGE_FAILURE");
    }

    assertInviterMembership(member, invitation.circleId);
    // The allowlist is the ONLY part that is `pilot`-only. `on` is general
    // availability of the FEATURE, not of invitations whose author has left.
    if (mode === "pilot" && !this.rollout.isAvailable(member!.userId)) {
      throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");
    }
  }

  private async assertInviterEligible(
    invitation: {
      readonly circleId: string;
      readonly createdByMemberId: string;
    },
    db?: CircleMemberDb,
  ): Promise<void> {
    const mode = this.rollout.currentMode();
    if (mode === "off") throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");

    let member;
    try {
      member = await this.members.findById(invitation.createdByMemberId, db);
    } catch {
      throw new CirclesError("CIRCLE_STORAGE_FAILURE");
    }

    assertInviterMembership(member, invitation.circleId);
    if (mode === "pilot" && !this.rollout.isAvailable(member!.userId)) {
      throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");
    }
  }
}
