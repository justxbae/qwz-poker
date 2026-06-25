# Backend gameplay check-up — 2026-06-21

Источники правил: `MASTER_SPEC.md`, `docs/13-decisions.md`, `docs/TECH_ROADMAP.md`.

## Реализовано и проверено

- Cash: strict table stakes, 20–100 BB limits, HU button/SB logic, blinds, side pots, odd chips clockwise from button, uncalled-bet return, no-flop-no-drop, all-in runout, auto-check/fold, sit-out/in, between-hands top-up, hand history and fairness proof.
- Rating: отдельный `PLAY_CHIPS` bucket, daily claim, rating/season/leaderboard hooks; private и tournament hands не меняют rating; cash withdrawal/insurance механик для play нет.
- Tournaments: cash-only MTT/SNG, idempotent registration/cancel, separate buy-in/fee accounting, scheduler, wall-clock late registration, blind/ante clock, seating/balancing, final table, atomic PostgreSQL payout, admin CRUD/actions.
- Freeroll: cash-event с нулевым buy-in и `guaranteedPrizePool`; гарантия учитывается в payout и platform ledger.
- Reward flow: post-season event и ticket issuance отделены от cash lobby; ticket не является балансом или валютой.
- Audit: table snapshots, persisted hand history, revealed fairness proof, ledger/fund movements and reconciliation buckets.

## Исправлено в этом quality pass

- Tournament table stack выделен в `TOURNAMENT_CHIPS`; tournament hands больше не начисляют rating points и не считаются PLAY_CHIPS hands.
- Top-up теперь не может поднять стек выше `maxBuyIn`.
- Rake/club/wagering attribution считается по contributed rake, а не делится поровну; uncalled excess исключается.
- Обычный проигравший showdown автоматически mucked; all-in runout раскрывает все участвующие руки.
- Турнирный bust больше не предлагает cash/play rebuy.
- Guaranteed freeroll prize pool участвует в payout; добавлен источник гарантии в platform ledger.
- В snapshot API добавлен упорядоченный event timeline с `id`, `sequence`, `type`, `at`, `handNumber`, `payload`.
- Реализованы события: `hand_start`, `blind_posted`, `ante_posted`, `hole_cards_dealt`, `action_prompt`, `check`, `call`, `bet`, `raise`, `fold`, `street_reveal`, `all_in_runout_start`, `runout_card_revealed`, `showdown_reveal`, `pot_push`, `odd_chip_award`, `seat_sit_out`, `seat_return`, `seat_busted`, `tournament_level_up`, `tournament_table_move`, `final_table_started`, `payout_complete`.

## Real-money hardening выполнен

1. Redis lock на table mutation и отдельный scheduler lock обеспечивают single-writer между процессами; перед mutation процесс читает последнюю Redis revision.
2. Cash/play buy-in, rebuy и возврат wallet выполняются одной PostgreSQL-транзакцией вместе с ledger, fund movement и durable table snapshot. Redis обновляется только после commit.
3. Добавлен `GET /api/tables/:id/events`: SSE, event replay и resume через `Last-Event-ID`; frontend использует stream с polling fallback.
4. Добавлены `POST /api/tables/:id/presence`, heartbeat, `connected`, `reconnectDeadline` и отдельное 30-second reconnect window.
5. Добавлен opt-in `tests/infrastructure-integration.test.js`: PostgreSQL/Redis lock, atomic wallet+snapshot, restart recovery, unknown commit retry, tournament guarantee payout и payout idempotency.
6. Fairness использует player commit → server commit → player reveal; неверный reveal отклоняется, нераскрытый commit получает server fallback.
7. Добавлены Telegram notifications: start-soon, started/table assigned, late-reg closing, table move, bust и payout.

Live infrastructure suite запускается только с отдельной тестовой PostgreSQL/Redis средой:
`RUN_INFRA_INTEGRATION_TESTS=true DATABASE_URL=... REDIS_URL=... npm test`.

## Gaps, которые не нужно включать без отдельного решения

- Re-entry, add-on и отдельный tournament time bank: поля существуют, но runtime намеренно не активирован.
- Полный public redeem/runtime для post-season tickets — отдельная итерация после утверждения reward event format.
- Auto top-up, waiting list/seat-me и anti hit-and-run policy.
- Rabbit Hunt, Run It Twice, All-in Cash Out, table chat и emoji.
- Spontaneous PLAY_CHIPS tournaments и любой обмен PLAY_CHIPS ↔ USDT запрещены.

## Проверка

`env -u DATABASE_URL -u REDIS_URL npm test` — 86 passed, 0 failed, 2 infrastructure tests skipped without test PostgreSQL/Redis URLs.
