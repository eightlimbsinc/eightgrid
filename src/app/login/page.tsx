import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { auth, googleEnabled } from "@/server/auth";
import { allowedDomains, passwordSignupEnabled } from "@/server/users";

const ERRORS: Record<string, string> = {
  domain: "That Google account isn't from an allowed company domain.",
  AccessDenied: "Access denied.",
  Configuration: "Sign-in is misconfigured. Check the server's auth settings.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/", error } = await searchParams;
  if ((await auth())?.user?.id) redirect(next);
  return (
    <AuthCard
      mode="login"
      googleEnabled={googleEnabled}
      next={next}
      initialError={error ? (ERRORS[error] ?? "Sign-in failed.") : undefined}
      domains={allowedDomains()}
      allowSignup={passwordSignupEnabled()}
    />
  );
}
