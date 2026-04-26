// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "USER" | "PSYCHOLOGIST" | "ADMIN";

export type UserPlan = "FREE" | "PRO" | "ANNUAL" | "B2B";

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  plan: UserPlan;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  userId: string;
  bio: string | null;
  country: string | null;
  timezone: string | null;
  preferredLanguage: string | null;
}

export interface RefreshToken {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

// ─── Auth API shapes ──────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// TODO senior: expand domain types as Prisma models stabilize (Content, Subscription, etc.)
