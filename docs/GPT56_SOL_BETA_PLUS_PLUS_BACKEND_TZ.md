# Weez Poker — GPT 5.6 Sol TZ: beta++ launch hardening

Дата: 2026-07-11  
Статус: рабочее ТЗ для backend/product-grade check-up перед первым real-money user flow.  
Назначение: дополнить `docs/CLAUDE_NEXT_PHASE_TZ.md`, а не переписать его. Этот документ сфокусирован на механике игры, таймингах, админ-управлении, логгировании, финансовых процессах, рейтинговом режиме, турнирах/freerolls и статусах/ачивках.

---

## 0. Как использовать этот документ

1. Сначала прочитать:
   - `MASTER_SPEC.md`
   - `DATABASE.md`
   - `PAYMENTS.md`
   - `docs/13-decisions.md`
   - `docs/TECH_ROADMAP.md`
   - `docs/FAIRNESS.md`
   - `docs/BONUS_WITHDRAWAL.md`
   - `docs/CLAUDE_NEXT_PHASE_TZ.md`
2. Не переписывать зелёные части проекта без доказанной регрессии.
3. Работать по схеме:
   - `implemented ok`
   - `implemented partial`
   - `missing`
   - `wrong / conflicts spec`
4. На каждый gap давать:
   - риск;
   - точку в коде;
   - требуемый фикс;
   - тест.

Это не дизайн-документ. Визуальный слой менять только там, где это необходимо для backend event contract, timing contract или admin operations.

---

## 1. Внешние ориентиры, на которые можно опираться

Только как ориентиры для зрелого поведения рума, не как разрешение спорить с `MASTER_SPEC.md`:

- PokerStars table stakes / poker rules:  
  https://www.pokerstars.com/poker/games/rules/
- PokerStars tournament details / register / play now / late reg UX baseline:  
  https://www.pokerstars.com/help/articles/trn-lobby/
- PokerStars re-entry baseline:  
  https://www.pokerstars.com/help/articles/tourn-reentry-registration/
- PokerStars Seat Me / waiting list baseline:  
  https://www.pokerstars.com/help/articles/seat-me-introduction/
- PokerStars All-in Cash Out reference:  
  https://www.pokerstars.com/poker/all-in-cash-out/
- Poker TDA 2024 rules:  
  https://www.pokertda.com/poker-tda-rules/
- PokerStars Rabbit Hunt release notes — только для будущего product discovery, не launch scope:  
  https://www.pokerstars.com/poker/learn/news/pokerstars-release-notes-monday-4-march-2024/
- GGPoker interruption / cancellation baseline:  
  https://help.ggpoker.com/article/Understanding-Game-Cancellation-Interruption-and-Refund-Policy

Если внешний ориентир конфликтует с локальной спецификацией, побеждает `MASTER_SPEC.md`, а конфликт указывается в отчёте.

---

## 2. Что не надо делать заново

Если текущие тесты зелёные и код соответствует спецификации, не переписывать:

1. `cash` / `rating` bucket separation.
2. `daily_play_claims`.
3. Базовый NL Hold'em core:
   - blinds
   - all-in runout
   - side pots
   - uncalled bet return
   - showdown evaluation
4. Atomic wallet + ledger mutation.
5. SSE / Redis writer lock / state revision layer.
6. Базовый MTT/SNG runtime.
7. Existing payment order model.
8. Existing admin dashboard skeleton.

Задача не “переделать проект”, а “довести до beta++ launch quality”.

### 2.1. Проверенный snapshot на 2026-07-11

Локальный прогон без production env:

```text
env -u DATABASE_URL -u REDIS_URL npm test
97 tests: 88 pass / 0 fail / 9 skipped
```

Подтверждено кодом и тестами: базовый Hold'em core, side pots/odd chip/uncalled return,
cash/rating separation, daily claim 35 000, table-session history, SSE replay/presence,
Redis/PG-required production boot, two-phase fairness, базовые tournaments/reward tickets,
ledger/idempotency patterns, reconciliation, admin/Prometheus skeleton.

Не считать закрытым до отдельной проверки:

