const HEADER_MAP = {
  turn: {
    rateRemaining: "X-oMyTree-Turn-RateRemaining",
    rateReset: "X-oMyTree-Turn-RateResetAt",
    quotaRemaining: "X-oMyTree-Turn-QuotaRemaining",
    quotaReset: "X-oMyTree-Turn-QuotaResetAt",
  },
  summarize: {
    rateRemaining: "X-oMyTree-Summarize-RateRemaining",
    rateReset: "X-oMyTree-Summarize-RateResetAt",
    quotaRemaining: "X-oMyTree-Summarize-QuotaRemaining",
    quotaReset: "X-oMyTree-Summarize-QuotaResetAt",
  },
  relevance: {
    rateRemaining: "X-oMyTree-Relevance-RateRemaining",
    rateReset: "X-oMyTree-Relevance-RateResetAt",
    quotaRemaining: "X-oMyTree-Relevance-QuotaRemaining",
    quotaReset: "X-oMyTree-Relevance-QuotaResetAt",
  },
  upload: {
    rateRemaining: "X-oMyTree-Upload-RateRemaining",
    rateReset: "X-oMyTree-Upload-RateResetAt",
    quotaRemaining: "X-oMyTree-Upload-QuotaRemaining",
    quotaReset: "X-oMyTree-Upload-QuotaResetAt",
  },
};

function formatRemaining(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (value <= 0) {
    return "0";
  }
  return String(Math.floor(value));
}

export function applyRateQuotaHeaders(res, kind) {
  const headerNames = HEADER_MAP[kind];
  const meta = res.locals?.rateQuotaMeta?.[kind];

  if (!headerNames || !meta) {
    return;
  }

  const remainingRate = meta.remaining?.rate ?? null;
  const remainingQuota = meta.remaining?.quota ?? null;
  const rateResetAt = meta.resetAt?.rate ?? "";
  const quotaResetAt = meta.resetAt?.quota ?? "";

  res.set(headerNames.rateRemaining, formatRemaining(remainingRate));
  res.set(headerNames.rateReset, rateResetAt || "");
  res.set(headerNames.quotaRemaining, formatRemaining(remainingQuota));
  res.set(headerNames.quotaReset, quotaResetAt || "");
}

export { HEADER_MAP };
