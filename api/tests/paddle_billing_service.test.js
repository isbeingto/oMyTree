import { describe, expect, it } from 'vitest';
import {
  derivePlanFromSubscription,
  getPaddleBillingConfig,
} from '../services/billing/paddle_billing.js';

describe('billing service stubs (paddle removed)', () => {
  it('config reports billing as not ready', () => {
    const config = getPaddleBillingConfig();
    expect(config.isReady).toBe(false);
    expect(config.provider).toBe('none');
  });

  it('derivePlanFromSubscription always returns free when no provider configured', () => {
    const result = derivePlanFromSubscription({
      status: 'active',
      priceId: 'pri_pro_monthly',
      targetPriceId: 'pri_pro_monthly',
    });
    expect(result.planCode).toBe('free');
    expect(result.isTargetPlan).toBe(false);
  });
});
