import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { AppHeader } from "@/components/AppHeader";
import { BaseList } from "@/components/BaseList";
import { currentUser } from "@/server/access";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const bases = await db
    .select({ id: schema.bases.id, name: schema.bases.name, color: schema.bases.color, role: schema.baseMembers.role })
    .from(schema.baseMembers)
    .innerJoin(schema.bases, eq(schema.bases.id, schema.baseMembers.baseId))
    .where(eq(schema.baseMembers.userId, user.id))
    .orderBy(desc(schema.bases.createdAt));
  return (
    <div className="min-h-full">
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <BaseList initial={bases} userName={user.name} />
      </main>
    </div>
  );
}
