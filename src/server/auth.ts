import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { emailAllowed, ensureUser } from "./users";

declare module "next-auth" {
  interface Session {
    user: { id: string; name: string; email: string; image?: string | null };
  }
}

export const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

class InvalidLogin extends CredentialsSignin {
  code = "invalid_login";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) throw new InvalidLogin();
        const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
        if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) throw new InvalidLogin();
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    ...(googleEnabled ? [Google({ allowDangerousEmailAccountLinking: true })] : []),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        const email = (profile?.email ?? user.email ?? "").toLowerCase();
        if (!email || profile?.email_verified === false) return false;
        if (!emailAllowed(email)) return "/login?error=domain";
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account && user?.email) {
        // On sign-in, map the identity to our own user id (creating the user for SSO logins).
        const dbUser = await ensureUser({
          email: user.email,
          name: user.name ?? "",
          image: user.image ?? null,
        });
        token.uid = dbUser.id;
        token.name = dbUser.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      if (token.name) session.user.name = token.name as string;
      return session;
    },
  },
});
