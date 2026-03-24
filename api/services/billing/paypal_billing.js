/**
 * PayPal Billing Service — PayPal Complete Payments (Orders API v2)
 *
 * Uses PayPal REST API to create and capture orders for subscription checkout.
 * Requires PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE env vars.
 */

import { HttpError } from '../../lib/errors.js';

/* ── Config ── */

const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' | 'live'
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';

const API_BASE =
  PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

export function getPayPalBillingConfig() {
  const isReady = Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
  return {
    provider: isReady ? 'paypal' : 'none',
    environment: PAYPAL_MODE,
    clientId: PAYPAL_CLIENT_ID,
    isReady,
  };
}

/* ── Access Token ── */

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`,
  ).toString('base64');

  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[paypal] Failed to get access token:', res.status, text);
    throw new HttpError({
      status: 502,
      code: 'paypal_auth_failed',
      message: 'Failed to authenticate with PayPal',
    });
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

/* ── Create Order ── */

export async function createPayPalOrder({ planCode, userId, userEmail }) {
  const config = getPayPalBillingConfig();
  if (!config.isReady) {
    throw new HttpError({
      status: 503,
      code: 'billing_not_configured',
      message: 'PayPal is not configured',
    });
  }

  // Define plan pricing (match pricing page: Pro plan)
  const plans = {
    pro: {
      name: 'oMyTree Pro',
      description: 'oMyTree Pro monthly subscription',
      amount: '9.90',
      currency: 'USD',
    },
  };

  const plan = plans[planCode];
  if (!plan) {
    throw new HttpError({
      status: 400,
      code: 'invalid_plan',
      message: `Unknown plan: ${planCode}`,
    });
  }

  const accessToken = await getAccessToken();

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: `omytree_${planCode}_${userId}`,
        description: plan.description,
        amount: {
          currency_code: plan.currency,
          value: plan.amount,
        },
        custom_id: JSON.stringify({ userId, planCode }),
      },
    ],
    application_context: {
      brand_name: 'oMyTree',
      locale: 'en-US',
      user_action: 'PAY_NOW',
    },
  };

  const res = await fetch(`${API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderPayload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[paypal] Failed to create order:', res.status, text);
    throw new HttpError({
      status: 502,
      code: 'paypal_create_order_failed',
      message: 'Failed to create PayPal order',
    });
  }

  const order = await res.json();
  return { orderId: order.id, status: order.status };
}

/* ── Capture Order ── */

export async function capturePayPalOrder({ orderId }) {
  const config = getPayPalBillingConfig();
  if (!config.isReady) {
    throw new HttpError({
      status: 503,
      code: 'billing_not_configured',
      message: 'PayPal is not configured',
    });
  }

  const accessToken = await getAccessToken();

  const res = await fetch(`${API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[paypal] Failed to capture order:', res.status, text);
    throw new HttpError({
      status: 502,
      code: 'paypal_capture_failed',
      message: 'Failed to capture PayPal order',
    });
  }

  const captureData = await res.json();
  return captureData;
}

/* ── Verify Webhook Signature ── */

export async function verifyPayPalWebhook({ headers, body, webhookId }) {
  if (!webhookId) {
    return { ok: false, reason: 'no_webhook_id_configured' };
  }

  const accessToken = await getAccessToken();

  const verifyPayload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: typeof body === 'string' ? JSON.parse(body) : body,
  };

  const res = await fetch(`${API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verifyPayload),
  });

  if (!res.ok) {
    console.error('[paypal] Webhook verification request failed:', res.status);
    return { ok: false, reason: 'verification_request_failed' };
  }

  const result = await res.json();
  return {
    ok: result.verification_status === 'SUCCESS',
    reason: result.verification_status,
  };
}

/* ── User billing overview (reuse existing DB query) ── */

export async function getUserBillingOverview({ client, userId }) {
  const planRes = await client.query(
    `SELECT plan FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const userPlan =
    (typeof planRes.rows[0]?.plan === 'string' && planRes.rows[0].plan.trim()) || 'free';

  // Check for active PayPal subscription in billing_subscriptions
  const subRes = await client.query(
    `SELECT * FROM billing_subscriptions
     WHERE user_id = $1 AND provider = 'paypal'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );

  const sub = subRes.rows[0] || null;
  const subscription = sub
    ? {
        provider: 'paypal',
        subscription_id: sub.paddle_subscription_id,
        customer_id: sub.paddle_customer_id,
        status: sub.status,
        plan_code: sub.plan_code,
        is_target_plan: sub.plan_code === 'pro',
        price_id: sub.price_id,
        currency_code: sub.currency_code,
        current_period_start: sub.current_billing_period_starts_at,
        current_period_end: sub.current_billing_period_ends_at,
        scheduled_change: sub.scheduled_change,
        management_urls: sub.management_urls,
        canceled_at: sub.canceled_at,
        paused_at: sub.paused_at,
        trial_ends_at: sub.trial_ends_at,
        updated_at: sub.updated_at,
      }
    : null;

  return { userPlan, subscription };
}
