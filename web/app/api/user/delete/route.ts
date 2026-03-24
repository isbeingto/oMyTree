/**
 * User Account Deletion API
 * T26-7: Allow users to delete their own account and all associated data
 * 
 * DELETE /api/user/delete
 * 
 * Requires authentication. Deletes the current user and all their data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSafeServerSession } from '@/lib/auth';
import { pool } from '@/lib/db';

// Protected emails that cannot delete themselves (optional safety measure)
const PROTECTED_EMAILS = [
  'admin@fengnayun.com',
  'sj@unionsoft.cn'
];

export async function DELETE(req: NextRequest) {
  const session = await getSafeServerSession();
  
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const userEmail = session.user.email?.toLowerCase() || '';

  // Check if user is protected
  if (PROTECTED_EMAILS.includes(userEmail)) {
    return NextResponse.json(
      { error: 'This account cannot be deleted' },
      { status: 403 }
    );
  }

  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');

    // 1. Delete turns (via nodes -> trees -> user_id)
    await client.query(`
      DELETE FROM turns 
      WHERE node_id IN (
        SELECT n.id FROM nodes n
        JOIN trees t ON n.tree_id = t.id
        WHERE t.user_id = $1
      )
    `, [userId]);

    // 2. Delete nodes
    await client.query(`
      DELETE FROM nodes 
      WHERE tree_id IN (
        SELECT id FROM trees WHERE user_id = $1
      )
    `, [userId]);

    // 3. Delete trees
    await client.query('DELETE FROM trees WHERE user_id = $1', [userId]);

    // 4. Delete user API keys
    await client.query('DELETE FROM user_api_keys WHERE user_id = $1', [userId]);

    // 5. Delete sessions
    await client.query('DELETE FROM sessions WHERE "userId" = $1', [userId]);

    // 6. Delete accounts
    await client.query('DELETE FROM accounts WHERE "userId" = $1', [userId]);

    // 7. Delete email verification tokens
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);

    // 8. Delete password reset tokens
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

    // 9. Delete LLM usage events
    await client.query('DELETE FROM llm_usage_events WHERE user_id = $1', [userId]);

    // 10. Delete daily LLM usage aggregates
    await client.query('DELETE FROM llm_usage_daily WHERE user_id = $1', [userId]);

    // 11. Finally delete user
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    await client.query('COMMIT');

    console.log(`[user/delete] User deleted their account: ${userEmail} (${userId})`);

    return NextResponse.json({
      ok: true,
      message: 'Account deleted successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[user/delete] Error:', err);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