1. 9 infra/payment тестов пропущены без изолированных test PostgreSQL/Redis/provider env;
2. `render.yaml` всё ещё задаёт sleeping free web plan при `REAL_MONEY_ENABLED=true`;
3. общего per-IP/per-user rate limiter в runtime нет;
4. Telegram webhook secret и metrics token в production пока могут отсутствовать без fatal boot;
5. нет подтверждённого backup→restore drill и отдельной staging/test среды;
6. analytics покрывает базовые opens/payments/joins/hands, но не полную атрибуцию,
   cohort retention, time-to-first-hand и table-liquidity p50/p95;
7. show/muck event window из §5 реализован: state/deadline, mutation API, persistence boundary, frontend controls и unit-тесты.

Эти пункты имеют приоритет над badges, Rabbit Hunt и другими retention-функциями.

---

## 3. Утверждённые продуктовые решения для этой итерации

### 3.1. Режимы

- `cash` — только `cash_usdt_micros`, полноценный real-money режим.
- `rating` — только `PLAY_CHIPS`, отдельный competitive/free-to-play режим.
- `tournaments` / `freerolls` — обычный event flow на cash-логике.
- Post-season reward tournaments — отдельно, только через tickets.

### 3.2. Запреты и границы

- Нельзя смешивать `PLAY_CHIPS` и `cash_usdt_micros`.
- Нельзя вводить spontaneous play-chip tournaments.
- Private table разрешён только для cash.
- Rabbit Hunt не входит в beta++ и первый публичный запуск. Не создавать для него API,
  ledger mutation, table state, events, admin controls или UI до отдельного продуктового ТЗ.
- `Run It Twice` и `All-in Cash Out` не включать без отдельного решения.

### 3.3. Статусы и ачивки

Система статусов и ачивок утверждается как server-defined metadata layer поверх существующих `achievement_definitions` и `user_achievements`.

Она нужна для:
- памятных статусов;
- сезонных титулов;
- identity/retention;
- admin/manual grants;
- display в профиле, лобби и при необходимости за столом.

Примеры approved типов:
- `beta_tester`
- `season_1_champion`
- `season_1_final_table`
- `first_cash_win`
- `freeroll_winner`
- `founding_player`

Это не gameplay advantage. Только статус/бэйдж/история.

---

## 4. Timing contract — обязательная backend матрица

Все тайминги должны быть server-configurable и приходить на фронт как deadlines/config, а не быть захардкожены в клиенте.

Базовые default значения для beta++:

| Контекст | Default |
|---|---:|
| Start intro перед рукой | `3500 ms` |
| Action timer cash/rating | `20000 ms` |
| Action timer tournament | `20000 ms` |
| Runout card delay | `900 ms` |
| Post-showdown base delay | `5000 ms` |
| Sit-out auto release cash/rating | `300 sec` |
| Rebuy timeout tournament bust seat | `180 sec` |

Нужно проверить и довести:

1. Pre-hand intro действительно синхронизирован между snapshot/SSE/reconnect.
2. Action timer не расходится между сервером и клиентом.
3. После reload таймер поднимается из server deadline.
4. Auto-check / auto-fold всегда соответствуют server legality.
5. Tournament blind clock приходит как серверное время, а не пересчитывается клиентом “от себя”.

---

## 5. Post-hand flow: show / muck

**Статус 2026-07-11:** реализовано. Канонический event — `show_muck_selected`; дополнительно публикуется `show_muck_window_closed`.

### 5.1. Show / muck

Нужно внедрить или довести server-driven post-hand decision window:

1. После обычного showdown проигравшая рука может быть:
   - `show`
   - `muck`
   - `auto-muck` по таймауту
2. All-in runout не использует скрытый muck.
3. Решение show/muck:
   - приходит как отдельное table event / state;
   - имеет deadline;
   - попадает в hand history;
   - попадает в admin/audit log.
4. После закрытия окна раздача только затем переходит к next-hand path.

Что проверить:
- кто имеет право показать руку;
- кто видит скрытую руку;
- как это пишется в `hand_histories`, `hand_actions`, `hand_results`;
- как это переживает reconnect.

### 5.2. Deferred product discovery: Rabbit Hunt

В этой итерации Rabbit Hunt не реализуется. Это не обязательное правило Hold'em:
турнирный стандарт Poker TDA запрещает rabbit hunting, а онлайн-румы внедряют его как
отдельную настраиваемую функцию и отдельно оптимизируют время активации.

