import NextAuth, { DefaultSession } from "next-auth";

export type UserRole = "user" | "admin";
export type UserPlan = "free" | "supporter" | "pro" | "team";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string;
      email: string | null;
      preferred_language?: "en" | "zh-CN";
      role?: UserRole;
      plan?: UserPlan;
      is_active?: boolean;
      emailVerified?: string | null; // ISO date string or null
      enable_advanced_context?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    password_hash?: string;
    preferred_language?: "en" | "zh-CN";
    role?: UserRole;
    plan?: UserPlan;
    is_active?: boolean;
    emailVerified?: Date | string | null;
    enable_advanced_context?: boolean;
  }
}
