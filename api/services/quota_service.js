/**
 * LLM Usage Recording Service
 *
 * Records LLM usage events into llm_usage_events and llm_usage_daily tables.
 *
 * NOTE: Quota checking/enforcement is handled by:
 *   - api/config/rate_limits.js        (quota definitions)
 *   - api/services/rate_quota/checker.js (Redis-based enforcement)
 *   - api/services/plan_limits.js       (tree/node limits)
 */

import { getClient } from '../db/pool.js';

/**
 * Record an LLM usage event
 *
 * @param {object} params
 * @param {string} params.userId - User ID
 * @param {string} params.provider - e.g., 'gemini', 'openai', 'deepseek'
 * @param {boolean} params.isByok - Whether this is a BYOK request
 * @param {string} [params.model] - Provider model name
 * @param {number} [params.tokensInput] - Optional input tokens
 * @param {number} [params.tokensOutput] - Optional output tokens
 * @param {string} [params.treeId] - Optional tree ID
 * @param {string} [params.contextProfile] - Context profile (lite/standard/max)
 * @returns {Promise<void>}
 */
export async function recordUsage({ userId, provider, isByok, model, tokensInput, tokensOutput, treeId, contextProfile }) {
  const client = await getClient();
  try {
    const modelName = typeof model === 'string' && model.trim().length > 0 ? model.trim() : 'unknown';
    const tokensIn = Number.isFinite(tokensInput) ? Math.max(0, Math.trunc(tokensInput)) : 0;
    const tokensOut = Number.isFinite(tokensOutput) ? Math.max(0, Math.trunc(tokensOutput)) : 0;
    const tokensTotal = tokensIn + tokensOut;
    const tokensInputRaw = Number.isFinite(tokensInput) ? Math.max(0, Math.trunc(tokensInput)) : null;
    const tokensOutputRaw = Number.isFinite(tokensOutput) ? Math.max(0, Math.trunc(tokensOutput)) : null;
    // Normalize context_profile
    const profile = contextProfile && ['lite', 'standard', 'max'].includes(contextProfile) ? contextProfile : null;

    await client.query(
      `INSERT INTO llm_usage_events (user_id, provider, is_byok, model, tokens_input, tokens_output, tree_id, context_profile)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, provider, isByok, modelName, tokensInputRaw, tokensOutputRaw, treeId || null, profile]
    );

    await client.query(
      `INSERT INTO llm_usage_daily (
         usage_date, user_id, provider, is_byok, model, context_profile,
         requests, tokens_input, tokens_output, tokens_total
       ) VALUES (
         CURRENT_DATE, $1, $2, $3, $4, $5,
         1, $6, $7, $8
       )
       ON CONFLICT (usage_date, user_id, provider, is_byok, model, context_profile)
       DO UPDATE SET
         requests      = llm_usage_daily.requests + 1,
         tokens_input  = llm_usage_daily.tokens_input  + EXCLUDED.tokens_input,
         tokens_output = llm_usage_daily.tokens_output + EXCLUDED.tokens_output,
         tokens_total  = llm_usage_daily.tokens_total + EXCLUDED.tokens_total,
         updated_at    = now()`,
      [userId, provider, isByok, modelName, profile || 'lite', tokensIn, tokensOut, tokensTotal]
    );
    
    console.log(`[quota] Recorded usage: user=${userId.slice(0, 8)}... provider=${provider} model=${modelName} profile=${profile || 'lite'} byok=${isByok}`);
  } finally {
    client.release();
  }
}

