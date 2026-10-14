import { notFound, redirect } from "next/navigation";
import { BaseApp } from "@/components/base/BaseApp";
import { currentUser, getRole } from "@/server/access";
import { loadBasePayload } from "@/server/schema-service";

export const dynamic = "force-dynamic";

export default async function BasePage({ params }: { params: Promise<{ baseId: string; path?: string[] }> }) {
  const { baseId, path = [] } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/base/${baseId}/${path.join("/")}`)}`);
  const role = await getRole(user.id, baseId);
  if (!role) notFound();
  const base = await loadBasePayload(baseId, role);
  return <BaseApp initial={base} user={user} tableId={path[0]} viewId={path[1]} />;
}
