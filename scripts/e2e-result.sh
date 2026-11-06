#!/usr/bin/env bash
# Воспроизводит порядок получения result.json из TASK.md:
# чистая БД -> сервис -> POST /sync -> вебхуки -> daily-totals c_7 за 27–31.03.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-result.json}"
PORT="${PORT:-3000}"

docker compose down -v >/dev/null 2>&1 || true
docker compose up -d
until docker compose exec -T postgres pg_isready -U postgres -d orders >/dev/null 2>&1; do sleep 1; done
until curl -sf localhost:4000/customers/c_7 >/dev/null; do sleep 1; done

PORT=$PORT npx tsx src/server.ts > /tmp/orders-aggregator-e2e.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
until curl -sf "localhost:$PORT/health" >/dev/null; do sleep 0.5; done

echo "sync: $(curl -sf -X POST "localhost:$PORT/sync")"
docker compose run --rm orders-api webhooks --target "http://host.docker.internal:$PORT/webhooks/order" 2>/dev/null | tail -1
curl -sf "localhost:$PORT/customers/c_7/daily-totals?from=2026-03-27&to=2026-03-31" > "$OUT"
echo; echo "saved $OUT:"; cat "$OUT"; echo
