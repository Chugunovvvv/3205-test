-- Скидки из внешнего API.
-- amount_paid_kop = NULL — заказ сохранён до появления скидок, сколько оплачено, неизвестно.
-- Такая строка перезаписывается следующим синком/вебхуком даже с тем же updatedAt (см. OrdersRepository.upsert).
ALTER TABLE orders
  ADD COLUMN amount_paid_kop  BIGINT,
  ADD COLUMN discount_percent NUMERIC(5, 2);
