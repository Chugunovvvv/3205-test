import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiOrder, dailyTotals, day, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("daily-totals: переход на летнее время", () => {
  beforeEach(() => {
    ctx.api.customers.set("c_7", "Europe/Berlin");
    // Запрос делается зимой (смещение +1), а считаем конец марта, где после 29.03 смещение +2.
    // Подменяем только Date: таймеры нужны pg и fastify
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("день заказа считается по смещению на момент заказа, а не на момент запроса", async () => {
    const order = (createdAt: string, amount: number) => apiOrder({ customerId: "c_7", createdAt, updatedAt: createdAt, amount });
    await postWebhook(ctx.app, order("2026-03-28T22:30:00Z", 1)); // 23:30 CET   → 28.03
    await postWebhook(ctx.app, order("2026-03-28T23:30:00Z", 10)); // 00:30 CET   → 29.03
    await postWebhook(ctx.app, order("2026-03-29T21:30:00Z", 100)); // 23:30 CEST  → 29.03
    await postWebhook(ctx.app, order("2026-03-29T22:30:00Z", 1000)); // 00:30 CEST → 30.03 (зимним смещением вышло бы 29.03)
    await postWebhook(ctx.app, order("2026-03-30T22:10:00Z", 10000)); // 00:10 CEST → 31.03

    const res = await dailyTotals(ctx.app, "c_7", "2026-03-28", "2026-03-31");
    expect(res.json()).toEqual([day("2026-03-28", 1), day("2026-03-29", 110), day("2026-03-30", 1000), day("2026-03-31", 10000)]);
  });

  it("обратный переход (25.10): час 02:00–03:00 повторяется, день не съезжает", async () => {
    const order = (createdAt: string, amount: number) => apiOrder({ customerId: "c_7", createdAt, updatedAt: createdAt, amount });
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z")); // запрос летом (+2)
    await postWebhook(ctx.app, order("2026-10-25T22:30:00Z", 5)); // 23:30 CET → 25.10 (летним смещением вышло бы 26.10)
    await postWebhook(ctx.app, order("2026-10-24T22:30:00Z", 7)); // 00:30 CEST → 25.10
    const res = await dailyTotals(ctx.app, "c_7", "2026-10-24", "2026-10-26");
    expect(res.json()).toEqual([day("2026-10-24", 0), day("2026-10-25", 12), day("2026-10-26", 0)]);
  });
});
