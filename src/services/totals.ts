import type { OrdersRepository } from "../repositories/orders.js";
import { fromKop } from "../utils/money.js";
import { datesBetween, localDate } from "../utils/time.js";
import type { CustomersService } from "./customers.js";

export interface DailyTotal {
  date: string;
  /** = gross, оставлено для обратной совместимости. */
  total: number;
  /** Сумма оплаченных заказов до скидки. */
  gross: number;
  /** gross - net. */
  discount: number;
  /** Фактически оплачено клиентами. */
  net: number;
}

const DAY = 86_400_000;

export class TotalsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Сумма оплаченных заказов клиента по дням в его таймзоне, from..to включительно.
   * Дни без оплат — с нулями.
   */
  async daily(customerId: string, from: string, to: string): Promise<DailyTotal[]> {
    const timezone = await this.customers.timezone(customerId);

    // Смещения таймзон в пределах ±14 ч: берём с запасом в сутки с каждой стороны
    const rows = await this.orders.paidCreatedBetween(
      customerId,
      new Date(Date.parse(`${from}T00:00:00Z`) - DAY),
      new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY),
    );

    // Суммируем в целых копейках, в рубли переводим только при выдаче
    const sums = new Map(datesBetween(from, to).map((d) => [d, { gross: 0, net: 0 }]));
    for (const o of rows) {
      // День — по смещению таймзоны в момент создания заказа, а не в момент запроса:
      // иначе после перехода на летнее/зимнее время заказы около полуночи уезжают в соседний день
      const day = sums.get(localDate(o.createdAt, timezone));
      if (!day) continue;
      day.gross += o.amountKop;
      // amountPaidKop = null — заказ сохранён до появления скидок и ещё не пересинхронизирован
      day.net += o.amountPaidKop ?? o.amountKop;
    }
    return [...sums].map(([date, { gross, net }]) => ({
      date,
      total: fromKop(gross),
      gross: fromKop(gross),
      discount: fromKop(gross - net),
      net: fromKop(net),
    }));
  }
}