Рабочая идея `cash-only / 1 BB` остаётся гипотезой, а не утверждённой экономикой. Перед
возвращением функции в roadmap нужен отдельный документ, который определит:

1. eligibility: какие завершённые post-flop руки допускают reveal;
2. кто может запросить reveal и может ли запрос быть общим для стола;
3. один или несколько платежей разрешены на одну руку;
4. куда учитывается fee и является ли `1 BB` подходящей ценой;
5. длительность offer/reveal без ухудшения hands/hour;
6. неизменность outcome, payout, rake, rating и исходного hand history;
7. использование только остатка уже зафиксированной provably-fair deck;
8. идемпотентность, reconnect, SSE replay, audit и admin visibility;
9. cash public/private policy и полный запрет в tournaments.

До утверждения этого документа Rabbit Hunt отсутствует в runtime и аналитике запуска.

---

## 6. Cash mode — beta++ check-up

### 6.1. Стол и стек

Проверить и довести:

1. strict table stakes;
2. min/max buy-in;
3. buy-in modal validation;
4. top-up только между руками;
5. optional auto top-up до target stack;
6. return stack в wallet по leave / auto-release;
7. hit-and-run risk visibility в admin, even if penalty not enabled.

### 6.2. Игровой цикл

Проверить:

1. player sits as observer if hand active;
2. joins next hand correctly;
3. dead seat cleanup;
4. reconnect / timeout / sit-out / release flow;
5. public table persistence after emptying;
6. private table close behavior.

### 6.3. Rake и fairness

Проверить:

1. no flop no drop;
2. per-pot rake correctness;
3. contributed rake correctness;
4. hand history rake attribution;
5. provably fair commit/reveal consistency;
6. audit trail for disputed hands.

### 6.4. Optional cash-only review

Не включать автоматически, только проверить готовность архитектуры:

1. `Run It Twice`
2. `All-in Cash Out`
3. waiting list / seat-me
4. anti bum-hunting / anti hit-and-run guardrails

Отчёт должен явно разделять:
- `must for beta++`
- `later optional`

---

## 7. Rating mode — beta++ check-up

### 7.1. Core rules

Проверить и довести:

1. `PLAY_CHIPS` полностью изолированы от cash;
2. RP начисляется только в разрешённых сценариях;
3. никакой private table / private rating abuse;
4. никакого rating gain через tournaments;
5. никакого rating gain через test/admin/bot paths.

### 7.2. Anti-abuse rules

Нужно проверить и формализовать:

1. RP только за публичные rating tables;
2. no RP on private / admin / hidden tables;
3. no RP for hands with некорректным составом игроков;
4. leaderboard eligibility:
   - minimum hands
   - minimum active days
5. season lock / reset behavior;
6. audit for suspicious pair farming.

### 7.3. Season-end flow

Нужно довести логику:

1. сезон закрывается детерминированно;
2. standings freeze;
3. выдача reward tickets по местам;
4. grant памятных статусов:
   - `season_x_champion`
   - `season_x_finalist`
   - `season_x_top_n`
5. всё это логируется и может быть просмотрено в админке.

### 7.4. Daily claim и progression

Проверить:

1. claim cooldown;
2. ledger consistency;
3. UI/server sync on cooldown;
4. no duplicate claims;
5. progression/rank display data completeness.

---

## 8. Tournaments and freerolls — beta++ check-up

### 8.1. Ordinary tournaments

Обычные MTT/SNG должны работать как cash-only event flow.

Проверить:

1. create/edit/open/close/cancel/force-start/force-finish;
2. late registration;
3. blind structure;
4. final table transition;
5. move-table rules;
6. payout structure;
7. re-entry/add-on flags exist but default-off;
8. tournament history and result storage;
9. player bust tracking;
10. telegram/admin notifications on important transitions.

### 8.2. Freerolls

Freerolls для beta++ трактовать как cash-event flow с нулевым buy-in.

Проверить:

1. source of prize pool;
2. no mixing with play balance;
3. payout in `cash_usdt_micros`;
4. admin controls;
5. audit/reporting.

### 8.3. Reward tournaments by tickets

Не смешивать с обычным tournament feed.

Нужно проверить:

1. ticket issuance;
2. ticket consumption;
3. eligible player list;
4. season tie to ticket;
5. separate reward event history;
6. admin visibility and manual corrections.

### 8.4. Tournament disconnect policy

