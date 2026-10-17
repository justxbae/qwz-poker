# Weez Poker — technical roadmap

Дата актуализации: 2026-07-20.

## Как читать

- Продуктовый канон: `MASTER_SPEC.md`; датированные изменения — `docs/13-decisions.md`.
- Полная программа industrial-grade развития: `archive/planning/WEEZ_ENTERPRISE_MASTER_TZ.md`.
- Текущая готовность controlled beta: `archive/planning/WEEZ_CONTROLLED_BETA_READINESS.md`.
- Текущее состояние уборки: `archive/audits/MAINTENANCE_2026-10-16.md`; исторический аудит — `archive/audits/CODEBASE_CHECKUP_2026-07-19.md`.
- Этот файл содержит только актуальную очередь работ и не повторяет подробное ТЗ.

## Проверенный baseline

Controlled-beta configuration от 2026-07-20:

- Первый экран — Rating; публичный rating фиксирован на `100/200`, `6-max`, один готовый стол плюс overflow при `5/6`.
- Cash показывает только `$0.01/$0.02`, `$0.02/$0.05`, `$0.05/$0.10`, по одному готовому столу на лимит плюс overflow при `5/6`.
- Автоматические demo-турниры отключены; публично видны только cash-турниры, созданные администратором.
- Daily Bonus: `35 000 PLAY_CHIPS` раз в 24 часа только при балансе `<= 34 999`.
- Касса: депозит от `$1`, вывод от `$5`, видимая комиссия `2% + network fee`, ручной SLA до 24 часов.
- Timing contract реализован (`20s` action, `3s` show/muck, `5s` next hand, `30s` reconnect, `300s` cash/rating sit-out), но до активного привлечения пользователей требует QA на двух реальных устройствах.

- Node.js monolith, PostgreSQL, Redis, Telegram Mini App.
- NL Hold'em cash/rating core: strict table stakes, blinds/HU, side pots, odd chips, uncalled return, all-in runout, showdown/muck, contributed rake, hand history, fairness proof.
- Cash и PLAY_CHIPS разделены по bucket и никогда не конвертируются друг в друга.
- Wallet/ledger/idempotency и durable table snapshot применяются к денежным операциям.
- Redis single-writer lock/revision, SSE с `Last-Event-ID`, presence heartbeat и reconnect lifecycle реализованы.
- Daily rating refill: 35 000 PLAY_CHIPS / 24h, только если play balance ≤ 34 999.
- Cash MTT/SNG/freeroll runtime, tickets для post-season reward events, admin actions и payout flow реализованы.
- Deposit/withdrawal lifecycle, manual review, reconciliation, admin live-table view и Telegram incident whitelist присутствуют.
- Server-driven event contract, attribution, achievement/status foundation и session-scoped hand-history contract присутствуют.
- Добавлен отдельный staging blueprint для ветки `staging`: отдельные PostgreSQL/Redis/Telegram secrets, real-money fail-closed, payments/withdrawals выключены.
- Redis snapshot writes защищены revision CAS; при старте выбирается максимальная ревизия PostgreSQL/Redis, а PostgreSQL побеждает при равенстве.
- Начата проверяемая CSS-миграция: игровой chrome перенесён в финальный Design System 2.0 layer, legacy-бюджет закреплён тестом.
- Локальный suite: 121 tests, 112 pass, 0 fail, 9 infrastructure/provider skips.

## Gate A — перед активным привлечением пользователей в открытую beta

1. Device QA в реальном Telegram на целевых iPhone/Android viewport и светлой/тёмной теме:
   lobby, rating/cash switch, daily claim, table join/leave/reconnect, cashier, profile, tournaments, private tables и все sheets.
2. Закрыть воспроизводимые UX-регрессии из device QA; для каждого — screenshot/video before/after и regression test, где возможно.
3. Проверить session-scoped hand history на реальной игре 2–6 игроков: только текущая сессия, корректная privacy folded cards, showdown cards и winner data.
4. Проверить cash session lifecycle: timeout → auto-check/fold → sit-out 300s → idempotent seat release + stack return.
5. Проверить tournament disconnect: место не освобождается, игрок продолжает blind/ante out.
6. Проверить все пользовательские документы, FAQ, support links, error/empty/loading/disabled states.
7. Провести product review и опубликовать реализованную `rp-v2-beta` формулу из
   `docs/RATING_INTEGRITY.md`; до материальных наград закрыть оставшиеся risk/reversal/season-close gaps.

