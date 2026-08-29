import { AppShell } from "@/components/AppShell";
import { HomeClient } from "@/components/HomeClient";
import { getLessons, groupByBook } from "@/lib/lessons.server";

export const dynamic = "force-static";

export default async function HomePage() {
  const lessons = await getLessons();

  return (
    <AppShell>
      <HomeClient lessons={lessons} books={groupByBook(lessons)} />
    </AppShell>
  );
}
