import { NextResponse } from "next/server";
import { getAuthSecret, getSession } from "@/lib/auth/session";
import { isMongoConfigured } from "@/lib/mongo";

export const dynamic = "force-dynamic";

/** Kdo je přihlášený. Aplikace se podle toho rozhodne, jestli ukázat přihlašovací obrazovku. */
export async function GET() {
  if (!getAuthSecret() || !isMongoConfigured()) {
    // Bez nastavení se aplikace nezamyká – jede v lokálním režimu.
    return NextResponse.json({ authRequired: false, user: null });
  }

  const session = await getSession();
  return NextResponse.json({
    authRequired: true,
    user: session ? { id: session.sub, email: session.email } : null,
  });
}
