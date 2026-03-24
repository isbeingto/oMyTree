import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";
import { pool } from "@/lib/db";
import { type PlanKey } from "@/lib/plans";
import { writeAuditLog } from "@/lib/audit-log";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function getRequestIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || null;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.length > 0) {
    return realIp.trim();
  }

  return null;
}

/**
 * GET /api/admin/users/[id]
 * Get a single user (admin only)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error } = await assertAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const result = await pool.query(
      `SELECT id, email, name, role, plan, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const user = result.rows[0];
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
        plan: user.plan || "free",
        is_active: user.is_active !== false,
        created_at: user.created_at,
        last_login_at: null,
      },
    });
  } catch (err) {
    console.error("[admin/users] GET by id error:", err);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/users/[id]
 * Update user role or is_active (admin only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await assertAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { role, is_active, plan } = body;

    const allowedPlans: PlanKey[] = ['free', 'pro', 'team'];

    // Validate role if provided
    if (role !== undefined && role !== "user" && role !== "admin") {
      return NextResponse.json(
        { error: "Invalid role. Must be 'user' or 'admin'" },
        { status: 400 }
      );
    }

    if (plan !== undefined) {
      if (typeof plan !== "string" || !allowedPlans.includes(plan as PlanKey)) {
        return NextResponse.json(
          { error: "Invalid plan. Must be free, pro, or team" },
          { status: 400 }
        );
      }
    }

    // Validate is_active if provided
    if (is_active !== undefined && typeof is_active !== "boolean") {
      return NextResponse.json(
        { error: "Invalid is_active. Must be boolean" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await pool.query(
      "SELECT id, email, role, is_active FROM users WHERE id = $1",
      [id]
    );

    if (existingUser.rowCount === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Prevent demoting the last admin
    const existingRow = existingUser.rows[0];
    const existingRole = existingRow.role || "user";
    const existingActive = existingRow.is_active !== false;

    if (role === "user" && existingRole === "admin") {
      const adminCount = await pool.query(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
      );
      if (parseInt(adminCount.rows[0].count) <= 1) {
        return NextResponse.json(
          { error: "Cannot demote the last admin user" },
          { status: 400 }
        );
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    if (plan !== undefined) {
      updates.push(`plan = $${paramIndex++}`);
      values.push(plan);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE users 
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING id, email, name, role, plan, is_active, created_at, updated_at
    `;

    const result = await pool.query(query, values);
    const user = result.rows[0];

    const traceId = request.headers.get("x-trace-id");
    const ip = getRequestIp(request);
    const actorUserId = session.user.id;

    const auditEntries = [] as Parameters<typeof writeAuditLog>[0][];

    if (is_active !== undefined && is_active !== existingActive) {
      auditEntries.push({
        actorUserId,
        actorRole: "admin",
        action: is_active ? "admin.user.unban" : "admin.user.ban",
        targetType: "user",
        targetId: id,
        ip,
        traceId,
        metadata: {
          email: existingRow.email,
          old_status: existingActive,
          new_status: is_active,
        },
      });
    }

    if (role !== undefined && role !== existingRole) {
      auditEntries.push({
        actorUserId,
        actorRole: "admin",
        action: role === "admin" ? "admin.user.promote" : "admin.user.demote",
        targetType: "user",
        targetId: id,
        ip,
        traceId,
        metadata: {
          email: existingRow.email,
          old_role: existingRole,
          new_role: role,
        },
      });
    }

    for (const entry of auditEntries) {
      await writeAuditLog(entry);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
        plan: user.plan || "free",
        is_active: user.is_active !== false,
        created_at: user.created_at,
        last_login_at: null,
      },
    });
  } catch (err) {
    console.error("[admin/users] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Proxy delete user request to Express API
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error } = await assertAdmin();
  if (error) return error;

  const { id } = await params;
  const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

  try {
    const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[admin/users] DELETE proxy error:", err);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
