# Развёртывание Weez Poker

## Текущий Cloudflare Workers Free

Публичная PLAY-beta: [weez-poker.wizzssm.workers.dev](https://weez-poker.wizzssm.workers.dev).
Worker обслуживает assets, а один SQLite Durable Object сохраняет состояние комнаты
и запускает игровые deadlines через alarms. Containers, Render, PostgreSQL и Redis
для этого окружения не используются. Платежи и выводы принудительно выключены.

Инструкция: [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md). Проверка: `npm run test:cloudflare`.
Публиковать из `codex/cloudflare-production`; `main` пока связан со старым Render.
Ниже сохранены инструкции прежнего окружения; они не задают Cloudflare-конфигурацию.

## Контракты окружения

- `.env.example` — шаблон локальных настроек; по умолчанию demo.
- `render.yaml` — production blueprint; сейчас `REAL_MONEY_ENABLED=true`,
  `WITHDRAWALS_ENABLED=true`, `TEST_PLAYERS_ENABLED=false`.
- `render.staging.yaml` — отдельный blueprint для ветки `staging`;
  см. [изоляцию и приёмку](docs/STAGING.md).

Коммит в `main` автоматически запускает production deploy. В рамках локальной
разработки или уборки не отправлять изменения в `main` без поручения владельца.

## Production на Render

Создать Blueprint из репозитория и заполнить секреты с `sync: false` через настройки
сервиса. `render.yaml` задаёт `npm ci`, `npm start` и health check `/api/health`.
Фактическую доступность staging нужно проверять отдельно: в репозитории есть
его конфигурация, а не подтверждение развёртывания.

Сервер проверяет обязательные настройки при запуске:

- `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (16–256 допустимых символов),
  `METRICS_TOKEN` (не короче 32 символов);
- для real-money: `DATABASE_URL`, `REDIS_URL`, HTTPS `APP_PUBLIC_URL`,
  `DEVICE_HASH_SECRET` от 32 символов и owner/admin Telegram ID;
- при включённых выводах: `ADMIN_FINANCE_IDS`.

Платёжные ключи, адреса, администраторы и оповещения настраиваются по
[PAYMENTS.md](PAYMENTS.md), [BETA_OPERATIONS](docs/BETA_OPERATIONS.md)
и действующему blueprint. Не копировать секреты production в тестовую среду.

В настройках Telegram Mini App указать публичный HTTPS URL сервиса.
Webhook бота должен вести на `/api/telegram/webhook`; его `secret_token`
должен совпадать с `TELEGRAM_WEBHOOK_SECRET`.

## Контейнер или экспорт

`Dockerfile` устанавливает зависимости через `npm ci --omit=dev` и копирует
`server/`, `public/`, runtime-файлы `vendor/pokersolver` и лицензию.
Локальные `.env`, архивы, исходные дизайнерские референсы и временные результаты
исключены из контекста сборки. Передавать настройки контейнеру через окружение.

Для экспорта без контейнера:

```bash
npm run release:clean
cd release
npm ci --omit=dev
npm start
```

Команда пересоздаёт `release/`. Экспорт не содержит `.env`; необходимые настройки
нужно задать отдельно. `npm start` включает production-проверки даже в demo.
В `render.yaml`, входящем в экспорт, включён режим реальных денег.

## Приёмка

1. Запустить `npm test` и отдельные инфраструктурные проверки на тестовых сервисах.
2. Проверить production-настройки командой `npm run preflight:launch` в нужном
   окружении. Эта проверка оценивает конфигурацию; подключения и платежи проверяются отдельно.
3. Пройти checklist из [STAGING](docs/STAGING.md) и проверить `/api/health`.
4. Проверить оповещения, reconciliation и сценарий возврата к прошлому релизу.

PostgreSQL создаёт схему при запуске. В demo без PostgreSQL/Redis данные теряются
при перезапуске. Real-money отказывает в запуске без этих служб.
Активные столы и таймеры принадлежат одному процессу; несколько game writers
требуют отдельной архитектуры. Подробности — [DATABASE.md](DATABASE.md).