Проверить отдельно от cash/rating:

1. seat не освобождается;
2. blinds/antes продолжают списываться;
3. auto-fold/check на ходе;
4. bust-out only by normal tournament rules;
5. reconnect returns to current tournament state.

---

## 9. Achievements / statuses / badges

### 9.1. Что нужно

Использовать уже существующую achievement infrastructure и довести её до product-grade состояния:

1. catalogue of badge/status definitions;
2. automatic grants;
3. manual admin grants;
4. immutable audit of who granted what and why;
5. profile-facing payload;
6. optional table/lobby badge exposure.

### 9.2. Какие типы покрыть в beta++

Обязательные группы:

1. memorial / historical:
   - `beta_tester`
   - `founding_player`
2. season:
   - `season_1_champion`
   - `season_1_final_table`
   - `season_1_top_10`
3. gameplay:
   - `first_cash_win`
   - `first_tournament_win`
   - `freeroll_winner`
4. operational:
   - `kyc_verified`
   - `manual_review_cleared` only if needed internally

### 9.3. Ограничения

- Бэйджи не дают финансового преимущества.
- Бэйджи не смешиваются с wallet/bonus math.
- Badge grant/revoke проходит через audit/admin layer.

---

## 10. Admin panel and operations hardening

### 10.1. Что должно стать удобным

Нужно довести админку до состояния реальной операционной панели, а не debug view.

Обязательные блоки:

1. live tables:
   - active tables
   - table state
   - seated players
   - timers
   - table session id
2. tournaments:
   - definitions
   - status
   - participants
   - current level
   - force actions
3. finance:
   - deposits
   - withdrawals
   - pending/manual review
   - payout statuses
   - fee/rake/reconciliation summaries
4. rating:
   - season state
   - leaderboard snapshot
   - ticket issuance
   - suspicious RP gain
5. achievements/statuses:
   - definitions
   - grants
   - revokes
6. gameplay incidents:
   - reconnects
   - auto-fold/auto-check
   - stuck tables
   - busted seats

### 10.2. Audit requirements

Каждое существенное админ-действие должно логироваться:

1. actor
2. target
3. action
4. before
5. after
6. request id / idempotency key
7. reason/comment
8. created at

### 10.3. Logging quality

Нужно сделать так, чтобы по одной спорной раздаче/турниру/выплате можно было быстро собрать:

1. wallet movement
2. table movement
3. hand history
4. action history
5. fairness proof
6. admin interventions
7. notifications sent

---

## 11. Financial operations hardening

### 11.1. Deposits

Проверить и довести:

1. paid-only credit;
2. duplicate webhook dedupe;
3. underpay/manual review path;
4. expiry path;
5. order visibility per user;
6. consistent payout to wallet ledger.

### 11.2. Withdrawals

Проверить и довести:

1. hold / approve / reject / paid lifecycle;
2. risk/KYC flags in admin queue;
3. ручная beta-выплата: transaction id/hash, actor, paid-at, SLA и audit; automated worker — позже;
4. idempotent retry path;
5. status notification path;
6. dispute/reversal path.
7. публичный quote: единые `2% + network fee`, без hidden spread;
8. default `rakeThresholdPercent=0`; deposit→withdraw abuse уходит в manual review/risk,
   а не в обязательный 25% playthrough для всех игроков.

### 11.3. Reconciliation

Проверить и довести:

1. hourly drift checks;
2. alert thresholds;
3. snapshots for trend view;
4. tournament escrow inclusion;
5. saved stack inclusion;
6. payment/withdrawal fee reserves inclusion.

---

## 12. Event contract for frontend animation and UX

Backend обязан иметь стабильный event contract, чтобы фронт не угадывал анимации по diff snapshot.

Для beta++ проверить и довести events:

1. `hand_start`
2. `blind_posted`
3. `ante_posted`
4. `hole_cards_dealt`
5. `action_prompt`
6. `check`
7. `call`
8. `bet`
9. `raise`
10. `fold`
11. `street_reveal`
12. `all_in_runout_start`
13. `runout_card_revealed`
14. `showdown_reveal`
15. `show_muck_window_open`
16. `show_muck_selected`
17. `pot_push`
18. `odd_chip_award`
19. `seat_sit_out`
20. `seat_return`
21. `seat_released`
22. `seat_busted`
23. `tournament_level_up`
24. `tournament_table_move`
25. `final_table_started`
26. `payout_complete`

