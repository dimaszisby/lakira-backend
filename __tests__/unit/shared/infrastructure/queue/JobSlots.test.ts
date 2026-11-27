import { describe, it, expect } from "@jest/globals";
import { JobSlots } from "@/shared/infrastructure/queue/JobSlots.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ADR-0100 (#310, audit 2026-11-14 X62).
describe("JobSlots", () => {
  it("refuses a size below 1, or not whole", () => {
    expect(() => new JobSlots(0)).toThrow(RangeError);
    expect(() => new JobSlots(1.5)).toThrow(RangeError);
    expect(new JobSlots(1).size).toBe(1);
  });

  it("never lets more than its size run at once", async () => {
    const slots = new JobSlots(2);
    let running = 0;
    let most = 0;
    await Promise.all(
      Array.from({ length: 7 }, async () => {
        const release = await slots.acquire();
        running++;
        most = Math.max(most, running);
        await flush();
        running--;
        release();
      }),
    );

    expect(most).toBe(2);
    expect(slots.running).toBe(0);
    expect(slots.waiting).toBe(0);
  });

  it("serves waiters in the order they arrived", async () => {
    const slots = new JobSlots(1);
    const order: number[] = [];
    const first = await slots.acquire();
    const waiting = [1, 2, 3].map((n) =>
      slots.acquire().then((release) => {
        order.push(n);
        release();
      }),
    );
    expect(slots.waiting).toBe(3);

    first();
    await Promise.all(waiting);

    expect(order).toEqual([1, 2, 3]);
  });

  it("frees a slot once however often its release is called", async () => {
    const slots = new JobSlots(1);
    const release = await slots.acquire();
    let second = false;
    let third = false;
    void slots.acquire().then(() => {
      second = true;
    });
    void slots.acquire().then(() => {
      third = true;
    });

    release();
    release();
    await flush();

    expect(second).toBe(true);
    expect(third).toBe(false);
    expect(slots.running).toBe(1);
  });

  it("drops a waiter whose signal aborts, and still serves the next", async () => {
    const slots = new JobSlots(1);
    const release = await slots.acquire();
    const stop = new AbortController();
    const aborted = slots.acquire(stop.signal);
    let nextServed = false;
    const next = slots.acquire().then((r) => {
      nextServed = true;
      r();
    });

    stop.abort(new Error("stopping"));
    await expect(aborted).rejects.toThrow("stopping");
    expect(slots.waiting).toBe(1);

    release();
    await next;
    expect(nextServed).toBe(true);
    expect(slots.running).toBe(0);
  });

  it("refuses at once when the signal has already aborted", async () => {
    const slots = new JobSlots(1);
    const stop = new AbortController();
    stop.abort(new Error("stopping"));

    await expect(slots.acquire(stop.signal)).rejects.toThrow("stopping");
    expect(slots.running).toBe(0);
  });
});