## Gate B — перед публичным real-money трафиком

1. Юридическая готовность по территориям: оператор, лицензирование/геоблок, Terms, Privacy, AML/KYC, Responsible Gaming 18+, dispute handling и data retention.
2. Создать окружение из `render.staging.yaml` по `docs/STAGING.md`, подключить отдельные PostgreSQL/Redis/Telegram secrets и запустить 9 gated integration tests; production data не использовать.
3. Failure injection:
   - restart during hand;
   - Redis unavailable/lock expiry;
   - PostgreSQL commit timeout и ambiguous response retry;
   - duplicate payment webhook;
   - withdrawal approve/reject/cancel races;
   - tournament payout/guarantee retry;
   - reconciliation drift alert.
4. Backup/restore drill с измеренными RPO/RTO и подтверждённым восстановлением ledger, wallets, tournaments и table snapshots.
5. Payment-provider E2E на минимальных суммах для каждого включённого rail; documented incident/refund/reconciliation flow.
6. Security pass: Telegram initData replay/TTL, admin RBAC/MFA, secret rotation, rate limits, dependency review, log redaction и access audit.
7. Observability: SLO/alerts для API, game tick lag, SSE disconnects, locks, DB pool, Redis, payment latency, reconciliation drift и notification delivery.
8. Capacity test на ожидаемый controlled launch ×3, без запуска нескольких game writers до доказанной ownership/routing модели.

## P1 — продукт после стабильной controlled beta

- Rating integrity v2 core реализован: UTC seasons, qualification, opponent diversity,
  daily positive cap, repeated-pair block и risk freeze. Остались device/IP clusters,
  chip-dumping/ring signals, RP correction/reversal, immutable season close и appeals.
- Achievement/status MVP с серверными правилами, versioned catalog и безопасным отображением без cash advantage.
- Referral qualification и affiliate ledger: first/last touch, qualified depositor/active player, fraud hold, clawback, payout audit.
- Liquidity dashboard: concurrent seated players, active tables, time-to-first-hand, fill rate по stakes/hour, churn after empty lobby.
- CRM/support operations: ticket taxonomy, SLA, user timeline, payment/game incident linking, responsible-game interventions.
- Admin live view v2: SSE refresh, table-linked fund movements/ledger references и guarded intervention workflow.
- Tournament hardening: late-reg edge cases, balancing/final-table device QA, payout visibility, notifications and operator runbook.

## P2 — масштабирование

- Разделить монолит по доменным модулям без изменения поведения: auth, cashier, tables, tournaments, admin, analytics.
- Зафиксировать game-server ownership model для нескольких процессов/нод: routing, fencing token, lock-loss behavior и hand recovery.
- Перевести scheduler/notifications/reconciliation в durable jobs с retry/dead-letter semantics.
- Data warehouse/event pipeline с версионированной схемой и privacy controls.
- Controlled upgrade `@sentry/node` 8 → актуальная major-версия: сейчас `npm audit` показывает 19 moderate OpenTelemetry advisories, без high/critical.
- Продолжить component-by-component CSS consolidation. Текущий budget-test запрещает рост legacy, но перед массовым удалением всё ещё нужны автоматизированные screenshot regression для Telegram viewports/themes.

## P3 — только после отдельного продуктового решения

- Rabbit Hunt, Run It Twice, All-in Cash Out, insurance.
- Re-entry/add-on/bounty/satellites/series beyond configured validated events.
- Chat/emoji/social table layer.
- Play-chip tournaments или любая конвертация PLAY_CHIPS ↔ cash — запрещены текущим каноном.

## Definition of done для любого roadmap-пункта

- контракт и invariant записаны в каноне;
- Postgres и memory/demo paths согласованы, если функция поддерживает оба режима;
- деньги меняются только атомарно через ledger и idempotency;
- poker behavior покрыт deterministic tests;
- API/event backward compatibility проверена;
- loading/error/empty/retry/disabled UI states готовы;
- observability и admin/support path существуют;
- тесты зелёные, ручная device QA зафиксирована;
- rollback и остаточные риски описаны.