Для каждого события:

1. schema
2. ordering guarantee
3. replay behavior
4. reconnect behavior
5. idempotent delivery expectation

---

## 13. Launch gates, analytics and evidence contract

Цель beta++ — не просто получить зелёный unit suite, а безопасно пригласить первую
контролируемую группу пользователей и собрать данные, которым можно доверять.

### 13.1. Go / no-go для real-money beta

Cash нельзя открывать пользователям, пока не выполнены все пункты:

1. **Always-on runtime:** production web instance не засыпает и не scale-to-zero. Один
   процесс допустим на старте, но бесплатный sleeping instance — нет.
2. **Изолированная проверочная среда:** есть отдельные test PostgreSQL/Redis, на которых
   запускаются все infra-gated и failure-injection тесты без production-данных.
3. **Деньги:** пройден малый end-to-end smoke `deposit paid → wallet → buy-in → hand →
   leave/auto-release → withdrawal hold → reject/refund и approve/paid`; после каждого
   сценария reconciliation drift равен нулю.
4. **Восстановление:** проверены restart during hand, Redis reconnect, commit-timeout retry
   и восстановление PostgreSQL из backup в отдельную среду.
5. **Fail-closed security:** обязательны Telegram webhook secret, admin secret, metrics
   token и подписи включённых payment webhooks; production не стартует при их отсутствии.
6. **Rate limiting:** per-IP и per-user лимиты защищают auth, payment creation, table writes,
   withdrawals и admin login; ответ при превышении — `429` без частичной mutation.
7. **Управляемый риск:** есть независимые feature flags / emergency stop для новых
   депозитов, новых cash buy-in, tournament registration и withdrawals без остановки
   read-only доступа к истории и возврату средств.
8. **Операции:** админ видит активные столы, спорную руку, ledger/fund movement,
   pending payments/withdrawals и reconciliation; существует проверенный incident runbook.
9. **Юридический gate:** до публичного real-money трафика отдельно подтверждены допустимая
   юрисдикция, 18+, geofence/KYC/AML/sanctions policy, privacy/retention, responsible gaming
   и тексты условий. Техническая готовность не заменяет юридическое разрешение.

Если хотя бы один пункт не выполнен, допускается только закрытый rating-only тест или
технический cash smoke администратора; публичный real-money набор не начинается.

### 13.2. Событийный контракт аналитики

Не дублировать уже существующие `analytics_events`; провести audit и дополнить gaps.

Обязательные идентификаторы каждого релевантного события:

- `event_id` и server timestamp;
- `app_user_id`;
- auth/product `session_id`;
- при игре: `table_id`, `table_session_id`, `hand_id`, `game_mode`;
- при деньгах: `payment_order_id` / `withdrawal_order_id`, `ledger_entry_id`, asset и micros;
- acquisition: immutable first-touch `source/campaign/creative/start_param` и отдельный last-touch.

Сервер является источником истины для денег, join, hand start/complete, rake, payout,
withdrawal status и disconnect outcomes. Клиент пишет только UI-intent/visibility события;
клиентский callback никогда не подтверждает деньги или завершение руки. Hole cards,
seed values, адреса кошельков и Telegram initData в продуктовую аналитику не попадают.

Минимальный funnel:

```text
app_open
first_lobby_loaded
daily_claim_clicked
daily_claim_success
rating_table_joined
first_hand_started
first_hand_completed
cashier_open
deposit_order_created
deposit_paid
cash_table_joined
cash_hand_completed
withdrawal_requested
withdrawal_cancelled
withdrawal_approved
withdrawal_paid
```

Также обязательны quality events: `sse_reconnect`, `action_timeout`, `disconnect_auto_fold`,
`seat_auto_released`, `hand_aborted`, `table_recovered`, `payment_webhook_failed` и
`reconciliation_alert`.

### 13.3. Канонические KPI и формулы

