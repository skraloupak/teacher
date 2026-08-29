import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, type SessionPayload, verifySession } from "./token";

export function getAuthSecret(): string | null {
  return process.env.AUTH_SECRET || null;
}

/** Přihlášený uživatel podle cookie, nebo null. */
export async function getSession(): Promise<SessionPayload | null> {
  const secret = getAuthSecret();
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, secret);
}
