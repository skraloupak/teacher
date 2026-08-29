import { NextResponse } from "next/server";
import { getLessons } from "@/lib/lessons.server";

export const dynamic = "force-static";

/**
 * Lekce ve formě JSON. Aplikace je dnes bere přímo ze serverových komponent,
 * tahle routa je tu pro externí použití a jako místo, kam se napojí MongoDB.
 */
export async function GET() {
  const lessons = await getLessons();
  return NextResponse.json({ count: lessons.length, lessons });
}
