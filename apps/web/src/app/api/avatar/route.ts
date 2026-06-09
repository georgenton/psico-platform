import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { TOKEN_NAMES } from "@/lib/cookies";

/**
 * POST /api/avatar — Sprint S59.
 *
 * Server-side proxy for multipart avatar uploads. The browser doesn't
 * have direct access to the Bearer access token (it's stored as an
 * httpOnly cookie), so we read it here and forward the multipart body
 * to the NestJS API.
 *
 * Why a Route Handler instead of a server action: server actions don't
 * support multipart bodies cleanly (they serialise everything as JSON).
 * Route handlers receive the raw `Request` and can stream the body.
 */
export async function POST(req: Request) {
  const accessToken = cookies().get(TOKEN_NAMES.access)?.value;
  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const apiBase = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

  const formData = await req.formData();
  const proxied = await fetch(`${apiBase}/user/avatar`, {
    method: "POST",
    body: formData,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await proxied.text();
  const data = text ? JSON.parse(text) : {};
  return NextResponse.json(data, { status: proxied.status });
}
