export const TOKEN_NAMES = {
  access: "psico_at",
  refresh: "psico_rt",
} as const;

export const TOKEN_MAX_AGE = {
  access: 15 * 60, // 15 minutes
  refresh: 30 * 24 * 60 * 60, // 30 days
} as const;

export const cookieOptions = {
  access: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: TOKEN_MAX_AGE.access,
    path: "/",
  },
  refresh: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: TOKEN_MAX_AGE.refresh,
    path: "/",
  },
} as const;
