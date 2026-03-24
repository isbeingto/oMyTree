import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { pool } from '@/lib/db';
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";


/**
 * GET /api/account/oauth
 * 获取当前用户关联的所有OAuth账户
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return Response.json(
        { error: 'Unauthorized', code: 'unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const client = await pool.connect();

    try {
      // 获取用户的所有OAuth账户
      const result = await client.query(
        `SELECT 
          id,
          provider,
          "providerAccountId" as provider_account_id,
          expires_at
        FROM accounts
        WHERE "userId" = $1
        ORDER BY provider ASC`,
        [userId]
      );

      const accounts = result.rows.map((row: any) => ({
        id: row.id,
        provider: row.provider,
        providerAccountId: row.provider_account_id,
        expiresAt: row.expires_at,
      }));

      return Response.json({ accounts });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[api/account/oauth] Error:', error);
    return Response.json(
      { error: 'Internal server error', code: 'internal_error' },
      { status: 500 }
    );
  }
}
