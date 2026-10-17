# Текущая документация

Начать с [разбора готовности](LAUNCH_REVIEW.md). Старые планы и материалы находятся
в одной папке [archive](../archive/README.md); они не задают текущую очередь работ.

## Контракты, нужные для разработки

- [MASTER_SPEC](../MASTER_SPEC.md) — продукт и экономика; приоритет при конфликте.
- [DATABASE](../DATABASE.md) — хранение, транзакции, ledger и восстановление.
- [PAYMENTS](../PAYMENTS.md), [BONUS_WITHDRAWAL](BONUS_WITHDRAWAL.md) — существующие
  платёжные процессы и бонусы; подключение выбранной системы отложено до готовности продукта.
- [RATING_INTEGRITY](RATING_INTEGRITY.md) — рейтинг и ограничения против накрутки.
- [FAIRNESS](FAIRNESS.md) — фактическая схема проверки раздач и её ограничения.
- [POKER_KERNEL](POKER_KERNEL.md) — текущая интеграция Hold’em, сравнение движков и проверка функций онлайн-столов.
- [DESIGN_SYSTEM](DESIGN_SYSTEM.md) — интерфейс и порядок миграции CSS.
- [ATTRIBUTION_ANALYTICS](ATTRIBUTION_ANALYTICS.md) — действующий контракт атрибуции.
- [13-decisions](13-decisions.md) — датированные решения; не считать их backlog.

Если контракт расходится с кодом, записать конфликт и согласовать изменение
поведения. Не менять финансовую логику по историческому ТЗ.

## Эксплуатация

- [CLOUDFLARE](CLOUDFLARE.md) — текущий бесплатный Workers/SQLite DO, публикация и восстановление.

- [DEPLOYMENT](../DEPLOYMENT.md), [STAGING](STAGING.md) — окружения и размещение.
- [BETA_OPERATIONS](BETA_OPERATIONS.md) — работа оператора.
- [PAYMENT_INCIDENT_RUNBOOK](PAYMENT_INCIDENT_RUNBOOK.md) — существующие платёжные инциденты.

Документы описывают правила; они не подтверждают выполнение ручной проверки
или существование работающего staging. Проверенные факты собраны в [разборе](LAUNCH_REVIEW.md).

## Проверки внешних сервисов

Обычный `npm test` запускает unit- и HTTP-проверки. 9 внешних проверок по умолчанию
пропускаются; использовать только отдельные тестовые PostgreSQL/Redis.

- `tests/infrastructure-integration.test.js`: `RUN_INFRA_INTEGRATION_TESTS=true`,
  `DATABASE_URL` и `REDIS_URL` тестовых сервисов.
- Внешние сценарии `tests/table-flow.test.js`: `TEST_DATABASE_URL` и
  `TEST_REDIS_URL`; каждый сценарий передаёт их своему серверу явно.

Проверки создают финансовые и игровые записи. Production для них не использовать.
