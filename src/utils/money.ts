/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Процент скидки из внешнего API: число или строка, 0..100. */
export function parsePercent(raw: unknown): number {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`invalid discountPercent: ${JSON.stringify(raw)}`);
  }
  return value;
}

/**
 * Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем.
 *
 * Не `Math.floor(rub * 100)`: умножение в double даёт 4723.9 * 100 = 472389.99999999994,
 * и floor терял целую копейку. toFixed(6) округляет до 6 знаков корректно, после чего
 * отбрасываем всё дальше второго знака уже без арифметики с плавающей точкой.
 */
export function toKop(rub: number): number {
  const [int, frac = ""] = rub.toFixed(6).split(".");
  return Number(int) * 100 + Number(frac.slice(0, 2));
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}