| Метрика | Формула |
|---|---|
| Trial activation | users with `first_hand_completed` / unique first-time `app_open` users |
| Rating activation | users with `rating_table_joined` / unique first-time `app_open` users |
| FTD conversion | first-time depositors / unique acquired users |
| Cash activation | users with `cash_hand_completed` / first-time depositors |
| D1 / D7 / D30 retention | activated cohort returning on exact cohort day / activated cohort |
| Empty-lobby loss | users leaving before first hand after seeing no playable opponent / lobby viewers |
| Time to first hand | `first_hand_started_at - first_lobby_loaded_at` p50/p95 |
| Table fill time | second eligible seat time − first eligible seat time, p50/p95 |
| Hands/hour | completed non-aborted hands / active table-hours |
| Cash GGR | cash rake + tournament fees; deposits and pot turnover are not revenue |
| Net poker contribution | GGR − rakeback − converted bonuses − affiliate payouts − processor/network costs − refunds/chargebacks |
| Rake per cash active | cash rake / users with at least one completed cash hand |
| Withdrawal SLA | request→paid duration p50/p95 + share outside published SLA |
| Reconciliation incident rate | non-zero drift checks / all scheduled drift checks |
| CAC by source | attributable acquisition spend / activated users or FTDs from that source |

LTV не экстраполировать из первых дней. До зрелых cohorts показывать observed cumulative
net contribution per payer вместе с размером cohort и возрастом наблюдения.

### 13.4. Data-quality acceptance

Перед первым приглашением пользователей:

1. 100% cash wallet mutations связаны с ledger entry и idempotency key.
2. 100% completed hands имеют `table_session_id`, `hand_id`, mode и итоговый rake/result.
3. Все payment/withdrawal terminal statuses имеют order id и audit trail.
4. Funnel и liquidity dashboards строятся за `1d / 7d / 30d`, retention — cohort-based.
5. Метрики разделяют `rating`, `cash`, `tournament`, test/admin/bot traffic исключается.
6. Raw event можно проследить до агрегата без ручной коррекции данных.
7. Денежный drift перед стартом и после каждого pilot-дня равен нулю.

### 13.5. Evidence pack для масштабирования/инвестора

Каждый отчёт содержит период, размер cohort и абсолютные значения, а не только проценты:

1. users by source → activation → D1/D7/D30;
2. table liquidity по часу суток и время до первой руки;
3. FTD, cash activation, deposits, withdrawals и withdrawal SLA;
4. hands, active table-hours, hands/hour, rake и net poker contribution;
5. bugs/incidents, abort/reconnect rates и финансовый drift;
6. acquisition spend, CAC и observed contribution by source;
7. список продуктовых изменений в периоде, чтобы не смешивать разные cohorts.

Первые выводы по D7 делаются не раньше 14 дней наблюдения, по D30 — после созревания
35-дневного окна. До этого данные маркируются как ранний сигнал, а не доказанный LTV.

---

## 14. Tests and report

### 14.1. Обязательные тестовые категории

1. cash disconnect / sit-out / auto-release
2. tournament disconnect / blind-out / bust
3. show/muck timeout path
4. rating anti-abuse invariants
5. season-end ticket issuance
6. achievement/status grants
7. admin tournament control actions
8. analytics attribution/funnel dedupe and mode separation
9. production fail-closed config and rate limiting
10. finance lifecycle:
   - deposit paid
   - withdrawal reject/approve
   - reconciliation

### 14.2. Что нужно выдать по итогам работы

1. Отчёт по пунктам:
   - `ok`
   - `partial`
   - `missing`
   - `changed`
2. Список миграций.
3. Список новых admin endpoints/actions.
4. Список новых event types.
5. Список changed env/config defaults.
6. Список intentional non-goals.

---

## 15. Что не включать без отдельного решения

1. spontaneous play-chip tournaments
2. play/cash conversion
3. hidden direct wallet mutations
4. auto-enable `Run It Twice`
5. auto-enable `All-in Cash Out`
6. Rabbit Hunt в любом режиме
7. social/chat/emoji layer как обязательную часть beta++
8. bounty/knockout/event gimmicks без отдельного approval

---

## 16. Короткая формула задачи для исполнителя

Нужно не изобрести новый покерный рум, а довести уже реализованный Weez до целостного beta++ launch состояния:

- механика руки и стола предсказуема;
- тайминги и post-hand окна полны;
- rating режим защищён от abuse;
- cash и tournaments готовы к реальным деньгам;
- admin panel позволяет реально управлять продуктом;
- финансы, статусы, аудит и логи не выглядят сырыми;
- всё подтверждено кодом, тестами и server contracts.
