"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/server/auth";
import { registerUser } from "@/server/users";

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function loginAction(_prev: string | null, form: FormData): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirectTo: safeNext(form.get("next")),
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) return "Invalid email or password";
    throw e;
  }
}

export async function signupAction(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const error = await registerUser({ name: String(form.get("name") ?? ""), email, password });
  if (error) return error;
  return loginAction(null, form);
}

export async function googleAction(form: FormData) {
  await signIn("google", { redirectTo: safeNext(form.get("next")) });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
