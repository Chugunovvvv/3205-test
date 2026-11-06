import { describe, expect, it } from "vitest";
import { apiOrder, dailyTotals, day, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("daily-totals: скидки", () => {
  it("gross / discount / net, total = gross", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 2500, discountPercent: 16.5, amountPaid: 2087.5 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 2500, gross: 2500, discount: 412.5, net: 2087.5 }]);
  });

  it("суммирует несколько заказов за день, в том числе без скидки", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1000, discountPercent: 10, amountPaid: 900 }));
    await postWebhook(ctx.app, apiOrder({ amount: 500, discountPercent: 0, amountPaid: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 700, discountPercent: 20, amountPaid: 560, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([day("2026-02-10", 1500, 1400)]);
  });

  it("заказ в старом формате (без discountPercent и amountPaid) — без скидки", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1200 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([day("2026-02-10", 1200, 1200)]);
  });

  it("строки в amountPaid и discountPercent", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: "1627.00", discountPercent: "10", amountPaid: "1464.30" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([day("2026-02-10", 1627, 1464.3)]);
  });

  it("точность до копейки: суммы, на которых float теряет копейку", async () => {
    // 4723.9 * 100 = 472389.99999999994 — раньше floor давал 472389
    await postWebhook(ctx.app, apiOrder({ amount: 5249, discountPercent: 10, amountPaid: 4723.9 }));
    await postWebhook(ctx.app, apiOrder({ amount: 1281, discountPercent: 5, amountPaid: 1216.95 }));
    await postWebhook(ctx.app, apiOrder({ amount: 0.3, discountPercent: 3, amountPaid: 0.29 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 6530.3, gross: 6530.3, discount: 589.16, net: 5941.14 }]);
  });

  it("невалидный discountPercent — 400", async () => {
    expect((await postWebhook(ctx.app, apiOrder({ discountPercent: 150, amountPaid: 0 }))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, apiOrder({ discountPercent: "abc", amountPaid: 0 }))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, apiOrder({ discountPercent: 5, amountPaid: -1 }))).statusCode).toBe(400);
  });
});

describe("заказы, сохранённые до появления скидок", () => {
  it("синк с тем же updatedAt дозаполняет amountPaid", async () => {
    const o = apiOrder({ amount: 1000, discountPercent: 10, amountPaid: 900 });
    // Строка, как её оставила старая версия сервиса: amount_paid_kop = NULL
    await ctx.db.query(
      `INSERT INTO orders (id, customer_id, amount_kop, status, created_at, updated_at) VALUES ($1, $2, 100000, 'paid', $3, $4)`,
      [o.id, o.customerId, o.createdAt, o.updatedAt],
    );
    // Пока не пересинхронизирован — считаем без скидки
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json()).toEqual([day("2026-02-10", 1000, 1000)]);

    ctx.api.pages.set(null, { items: [o], nextCursor: null });
    const sync = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(sync.json()).toMatchObject({ applied: 1, stale: 0 });
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json()).toEqual([day("2026-02-10", 1000, 900)]);

    // Повторный синк той же версии — уже stale
    expect((await ctx.app.inject({ method: "POST", url: "/sync" })).json()).toMatchObject({ applied: 0, stale: 1 });
  });
});
