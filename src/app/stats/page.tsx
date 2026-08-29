import { AppShell } from "@/components/AppShell";
import { StatsClient } from "@/components/StatsClient";
import { getLessons } from "@/lib/lessons.server";

export const dynamic = "force-static";

export default async function StatsPage() {
  const lessons = await getLessons();

  return (
    <AppShell>
      <StatsClient lessons={lessons} />
    </AppShell>
  );
}
