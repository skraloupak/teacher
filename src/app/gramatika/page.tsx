import { AppShell } from "@/components/AppShell";
import { GrammarClient } from "@/components/GrammarClient";
import { getGrammarTopics } from "@/lib/grammar.server";

export const dynamic = "force-static";

export const metadata = { title: "Gramatika" };

export default async function GrammarPage() {
  const topics = await getGrammarTopics();

  return (
    <AppShell>
      <GrammarClient topics={topics} />
    </AppShell>
  );
}
