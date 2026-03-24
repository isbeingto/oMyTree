import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { assertAdmin } from "@/lib/admin-guard";

const DEFAULT_RANGE_DAYS = 30;
const ALLOWED_RANGE_DAYS = new Set([7, 30, 90]);

function buildEmptySeries(rangeDays: number) {
  const today = new Date();
  return Array.from({ length: rangeDays }, (_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (rangeDays - 1 - idx));
    return {
      date: date.toISOString().slice(0, 10),
      count: 0,
    };
  });
}

export async function GET(request: Request) {
  const { error } = await assertAdmin();
  if (error) return error;

  const rangeDays = (() => {
    try {
      const url = new URL(request.url);
      const raw = url.searchParams.get("range_days");
      if (!raw) return DEFAULT_RANGE_DAYS;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return DEFAULT_RANGE_DAYS;
      if (!ALLOWED_RANGE_DAYS.has(parsed)) return DEFAULT_RANGE_DAYS;
      return parsed;
    } catch {
      return DEFAULT_RANGE_DAYS;
    }
  })();

  const client = await pool.connect();

  try {
    // Summary cards
    const summaryRes = await client.query(`
      WITH total_users AS (
        SELECT COUNT(*)::INTEGER AS count FROM users
      ),
      active_users AS (
        SELECT COUNT(DISTINCT u.id)::INTEGER AS count
        FROM users u
        LEFT JOIN llm_usage_events e 
          ON e.user_id = u.id AND e.created_at >= NOW() - INTERVAL '30 days'
        LEFT JOIN trees t
          ON t.user_id = u.id AND t.created_at >= NOW() - INTERVAL '30 days'
        WHERE u.is_active = TRUE AND (e.user_id IS NOT NULL OR t.user_id IS NOT NULL)
      ),
      new_users_month AS (
        SELECT COUNT(*)::INTEGER AS count 
        FROM users 
        WHERE created_at >= DATE_TRUNC('month', NOW())
      ),
      total_trees AS (
        SELECT COUNT(*)::INTEGER AS count FROM trees
      )
      SELECT 
        total_users.count AS total_users,
        COALESCE(active_users.count, 0) AS active_users_30d,
        new_users_month.count AS new_users_month,
        total_trees.count AS total_trees
      FROM total_users, active_users, new_users_month, total_trees;
    `);

    const summaryRow = summaryRes.rows[0] || {
      total_users: 0,
      active_users_30d: 0,
      new_users_month: 0,
      total_trees: 0,
    };

    // New users trend (last 30 days)
    const newUsersRes = await client.query(
      `
      SELECT day::DATE AS date, COUNT(u.id)::INTEGER AS count
      FROM generate_series(
        CURRENT_DATE - INTERVAL '${rangeDays - 1} days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS day
      LEFT JOIN users u ON DATE(u.created_at) = day::DATE
      GROUP BY day
      ORDER BY day;
    `
    );

    // Country breakdown (including Unknown)
    const countriesRes = await client.query(`
      SELECT 
        COALESCE(NULLIF(registration_country, ''), 'Unknown') AS country,
        COUNT(*)::INTEGER AS count
      FROM users
      GROUP BY 1
      ORDER BY count DESC, country ASC;
    `);

    // Tokens trend (last 30 days)
    let tokensRes;
    try {
      tokensRes = await client.query(
        `
        SELECT day::DATE AS date, COALESCE(SUM(l.tokens_total), 0)::BIGINT AS tokens
        FROM generate_series(
          CURRENT_DATE - INTERVAL '${rangeDays - 1} days',
          CURRENT_DATE,
          INTERVAL '1 day'
        ) AS day
        LEFT JOIN llm_usage_daily l ON l.usage_date = day::DATE
        GROUP BY day
        ORDER BY day;
      `
      );
    } catch (err) {
      const code = (err as any)?.code;
      if (code === "42P01") {
        console.warn("[admin/metrics] llm_usage_daily missing, returning empty series");
        tokensRes = { rows: buildEmptySeries(rangeDays).map((row) => ({ ...row, tokens: 0 })) };
      } else {
        throw err;
      }
    }

    // Trees trend (last 30 days)
    const treesRes = await client.query(
      `
      SELECT day::DATE AS date, COUNT(t.id)::INTEGER AS count
      FROM generate_series(
        CURRENT_DATE - INTERVAL '${rangeDays - 1} days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS day
      LEFT JOIN trees t ON DATE(t.created_at) = day::DATE
      GROUP BY day
      ORDER BY day;
    `
    );

    return NextResponse.json({
      summary: {
        total_users: Number(summaryRow.total_users) || 0,
        active_users_30d: Number(summaryRow.active_users_30d) || 0,
        new_users_month: Number(summaryRow.new_users_month) || 0,
        total_trees: Number(summaryRow.total_trees) || 0,
      },
      new_users_daily: newUsersRes.rows.map((row) => ({
        date:
          row.date instanceof Date
            ? row.date.toISOString().slice(0, 10)
            : String(row.date).slice(0, 10),
        count: Number(row.count) || 0,
      })),
      countries: countriesRes.rows.map((row) => ({
        country: row.country || "Unknown",
        count: Number(row.count) || 0,
      })),
      usage: {
        tokens_daily: tokensRes.rows.map((row: any) => ({
          date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
          tokens: Number(row.tokens) || 0,
        })),
        trees_daily: treesRes.rows.map((row) => ({
          date:
            row.date instanceof Date
              ? row.date.toISOString().slice(0, 10)
              : String(row.date).slice(0, 10),
          count: Number(row.count) || 0,
        })),
      },
      range_days: rangeDays,
      active_definition: `is_active users with usage events or new trees in the last 30 days; charts range_days=${rangeDays}`,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin/metrics/dashboard] error:", err);
    return NextResponse.json(
      { error: "Failed to load admin metrics" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
