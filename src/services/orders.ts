import { z } from "zod";
import { ValidationError } from "../errors.js";
import type { Order, OrdersRepository, UpsertResult } from "../repositories/orders.js";
import { parsePercent, parseRub, toKop } from "../utils/money.js";
import { parseUtc } from "../utils/time.js";

/** Заказ в формате внешнего API (поля, которые нам нужны; остальные игнорируем). */
const ExternalOrder = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  // Появились в API недавно: старые заказы приходят без них
  discountPercent: z.union([z.number(), z.string()]).optional(),
  amountPaid: z.union([z.number(), z.string()]).optional(),
  status: z.enum(["pending", "paid", "refunded"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplyResult = UpsertResult;

export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  normalize(raw: unknown): Order {
    const parsed = ExternalOrder.safeParse(raw);
    if (!parsed.success) throw new ValidationError(`invalid order: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    const o = parsed.data;
    try {
      const amountKop = toKop(parseRub(o.amount));
      // Нет amountPaid — заказ в старом формате, без скидки: оплачено столько же, сколько стоит
      const amountPaidKop = o.amountPaid === undefined ? amountKop : toKop(parseRub(o.amountPaid));
      const discountPercent = o.discountPercent === undefined ? 0 : parsePercent(o.discountPercent);
      return {
        id: o.id,
        customerId: o.customerId,
        amountKop,
        amountPaidKop,
        discountPercent,
        status: o.status,
        createdAt: parseUtc(o.createdAt),
        updatedAt: parseUtc(o.updatedAt),
      };
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
  }

  /**
   * Применяет версию заказа (из синка или вебхука).
   * Вебхуки приходят с повторами, не по порядку и параллельно, поэтому версию сохраняем,
   * только если она новее уже сохранённой (по updatedAt) — атомарно, в репозитории.
   */
  async apply(raw: unknown): Promise<ApplyResult> {
    return this.orders.upsert(this.normalize(raw));
  }
}
