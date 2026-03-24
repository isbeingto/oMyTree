/**
 * GET /api/me/usage/month
 * Return current-month LLM usage for the signed-in user, grouped by provider/BYOK.
 */

import { NextResponse } from "next/server";
import { getSafeServerSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { normalizePlan } from "@/lib/plans";

type UsageSummary = {
  requests: number;
  tokens_total: number;
  tokens_platform: number;
  tokens_byok: number;
};

type ProviderBreakdown = {
  provider: string;
  is_byok: boolean;
  requests: number;
  tokens_total: number;
};

const monthStartSQL = "DATE_TRUNC('month', CURRENT_DATE)";

const parseIntSafe = (value: any): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseInt(value, 10) || 0;
  return 0;
};

const getPeriod = () => {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
    return { from, to };
};

export async function GET() {
  const session = await getSafeServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const client = await pool.connect();

  try {
    const planRow = await client.query(
      `SELECT plan FROM users WHERE id = $1 LIMIT 1`,
      [session.user.id]
    );
    const planName = normalizePlan(planRow.rows[0]?.plan);

    const summaryResult = await client.query(
      `
        SELECT
          COALESCE(SUM(requests), 0) AS requests,
          COALESCE(SUM(tokens_total), 0) AS tokens_total,
          COALESCE(SUM(tokens_total) FILTER (WHERE is_byok = FALSE), 0) AS tokens_platform,
          COALESCE(SUM(tokens_total) FILTER (WHERE is_byok = TRUE), 0) AS tokens_byok
        FROM llm_usage_daily
        WHERE user_id = $1
          AND usage_date >= ${monthStartSQL}
      `,
      [session.user.id]
    );

    const byProviderResult = await client.query(
      `
        SELECT
          provider,
          is_byok,
          COALESCE(SUM(requests), 0) AS requests,
          COALESCE(SUM(tokens_total), 0) AS tokens_total
        FROM llm_usage_daily
        WHERE user_id = $1
          AND usage_date >= ${monthStartSQL}
        GROUP BY provider, is_byok
        ORDER BY tokens_total DESC, provider ASC
      `,
      [session.user.id]
    );


    const summaryRow = summaryResult.rows[0] || {};
    const summary: UsageSummary = {
      requests: parseIntSafe(summaryRow.requests),
      tokens_total: parseIntSafe(summaryRow.tokens_total),
      tokens_platform: parseIntSafe(summaryRow.tokens_platform),
      tokens_byok: parseIntSafe(summaryRow.tokens_byok),
    };

    const byProvider: ProviderBreakdown[] = byProviderResult.rows.map((row) => ({
      provider: row.provider,
      is_byok: row.is_byok,
      requests: parseIntSafe(row.requests),
      tokens_total: parseIntSafe(row.tokens_total),
    }));

    return NextResponse.json({
      ok: true,
      period: getPeriod(),
      summary,
      by_provider: byProvider,
      plan: {
        name: planName,
      },
    });
  } catch (err) {
    console.error("[me/usage/month] Failed to load usage", err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  } finally {
    client.release();
  }
}
