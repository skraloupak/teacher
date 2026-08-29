import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/auth/session";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from "@/lib/auth/token";
import { authenticate } from "@/lib/auth/users";
import { isMongoConfigured } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = getAuthSecret();
  if (!secret || !isMongoConfigured()) {
    return NextResponse.json(
      { error: "Přihlašování není nastavené (chybí AUTH_SECRET nebo připojení k databázi)." },
      { status: 501 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Vyplň e-mail i heslo." }, { status: 400 });
  }

  try {
    const user = await authenticate(body.email, body.password);
    if (!user) {
      // Stejná hláška pro neznámý e-mail i špatné heslo – ať se nedá zjišťovat, kdo je registrovaný.
      return NextResponse.json({ error: "Nesprávný e-mail nebo heslo." }, { status: 401 });
    }

    const token = await signSession(
      { sub: user._id.toHexString(), email: user.email, exp: Date.now() + SESSION_TTL_MS },
      secret,
    );

    const response = NextResponse.json({ ok: true, email: user.email });
    response.cookies.set(SESSION_COOKIE, token, {
      // httpOnly znamená, že se k tokenu nedostane žádný skript v prohlížeči.
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    console.error("[auth/login] selhalo:", error);
    return NextResponse.json({ error: "Přihlášení se nezdařilo." }, { status: 502 });
  }
}
