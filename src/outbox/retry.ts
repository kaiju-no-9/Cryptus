export interface RetryPolicy {
  initialDelayMs: number;    // 1000ms (1s)
  maxDelayMs: number;        // 300000ms (5 min)
  backoffMultiplier: number; // 2
  maxRetries: number;        // Infinity or fixed limit
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  initialDelayMs: 1_000,
  maxDelayMs: 300_000,
  backoffMultiplier: 2,
  maxRetries: Infinity,
};

/**
 * Calculates backoff delay with ±25% jitter for a given retry attempt.
 *
 * Formula:
 *   delay = min(initialDelay × backoffMultiplier^attempt, maxDelay)
 *   jitter = delay × 0.25 × (random[-1, 1])
 *   return max(0, delay + jitter)
 */
export function calculateDelay(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const delay = Math.min(
    policy.initialDelayMs * Math.pow(policy.backoffMultiplier, Math.max(0, attempt)),
    policy.maxDelayMs,
  );

  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(delay + jitter));
}
