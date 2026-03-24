import express from 'express';
import { pool } from '../db/pool.js';
import { getStrictAuthUserId } from '../lib/auth_user.js';
import { HttpError, respondWithError } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import {
  getPayPalBillingConfig,
  getUserBillingOverview,
  createPayPalOrder,
  capturePayPalOrder,
  verifyPayPalWebhook,
} from '../services/billing/paypal_billing.js';

function buildBillingSummary(config, overview) {
  return {
    ok: true,
    billing_enabled: config.isReady,
    provider: config.provider,
    environment: config.environment,
    clientId: config.clientId,
    plan: overview.userPlan || 'free',
    subscription: overview.subscription || null,
  };
}

export default function createAccountBillingRouter() {
  const router = express.Router();

  // Billing overview — works even when provider is not configured (returns plan info)
  router.get('/api/account/billing/overview', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const config = getPayPalBillingConfig();
      const overview = await getUserBillingOverview({ client, userId });
      return res.json(withTraceId(res, buildBillingSummary(config, overview)));
    } catch (error) {
      console.error('[account/billing/overview] GET failed:', error);
      return respondWithError(res, error);
    } finally {
      client.release();
    }
  });

  // PayPal — Create Order
  router.post('/api/account/billing/checkout', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const userRes = await client.query(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      const userEmail = userRes.rows[0]?.email || '';
      const planCode = req.body?.plan || 'pro';

      const order = await createPayPalOrder({ planCode, userId, userEmail });
      return res.json(withTraceId(res, { ok: true, orderId: order.orderId, status: order.status }));
    } catch (error) {
      console.error('[account/billing/checkout] POST failed:', error);
      return respondWithError(res, error);
    } finally {
      client.release();
    }
  });

  // PayPal — Capture Order (after buyer approval)
  router.post('/api/account/billing/capture', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const { orderId } = req.body || {};

      if (!orderId || typeof orderId !== 'string') {
        throw new HttpError({
          status: 400,
          code: 'missing_order_id',
          message: 'orderId is required',
        });
      }

      const captureData = await capturePayPalOrder({ orderId });

      // If capture succeeded, update user plan to pro
      if (captureData.status === 'COMPLETED') {
        await client.query(`UPDATE users SET plan = 'pro' WHERE id = $1`, [userId]);

        // Record in billing_subscriptions
        const captureId =
          captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderId;
        await client.query(
          `INSERT INTO billing_subscriptions
            (provider, user_id, paddle_subscription_id, paddle_customer_id, plan_code, status, currency_code, raw_data, current_billing_period_starts_at, current_billing_period_ends_at)
           VALUES ('paypal', $1, $2, $3, 'pro', 'active', 'USD', $4, now(), now() + interval '30 days')
           ON CONFLICT (paddle_subscription_id) DO UPDATE SET
             status = 'active', plan_code = 'pro', raw_data = $4, updated_at = now()`,
          [
            userId,
            captureId,
            captureData.payer?.payer_id || null,
            JSON.stringify(captureData),
          ],
        );

        console.log(`[billing] PayPal order ${orderId} captured for user ${userId}, upgraded to pro`);
      }

      return res.json(
        withTraceId(res, { ok: true, status: captureData.status, orderId }),
      );
    } catch (error) {
      console.error('[account/billing/capture] POST failed:', error);
      return respondWithError(res, error);
    } finally {
      client.release();
    }
  });

  // Cancel subscription
  router.post('/api/account/billing/subscription/cancel', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      // Downgrade to free
      await client.query(`UPDATE users SET plan = 'free' WHERE id = $1`, [userId]);
      await client.query(
        `UPDATE billing_subscriptions SET status = 'canceled', canceled_at = now()
         WHERE user_id = $1 AND provider = 'paypal' AND status = 'active'`,
        [userId],
      );
      console.log(`[billing] User ${userId} canceled subscription`);
      return res.json(withTraceId(res, { ok: true, plan: 'free' }));
    } catch (error) {
      console.error('[account/billing/subscription/cancel] POST failed:', error);
      return respondWithError(res, error);
    } finally {
      client.release();
    }
  });

  // Resume subscription
  router.post('/api/account/billing/subscription/resume', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      await client.query(`UPDATE users SET plan = 'pro' WHERE id = $1`, [userId]);
      await client.query(
        `UPDATE billing_subscriptions SET status = 'active', canceled_at = NULL
         WHERE user_id = $1 AND provider = 'paypal' AND status = 'canceled'`,
        [userId],
      );
      console.log(`[billing] User ${userId} resumed subscription`);
      return res.json(withTraceId(res, { ok: true, plan: 'pro' }));
    } catch (error) {
      console.error('[account/billing/subscription/resume] POST failed:', error);
      return respondWithError(res, error);
    } finally {
      client.release();
    }
  });

  // PayPal Webhook
  router.post('/api/billing/webhook', async (req, res) => {
    try {
      const webhookId = process.env.PAYPAL_WEBHOOK_ID || '';
      const verification = await verifyPayPalWebhook({
        headers: req.headers,
        body: req.rawBody || JSON.stringify(req.body),
        webhookId,
      });

      if (!verification.ok) {
        console.warn('[billing/webhook] PayPal webhook verification failed:', verification.reason);
        // Still return 200 to avoid PayPal retries during development
        return res.status(200).json({ ok: false, reason: 'verification_failed' });
      }

      const event = req.body;
      console.log('[billing/webhook] PayPal event:', event.event_type, event.id);

      // Log the webhook event
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO billing_webhook_events
            (provider, event_id, event_type, occurred_at, payload, process_status)
           VALUES ('paypal', $1, $2, $3, $4, 'processed')`,
          [
            event.id,
            event.event_type,
            event.create_time || new Date().toISOString(),
            JSON.stringify(event),
          ],
        );
      } finally {
        client.release();
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[billing/webhook] PayPal webhook failed:', error);
      return res.status(200).json({ ok: false, error: 'internal_error' });
    }
  });

  return router;
}
