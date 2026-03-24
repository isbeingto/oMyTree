import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";
import { pool } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/users/[id]/activity
 * 获取用户的对话活动统计
 * 返回：
 *   - 有对话的日期列表
 *   - 每天的提问次数
 *   - 总提问次数（包括已删除的）
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error } = await assertAdmin();
  if (error) return error;

  const { id: userId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  try {
    // 验证用户是否存在
    const userResult = await pool.query(
      "SELECT id, email, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rowCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult.rows[0];

    // 构建日期过滤条件
    let dateFilter = "";
    const queryParams: (string | number)[] = [userId];
    let paramIndex = 2;

    if (year) {
      dateFilter += ` AND EXTRACT(YEAR FROM t.created_at) = $${paramIndex}`;
      queryParams.push(parseInt(year, 10));
      paramIndex++;
    }
    if (month) {
      dateFilter += ` AND EXTRACT(MONTH FROM t.created_at) = $${paramIndex}`;
      queryParams.push(parseInt(month, 10));
      paramIndex++;
    }

    // 获取用户的每日对话统计（包括已删除的）
    // turns 通过 nodes -> trees -> users 关联
    const dailyStatsResult = await pool.query(
      `SELECT 
        DATE(t.created_at) as date,
        COUNT(*) as question_count
       FROM turns t
       JOIN nodes n ON n.id = t.node_id
       JOIN trees tr ON tr.id = n.tree_id
       WHERE tr.user_id = $1 ${dateFilter}
       GROUP BY DATE(t.created_at)
       ORDER BY date DESC`,
      queryParams
    );

    // 获取总提问次数（包括软删除的）
    const totalCountResult = await pool.query(
      `SELECT 
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE t.soft_deleted_at IS NULL) as active_count,
        COUNT(*) FILTER (WHERE t.soft_deleted_at IS NOT NULL) as deleted_count
       FROM turns t
       JOIN nodes n ON n.id = t.node_id
       JOIN trees tr ON tr.id = n.tree_id
       WHERE tr.user_id = $1`,
      [userId]
    );

    // 获取用户的 tree 数量统计
    const treesCountResult = await pool.query(
      `SELECT 
        COUNT(*) as total_trees,
        COUNT(*) FILTER (WHERE status = 'active') as active_trees
       FROM trees
       WHERE user_id = $1`,
      [userId]
    );

    const totalStats = totalCountResult.rows[0] || {
      total_count: 0,
      active_count: 0,
      deleted_count: 0,
    };

    const treesStats = treesCountResult.rows[0] || {
      total_trees: 0,
      active_trees: 0,
    };

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
      daily_stats: dailyStatsResult.rows.map((row) => ({
        date: row.date,
        question_count: parseInt(row.question_count, 10),
      })),
      summary: {
        total_questions: parseInt(totalStats.total_count, 10),
        active_questions: parseInt(totalStats.active_count, 10),
        deleted_questions: parseInt(totalStats.deleted_count, 10),
        total_trees: parseInt(treesStats.total_trees, 10),
        active_trees: parseInt(treesStats.active_trees, 10),
        days_with_activity: dailyStatsResult.rowCount || 0,
      },
    });
  } catch (err) {
    console.error("[admin/users/activity] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch user activity" },
      { status: 500 }
    );
  }
}
