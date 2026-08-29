import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Hlídá data uživatele. Ověření běží nad podepsaným tokenem, takže se nemusí sahat
 * do databáze a middleware zvládne běžet i na edge.
 *
 * Když přihlašování není nastavené (chybí AUTH_SECRET), aplikace se nezamyká –
 * jede v lokálním režimu bez synchronizace.
 */
export async function middleware(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token, secret);
  if (session) return NextResponse.next();

  return NextResponse.json({ error: "Nepřihlášeno." }, { status: 401 });
}

export const config = {
  // Chráníme jen stav uživatele; lekce a výslovnost jsou obsah, ne osobní data.
  matcher: ["/api/state"],
};
