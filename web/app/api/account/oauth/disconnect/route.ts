import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { pool } from '@/lib/db';
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";


/**
 * POST /api/account/oauth/disconnect
 * 断开指定的OAuth账户关联
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return Response.json(
        { error: 'Unauthorized', code: 'unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { provider } = body;

    if (!provider) {
      return Response.json(
        { error: 'Provider is required', code: 'invalid_request' },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const client = await pool.connect();

    try {
      // 检查账户是否存在且属于当前用户
      const checkResult = await client.query(
        `SELECT id FROM accounts
        WHERE "userId" = $1 AND provider = $2`,
        [userId, provider]
      );

      if (checkResult.rows.length === 0) {
        return Response.json(
          { error: 'OAuth account not found', code: 'not_found' },
          { status: 404 }
        );
      }

      // 删除OAuth账户关联
      await client.query(
        `DELETE FROM accounts
        WHERE "userId" = $1 AND provider = $2`,
        [userId, provider]
      );

      // 检查用户是否还有密码（Email/Password登录）
      const userResult = await client.query(
        `SELECT password_hash FROM users WHERE id = $1`,
        [userId]
      );

      const user = userResult.rows[0];
      const hasPassword = user?.password_hash ? true : false;

      if (!hasPassword) {
        // 如果用户没有密码且断开了最后一个OAuth账户，不能登录
        // 此时应该提示用户或强制用户设置密码
        console.warn(`User ${userId} has no password and disconnected their only OAuth account`);
      }

      return Response.json({
        success: true,
        message: 'OAuth account disconnected',
        hasPassword,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[api/account/oauth/disconnect] Error:', error);
    return Response.json(
      { error: 'Internal server error', code: 'internal_error' },
      { status: 500 }
    );
  }
}
