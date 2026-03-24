/**
 * Billing service — STUB
 *
 * Paddle has been removed. This module retains the same export surface
 * so that existing callers (account_billing route, tests) continue to
 * resolve at import time, but every function either throws
 * "billing_not_configured" or returns a safe no-op value.
 *
 * TODO: Replace with PayPal Subscriptions API integration.
 */

import { HttpError } from '../../lib/errors.js';

/* ── helpers ── */

function notConfiguredError() {
  return new HttpError({
    status: 503,
    code: 'billing_not_configured',
    message: 'Payment provider is not configured yet',
  });
}

/* ── config ── */

export function getPaddleBillingConfig() {
  return {
    provider: 'none',
    environment: 'sandbox',
    apiBase: '',
    apiKey: '',
    webhookSecret: '',
    clientToken: '',
    proPriceId: '',
    checkoutTtlMinutes: 30,
    isReady: false,
  };
}

/* ── webhook helpers (stubs) ── */

export function verifyPaddleWebhookSignature() {
  return { ok: false, reason: 'provider_not_configured' };
}

export function parsePaddleWebhookEvent() {
  throw notConfiguredError();
}

export function normalizeSubscriptionSnapshot() {
  return {};
}

export function derivePlanFromSubscription({
  status = '',
  priceId = '',
  targetPriceId = '',
  fallbackIsTarget = false,
} = {}) {
  return {
    planCode: 'free',
    isTargetPlan: false,
    isEntitled: false,
    normalizedStatus: String(status).toLowerCase(),
    normalizedPriceId: String(priceId),
  };
}

/* ── checkout ── */

export async function createCheckoutLink() {
  throw notConfiguredError();
}

export function buildCheckoutCustomData() {
  return {};
}

/* ── billing overview ── */

export async function getUserBillingOverview({ client, userId }) {
  const planRes = await client.query(
    `SELECT plan FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const userPlan =
    (typeof planRes.rows[0]?.plan === 'string' && planRes.rows[0].plan.trim()) || 'free';
  return { userPlan, subscription: null };
}

/* ── webhook event persistence (stubs) ── */

export async function insertWebhookEventReceipt() {
  return null;
}

export async function updateWebhookEventStatus() {}

/* ── subscription resolution ── */

export async function resolveUserIdForSubscription() {
  return null;
}

export async function applyPaddleSubscriptionSnapshot() {
  throw notConfiguredError();
}

export async function processPaddleWebhookEvent() {
  return {
    processStatus: 'ignored',
    reason: 'provider_not_configured',
    userId: null,
    subscriptionId: null,
  };
}

/* ── provider API calls (stubs) ── */

export async function requestPaddleCancelSubscription() {
  throw notConfiguredError();
}

export async function requestPaddleResumeSubscription() {
  throw notConfiguredError();
}
