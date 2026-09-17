/**
 * How many people this activity is actually FOR.
 *
 * ── The one question three different rules were asking badly ───────────────
 *
 * Capacity is how many could have taken part; the group is how many will. For
 * a Dúo, for every `FIXED` room, and for a flexible room before its organiser
 * continues, the two are the same number — which is exactly why the difference
 * went unnoticed for so long, and why `COALESCE` is the whole of the rule.
 *
 * The reveal barrier learned this first. Two more decisions had not: whether a
 * shared result is AGREED, and whether the follow-up is over. Both counted
 * against CAPACITY, so a room offered to six that continued with two could
 * reveal — and then never reach an agreement, because the two people inside
 * could not produce six confirmations, and never close its follow-up, because
 * they could not produce six decisions either. The clock would have closed it
 * a week later; nothing the two of them did ever could.
 *
 * It lives in one function so the next rule that needs it cannot quietly pick
 * the other number. It is deliberately NOT a policy object or a strategy: it
 * is a `??`, named.
 */
export function participatingSize(activity: {
  readonly requiredParticipants: number;
  readonly confirmedParticipants: number | null;
}): number {
  return activity.confirmedParticipants ?? activity.requiredParticipants;
}
