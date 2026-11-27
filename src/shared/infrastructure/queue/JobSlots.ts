/**
 * How many queued jobs one worker runs at once, across every consumer it holds
 * (ADR-0100). Each job takes one database connection for its transaction
 * (ADR-0077), so the worker sizes this from `DB_POOL_MAX`: a delivered message
 * waits here, holding nothing, instead of waiting on the pool, where the
 * acquire timeout would fail it into retry (audit 2026-11-14, X62).
 */
export class JobSlots {
  private inUse = 0;
  private readonly waiters: Array<{ grant: (release: () => void) => void }> =
    [];

  constructor(readonly size: number) {
    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError(
        `JobSlots needs a whole size of 1 or more, got ${size}`,
      );
    }
  }

  /** Jobs holding a slot now. */
  get running(): number {
    return this.inUse;
  }

  /** Jobs waiting for one. */
  get waiting(): number {
    return this.waiters.length;
  }

  /**
   * Resolves with this job's release, in arrival order. A waiter whose signal
   * aborts is removed and rejects with the signal's reason, holding no slot.
   */
  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.inUse < this.size) {
      this.inUse++;
      return Promise.resolve(this.releaseOnce());
    }

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(signal?.reason);
      };
      const waiter = {
        grant: (release: () => void) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(release);
        },
      };
      this.waiters.push(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** A release that frees its slot once, however often it is called. */
  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      // The slot passes straight to the next waiter, so the count never dips
      // and a job arriving meanwhile cannot take it out of turn.
      if (next) next.grant(this.releaseOnce());
      else this.inUse--;
    };
  }
}
