import { NextResponse } from "next/server";
import { getSafeServerSession, isAdmin } from "@/lib/auth";

/**
 * Asserts that the current request is from an admin user.
 * Returns the session if admin, or a 403 response if not.
 */
export async function assertAdmin(): Promise<
  { session: NonNullable<Awaited<ReturnType<typeof getSafeServerSession>>>; error?: never }
  | { session?: never; error: NextResponse }
> {
  const session = await getSafeServerSession();
  
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized", code: "unauthorized" },
        { status: 401 }
      )
    };
  }
  
  if (!isAdmin(session)) {
    return {
      error: NextResponse.json(
        { error: "Forbidden", code: "forbidden" },
        { status: 403 }
      )
    };
  }
  
  return { session };
}
