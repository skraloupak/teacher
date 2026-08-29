import { AppShell } from "@/components/AppShell";
import { VocabClient } from "@/components/VocabClient";
import { getLessons, groupByBook } from "@/lib/lessons.server";

export const dynamic = "force-static";

export const metadata = {
  title: "Slovníček",
};

export default async function VocabPage() {
  const lessons = await getLessons();

  return (
    <AppShell>
      <VocabClient lessons={lessons} books={groupByBook(lessons)} />
    </AppShell>
  );
}
