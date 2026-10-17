# Проверяемость раздач — фактический контракт

Сверено с кодом 2026-10-16. Предыдущее описание сохранено в
[архиве](../archive/contracts/FAIRNESS_previous.md): оно ошибочно называло
двухфазный player commit/reveal полностью отсутствующим.

## Что реализовано

`server/poker-engine.js` формирует колоду из `serverSeed`, player seeds, table ID
и hand nonce. `serverSeedHash` — SHA-256; перемешивание детерминировано по proof.
`verifyProvablyFairDeck` проверяет хеши и восстановленную колоду.

Доступны серверные действия:

- `POST /api/tables/:id/fairness-seed` — прямое задание seed между раздачами.
- `POST /api/tables/:id/fairness-commit` — SHA-256 хеш player seed.
- `POST /api/tables/:id/fairness-reveal` — seed, совпадающий с commit; только
  в статусе `starting` после появления `pendingServerSeedHash`.

`prepareStartIntro` создаёт server seed/hash и событие `fairness_server_commit`.
Player commit/reveal также добавляет события. Незавершённый player commit при
старте заменяется серверным fallback; игра не блокируется.
После завершения руки proof позволяет воспроизвести колоду. Скрытые карты
фильтруются serializer для конкретного наблюдателя.

## Границы гарантий

Наличие endpoint и unit-теста не доказывает завершённый независимый fairness-протокол.
`maybeStartHand` открывает intro для первой руки, а последующие может запускать
напрямую через `startHand`. Прямой seed и серверный fallback по-прежнему разрешены.
Следовательно, нельзя обещать обязательный player commit/reveal с опубликованным
server commit перед каждой рукой.

До заявления о полноценной проверяемой честности необходимо:

1. Зафиксировать единый порядок commit/reveal для каждой руки и правила отказа.
2. Проверить клиентский UX и отсутствие раскрытия секретов до нужного момента.
3. Проверить сохранение и проверку proof после перезапуска на PostgreSQL/Redis.
4. Отдельно определить требования к неизменяемому журналу событий и внешней проверке.

Тесты: `tests/poker-engine.test.js`, включая `two-phase fairness validates player
reveal after server commit`. Это проверка конкретного сценария, а не сертификация.
