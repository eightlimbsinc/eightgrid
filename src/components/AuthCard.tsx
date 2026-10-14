"use client";

import Link from "next/link";
import { useActionState } from "react";
import { googleAction, loginAction, signupAction } from "@/app/auth-actions";
import { Logo } from "./Logo";

export function AuthCard({
  mode,
  googleEnabled,
  next,
  initialError,
  domains,
  allowSignup = true,
}: {
  mode: "login" | "signup";
  googleEnabled: boolean;
  next: string;
  initialError?: string;
  domains: string[];
  allowSignup?: boolean;
}) {
  const [error, action, pending] = useActionState(mode === "login" ? loginAction : signupAction, initialError ?? null);
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size={36} withText />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
          <p className="mb-5 text-gray-500">
            {domains.length ? `Use your ${domains.map((d) => "@" + d).join(" / ")} email.` : "Welcome to EightGrid."}
          </p>
          {googleEnabled && (
            <>
              <form action={googleAction}>
                <input type="hidden" name="next" value={next} />
                <button className="btn-secondary w-full py-2">
                  <svg width="16" height="16" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                  </svg>
                  Continue with Google
                </button>
              </form>
              <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
                <div className="h-px flex-1 bg-gray-200" />
                or
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            </>
          )}
          <form action={action} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Full name</span>
                <input name="name" className="input" required autoComplete="name" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Email</span>
              <input name="email" type="email" className="input" required autoComplete="email" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Password</span>
              <input
                name="password"
                type="password"
                className="input"
                required
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </label>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">{error}</p>}
            <button className="btn-primary w-full py-2" disabled={pending}>
              {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-gray-500">
          {mode === "login" ? (
            allowSignup && (
            <>
              New here?{" "}
              <Link className="text-blue-600 hover:underline" href={`/signup?next=${encodeURIComponent(next)}`}>
                Create an account
              </Link>
            </>
            )
          ) : (
            <>
              Already have an account?{" "}
              <Link className="text-blue-600 hover:underline" href={`/login?next=${encodeURIComponent(next)}`}>
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
