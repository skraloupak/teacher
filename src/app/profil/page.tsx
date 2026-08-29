import { AppShell } from "@/components/AppShell";
import { ProfileClient } from "@/components/ProfileClient";
import { getLessons } from "@/lib/lessons.server";

export const dynamic = "force-static";

export const metadata = { title: "Profil" };

export default async function ProfilePage() {
  const lessons = await getLessons();

  return (
    <AppShell>
      <ProfileClient lessons={lessons} />
    </AppShell>
  );
}
