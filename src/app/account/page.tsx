import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { TokenManager } from "@/components/TokenManager";
import { currentUser } from "@/server/access";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  return (
    <div className="min-h-full">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="mb-4 text-lg font-semibold">Account</h1>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2">
            <dt className="text-gray-500">Name</dt>
            <dd>{user.name}</dd>
            <dt className="text-gray-500">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-gray-500">User ID</dt>
            <dd className="font-mono text-xs leading-5">{user.id}</dd>
          </dl>
        </section>
        <TokenManager />
      </main>
    </div>
  );
}
