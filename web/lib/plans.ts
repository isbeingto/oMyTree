// 移除 supporter，保留 free, pro, team
export type PlanKey = 'free' | 'pro' | 'team';

const PLAN_KEYS: PlanKey[] = ['free', 'pro', 'team'];

export function normalizePlan(raw?: string | null): PlanKey {
  if (!raw || typeof raw !== 'string') return 'free';
  const normalized = raw.trim().toLowerCase();
  // supporter 映射到 free
  if (normalized === 'supporter') return 'free';
  return (PLAN_KEYS as string[]).includes(normalized) ? (normalized as PlanKey) : 'free';
}
export default {
  normalizePlan,
};
