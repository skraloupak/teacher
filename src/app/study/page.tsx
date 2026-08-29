import { AppShell } from "@/components/AppShell";
import { StudyClient } from "@/components/StudyClient";
import { getLessons } from "@/lib/lessons.server";

export const dynamic = "force-static";

export default async function StudyPage() {
  const lessons = await getLessons();

  return (
    <AppShell>
      <StudyClient lessons={lessons} />
    </AppShell>
  );
}
