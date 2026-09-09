import { describe, expect, it } from "vitest";
import {
  CIRCLE_CAPABILITIES,
  CIRCLE_NEVER_CAPABILITIES,
  CIRCLE_PERMISSION_MATRIX,
  CIRCLE_ROLES,
  permits,
} from "@psico/types";
import type { CircleCapability, CircleRole } from "@psico/types";

/**
 * The permission matrix — the executable form of the table an auditor reads.
 *
 * The valuable assertions are the ones about the whole matrix rather than a
 * single cell: that nobody may see an unrevealed selection, that nobody
 * inherits access to another person's private surfaces, and that a global
 * admin has no content capability at all. Those are product promises, and a
 * change to any of them should fail here before it reaches a service.
 */

const cell = (role: CircleRole, capability: CircleCapability) =>
  CIRCLE_PERMISSION_MATRIX[role][capability];

describe("circles · permission matrix", () => {
  it("answers every capability for every role, with no gaps", () => {
    // A missing cell is worse than a denial: it is an unasked question that a
    // service would answer by accident.
    for (const role of CIRCLE_ROLES) {
      for (const capability of CIRCLE_CAPABILITIES) {
        expect(cell(role, capability), `${role}.${capability}`).toBeDefined();
      }
      expect(Object.keys(CIRCLE_PERMISSION_MATRIX[role]).sort()).toEqual(
        [...CIRCLE_CAPABILITIES].sort(),
      );
    }
    expect(Object.keys(CIRCLE_PERMISSION_MATRIX).sort()).toEqual(
      [...CIRCLE_ROLES].sort(),
    );
  });

  it("lets NOBODY see another participant's selection before reveal", () => {
    // Not the organizer, not an admin, not the person who paid. The reveal
    // barrier is not an access rule with exceptions — before it opens, that
    // content has no reader at all.
    for (const role of CIRCLE_ROLES) {
      expect(cell(role, "VIEW_OTHERS_SELECTION_BEFORE_REVEAL"), role).toBe(
        "NEVER",
      );
    }
  });

  it("lets NOBODY reach another person's personal surfaces", () => {
    // Joining, organizing or paying grants nothing in Diario, Eco personal,
    // Mapa or Patrones.
    for (const role of CIRCLE_ROLES) {
      expect(cell(role, "VIEW_OTHERS_PERSONAL_SURFACES"), role).toBe("NEVER");
    }
  });

  it("pins which capabilities may never be granted at any version", () => {
    // DENIED is a decision a later version could revisit; NEVER is not.
    // Moving a capability out of this list is a change to what Círculos
    // promises, and it fails here first.
    expect([...CIRCLE_NEVER_CAPABILITIES].sort()).toEqual([
      "VIEW_OTHERS_PERSONAL_SURFACES",
      "VIEW_OTHERS_SELECTION_BEFORE_REVEAL",
    ]);
    for (const capability of CIRCLE_NEVER_CAPABILITIES) {
      for (const role of CIRCLE_ROLES) {
        expect(cell(role, capability), `${role}.${capability}`).toBe("NEVER");
      }
    }
  });

  it("keeps private preparation off the server for everyone who has one", () => {
    // LOCAL_ONLY is not a permission to read something: it says the server
    // never receives it. ADMIN gets NEVER because an admin has no preparation.
    for (const role of ["ORGANIZER", "MEMBER", "GUEST"] as const) {
      expect(cell(role, "PRIVATE_PREPARATION"), role).toBe("LOCAL_ONLY");
    }
    expect(cell("ADMIN", "PRIVATE_PREPARATION")).toBe("NEVER");
    // And LOCAL_ONLY must never read as "allowed" to an authorization check.
    expect(permits("LOCAL_ONLY")).toBe(false);
  });

  it("gives a global admin no content capability whatsoever", () => {
    // The payer or platform admin is an operational role. The only thing it
    // may see is the public template preview, which is public anyway.
    for (const capability of CIRCLE_CAPABILITIES) {
      if (capability === "VIEW_TEMPLATE_PREVIEW") continue;
      expect(permits(cell("ADMIN", capability)), capability).toBe(false);
    }
    expect(cell("ADMIN", "VIEW_TEMPLATE_PREVIEW")).toBe("ALLOWED");
  });

  it("scopes every guest capability to its single activity", () => {
    // A guest is bound to one invitation and one activity. Any capability it
    // holds must say so in the value, so a later service cannot widen a guest
    // into "a member with fewer rights".
    for (const capability of CIRCLE_CAPABILITIES) {
      const value = cell("GUEST", capability);
      if (!permits(value)) continue;
      // The public preview is the one thing a guest sees outside its activity,
      // because it carries no instance data at all.
      const allowed =
        capability === "VIEW_TEMPLATE_PREVIEW"
          ? "ALLOWED"
          : "ALLOWED_OWN_ACTIVITY";
      expect(value, capability).toBe(allowed);
    }
  });

  it("lets every participating role leave, and no observer close anything", () => {
    for (const role of ["ORGANIZER", "MEMBER", "GUEST"] as const) {
      expect(permits(cell(role, "CLOSE_OR_WITHDRAW")), role).toBe(true);
    }
    expect(permits(cell("ADMIN", "CLOSE_OR_WITHDRAW"))).toBe(false);
  });

  it("keeps circle creation and invitation with the organizer in v1", () => {
    expect(cell("ORGANIZER", "CREATE_DUO")).toBe("ALLOWED");
    expect(cell("ORGANIZER", "INVITE")).toBe("ALLOWED");
    for (const role of ["MEMBER", "GUEST", "ADMIN"] as const) {
      expect(permits(cell(role, "CREATE_DUO")), role).toBe(false);
      expect(permits(cell(role, "INVITE")), role).toBe(false);
    }
    // MEMBER.INVITE is DENIED rather than NEVER: it is a future policy
    // question, not a promise.
    expect(cell("MEMBER", "INVITE")).toBe("DENIED");
  });

  it("treats only the two ALLOWED values as passing an authorization check", () => {
    expect(permits("ALLOWED")).toBe(true);
    expect(permits("ALLOWED_OWN_ACTIVITY")).toBe(true);
    for (const denial of ["DENIED", "NEVER", "LOCAL_ONLY"] as const) {
      expect(permits(denial), denial).toBe(false);
    }
  });
});
