/**
 * Tiny rate limiter — caps the number of in-flight async tasks AND enforces a
 * minimum delay between consecutive starts. Used to throttle AI calls so
 * users can't accidentally fire 200 requests by mashing a button.
 */

interface Options {
  /** Max in-flight tasks. Defaults to 4. */
  maxConcurrent?: number;
  /** Minimum ms between two consecutive task starts. Defaults to 0. */
  minIntervalMs?: number;
}

export class RateLimiter {
  private maxConcurrent: number;
  private minIntervalMs: number;
  private active = 0;
  private lastStart = 0;
  private waiters: Array<() => void> = [];

  constructor(options: Options = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 4;
    this.minIntervalMs = options.minIntervalMs ?? 0;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    while (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    if (this.minIntervalMs > 0) {
      const wait = Math.max(0, this.lastStart + this.minIntervalMs - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    this.lastStart = Date.now();
    this.active += 1;
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}

/** Singleton limiter shared by all AI requests in the app. */
export const aiLimiter = new RateLimiter({ maxConcurrent: 4, minIntervalMs: 80 });

/** Convenience: debounce — keeps only the latest call within `wait` ms. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
