# Weez Poker — единое enterprise-ТЗ развития продукта

**Версия:** 1.0  
**Дата:** 2026-07-19  
**Статус:** рабочий управляющий документ программы развития  
**Назначение:** превратить текущий Telegram Mini App poker-room в управляемый, проверяемый и масштабируемый real-money продукт, способный обслуживать тысячи пользователей без потери денег, игровых состояний и доверия.

---

## 0. Как пользоваться этим документом

Это не замена продуктового канона и не разрешение самостоятельно менять экономику.

При конфликте источников действует порядок:

1. `MASTER_SPEC.md` — продукт, единицы, режимы и экономика.
2. `docs/13-decisions.md` — более новые утверждённые решения с датой.
3. Этот документ — программа работ, критерии готовности и операционная модель.
4. `DATABASE.md`, `PAYMENTS.md`, `docs/FAIRNESS.md`, `docs/DESIGN_SYSTEM.md` — профильные контракты.
5. `docs/GPT56_SOL_BETA_PLUS_PLUS_BACKEND_TZ.md`, `docs/CLAUDE_NEXT_PHASE_TZ.md`, `docs/TECH_ROADMAP.md` — подробный накопленный контекст и история задач.

Любая задача выполняется по схеме:

1. Проверить, нет ли уже готовой реализации.
2. Зафиксировать исходное поведение тестом или воспроизводимым сценарием.
3. Сопоставить изменение с каноном и решениями.
4. Реализовать обе ветки, если код поддерживает PostgreSQL и memory/demo.
5. Добавить серверную защиту, а не только ограничение интерфейса.
6. Проверить денежные, конкурентные и reconnect-сценарии.
7. Обновить документацию и журнал решений.
8. Передать короткий отчёт: что было, что изменено, чем проверено, какие риски остались.

Запрещено закрывать задачу фразой «визуально похоже», «должно работать» или одним happy-path тестом.

---

## 1. Цель продукта

Weez Poker — Telegram-native poker room с тремя строго разделёнными контурами:

- `Cash`: реальные USDT, table stakes, rake, депозит и вывод.
- `Rating`: бесплатные `PLAY_CHIPS`, рейтинговые очки, сезоны и leaderboard; никакого вывода и смешивания с cash.
- `Tournaments`: cash-only MTT/SNG/freeroll event flow и отдельные ticket-based post-season reward events.

Цель первой стадии — не максимальное число функций. Цель — короткий вход, понятная бесплатная проба, безошибочная базовая игра и управляемый real-money цикл.

Цель зрелой стадии — тот же продукт при росте до тысяч одновременных пользователей:

- одна рука и одно денежное действие имеют один проверяемый результат;
- рестарт, повтор запроса и потеря сети не создают деньги и не теряют их;
- правила одинаковы для клиента, сервера, админки и истории;
- служба поддержки может восстановить картину любого спора;
- оператор видит ликвидность, риск, платежи и техническое здоровье;
- бренд, интерфейс и коммуникации выглядят как единая система.

---

## 2. Неприкосновенные инварианты

### 2.1. Деньги и единицы

1. Cash-баланс — это USDT, хранимые целым числом микросов: `1 USDT = 1_000_000 micros`.
2. Cash UI показывает доллары/USDT напрямую. Запрещено возвращать старую конвертацию «USDT → chips».
3. `PLAY_CHIPS` — отдельная игровая единица и отдельный ledger bucket.
4. `cash_usdt_micros`, bonus и play никогда не смешиваются в формуле, API, UI или payout.
5. Stars — способ оплаты, а не баланс.
6. Ticket — право входа в event, не валюта и не переводимый баланс.
7. Любое изменение кошелька выполняется в транзакции с ledger-записью.
8. Любая денежная мутация идемпотентна.
9. Баланс кошелька, ledger и table stack должны сходиться без ручной арифметики.
10. Ни один UI-флаг не является единственной защитой денег.

### 2.2. Игровая честность

1. Сервер является единственным автором игрового состояния.
2. Клиент не выбирает карты, победителя, размер банка, право хода или допустимые действия.
3. Каждая рука имеет неизменяемый `hand_id`, порядковый номер, fairness proof и историю событий.
4. Другие hole cards скрыты до разрешённого раскрытия.
5. Активная рука в админке также не раскрывает скрытые карты без формально утверждённого forensic-flow.
6. Повторный запрос не может повторно списать ставку, buy-in, fee или payout.
7. Все правила side pots, uncalled bet, all-in, odd chip и showdown проверяются автоматическими тестами.

### 2.3. Product boundaries

Без отдельного решения запрещено включать:

- Rabbit Hunt;
- Run It Twice;
- All-in Cash Out / insurance;
- bounty, rebuy/add-on и satellite economy;
- spontaneous play-chip tournaments;
- play-chip private games, влияющие на рейтинг;
- table chat/emoji;
- денежные rewards за достижения;
- скрытые комиссии, спреды или wagering-ограничения.

---

## 3. Уровни зрелости и ворота выпуска

### L0 — локальная разработка

- memory mode разрешён;
- реальные деньги запрещены;
- dev controls видимы только разработчику;
- допускаются мок-провайдеры.

### L1 — контролируемая beta

- бот открыт всем; ограничивается только размер активно сопровождаемой когорты и объём продвижения;
- небольшие лимиты и ручные выплаты;
- PostgreSQL и Redis обязательны;
- оператор присутствует во время теста;
- все платежи и выводы сверяются ежедневно;
- готов rollback и способ остановить деньги/столы.

### L2 — real-money pilot

- утверждена юрисдикция и юридическая модель;
- production-инфраструктура always-on;
- пройдены PG/Redis/provider integration tests;
- резервное копирование проверено восстановлением;
- есть support, risk и payment runbooks;
- закрыты P0/P1 этого документа.

### L3 — публичный запуск

- измеряются activation, FTD, retention, liquidity, payment success и incidents;
- имеются responsible-gaming и dispute flows;
- проведены security review и нагрузочный тест;
- нет известных P0/P1 дефектов;
- маркетинг не превышает способность поддержки и ликвидности.

### L4 — масштабирование до тысяч одновременных пользователей

- game runtime не зависит от одного процесса;
- стол имеет single-writer ownership и fencing token;
- realtime и события масштабируются горизонтально;
- есть warehouse/BI, fraud case management, дежурства и SLO;
- миграции, rollback и disaster recovery регулярно репетируются.

Переход между уровнями оформляется письменным go/no-go, а не только успешным deploy.

---

## 4. Текущее состояние на дату документа

### 4.1. Уже реализовано и должно сохраняться

- Telegram initData HMAC authentication.
- PostgreSQL wallet/ledger и memory fallback для demo.
- Redis sessions/table snapshots и single-writer/revision hardening.
- NL Hold'em engine: blinds, betting streets, side pots, all-in runout, showdown.
- strict cash/play bucket separation.
- cash table stakes, buy-in и возврат stack.
- contributed rake accounting и no-flop-no-drop.
- SSE table events с resume semantics.
- presence/reconnect и cash sit-out/release flow.
- provably-fair commit/reveal foundation.
- session-scoped hand history contract.
- show/muck server-driven window.
- daily refill `35 000 PLAY_CHIPS / 24h` только при play balance `<= 34 999`.
- cash-only tournament foundation, admin creation и payouts.
- deposits, withdrawal request lifecycle и admin review foundation.
- admin live table view с аудитом просмотра.
- first-touch / last non-direct-touch attribution.
- achievements/status metadata foundation без денежного преимущества.
- базовые пользовательские документы.

### 4.2. Проверенный локальный baseline

Команда без локальных production URL:

```bash
env -u DATABASE_URL -u REDIS_URL npm test
```

На дату документа: `105 tests`, `96 pass`, `0 fail`, `9 skipped`.

Skipped-сценарии относятся к реальной инфраструктуре и провайдерам. Они не отменены, а перенесены в обязательный gate перед L2/L3:

- PostgreSQL/Redis atomicity, restart и commit-timeout;
- tournament guarantee payout;
- crypto/Stars provider confirmation;
- admin payment lifecycle;
- withdrawals with real persistence;
- withdrawal/risk policy integration.

### 4.3. Известный документальный долг

- В старом разделе roadmap оставалась формулировка daily claim без balance threshold. Канон от 2026-07-15 требует `<= 34 999`.
- Несколько документов описывают разные поколения UI и экономики. Новая работа обязана ссылаться на дату решения.
- Текущий rake в коде: `5%`, cap `3 BB`, no-flop-no-drop. Более сложная rake ladder не считается включённой, пока не утверждена и не реализована единым источником правды.
- Реальный public launch запрещено объявлять готовым только по memory-тестам.

---

## 5. Внешние стандарты и границы их применения

### 5.1. Правила покера

- Poker TDA 2024 Rules: <https://www.pokertda.com/view-poker-tda-rules/>
- Poker TDA Procedures: <https://www.pokertda.com/poker-tda-rules/>

TDA используется для tournament procedures, showdown, all-in, odd chips, seating и balancing. TDA не задаёт все online cash timers и house rules. Для каждого такого параметра Weez обязан иметь собственное опубликованное house rule, а не выдавать предположение за универсальный стандарт.

### 5.2. Gambling platform maturity baseline

- UK Gambling Commission RTS: <https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/remote-gambling-and-software-technical-standards>
- GLI-19 Interactive Gaming Systems: <https://gaminglabs.com/wp-content/uploads/2020/07/GLI-19-Interactive-Gaming-Systems-v3.0.pdf>
- Customer funds guidance: <https://www.gamblingcommission.gov.uk/guidance/customer-funds-segregation-disclosure-to-customers-and-reporting/advice-on-implementing-licence-condition-4-1-1-segregation-of-customer-funds>
- Customer interaction / responsible gambling: <https://www.gamblingcommission.gov.uk/guidance/customer-interaction-guidance-for-remote-gambling-licensees-formal-guidance/introduction-customer-interaction-guidance-for-remote-gambling-licensees-sr>

Это инженерный ориентир зрелости, а не юридическое заключение. Реальные лицензионные обязанности определяются выбранной юрисдикцией и юристом.

### 5.3. Security и platform integration

- OWASP ASVS 5.0: <https://owasp.org/www-project-application-security-verification-standard/>
- Telegram Mini Apps: <https://core.telegram.org/bots/webapps>
- NIST Incident Response: <https://csrc.nist.gov/projects/incident-response>
- NIST Contingency Planning: <https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final>
- FATF VA/VASP guidance: <https://www.fatf-gafi.org/content/dam/fatf/documents/recommendations/Updated-Guidance-VA-VASP.pdf>
- PCI DSS: <https://www.pcisecuritystandards.org/document_library/>

PCI применим только при попадании карточных данных в контур Weez. Предпочтение — hosted/provider flow, при котором Weez не хранит card data.

---

## 6. Целевая архитектура

### 6.1. Принцип

До подтверждённой нагрузки сохранять modular monolith, но разделить обязанности внутри кода. Не вводить микросервисы ради названия.

Логические контуры:

1. Identity & Access.
2. Wallet, Ledger & Treasury.
3. Payments & Withdrawals.
4. Cash Table Runtime.
5. Tournament Runtime.
6. Rating & Seasons.
7. Risk, Integrity & Responsible Play.
8. Admin & Support.
9. Analytics & Attribution.
10. Content, Configuration & Feature Flags.

### 6.2. Источники истины

- PostgreSQL: деньги, ledger, user identity, registrations, results, immutable histories, config versions, audits.
- Redis: sessions, presence, short locks, table ownership, hot snapshots, event replay window, rate limits.
- Object storage: exports, long-term audit bundles, backups, evidence attachments.
- Analytics store/warehouse: производные отчёты, не источник кошелька.

### 6.3. Game runtime при масштабе

Для каждого стола:

- один активный writer;
- ownership lease в Redis;
- fencing token/revision в каждой mutation;
- sequence number для каждого события;
- snapshot после каждой значимой mutation;
- event outbox после commit;
- replay с последнего подтверждённого event id;
- запрет двум процессам одновременно завершать одну руку.

Mutation pipeline:

1. Проверить auth, table membership и idempotency key.
2. Получить ownership/fencing permission.
3. Загрузить ожидаемую revision.
4. Выполнить deterministic engine transition.
5. В одной PostgreSQL transaction записать wallet/ledger/table snapshot/hand state/outbox.
6. Commit.
7. Опубликовать событие из outbox.
8. Ответить клиенту тем же result при повторе ключа.

### 6.4. Когда выделять сервисы

Выделение допускается при измеримом триггере:

- game runtime упирается в CPU/event loop;
- payment/risk jobs мешают latency игровых mutations;
- deployment monolith требует останавливать активные игры;
- ownership одной команды/контура стало самостоятельным;
- нужен отдельный compliance boundary.

Первый кандидат — game runtime, затем payments/risk jobs, затем analytics ingestion.

---

## 7. Общий контракт API и событий

### 7.1. Ответ API

Каждый endpoint возвращает:

- `requestId`;
- стабильный machine-readable `code` для ошибок;
- локализуемое message только для UI;
- `serverTime` для таймеров;
- актуальную revision ресурса, если есть concurrency;
- для денежных действий — operation/order id и финальный/промежуточный status.

### 7.2. Идемпотентность

Обязательна для:

- join/leave/rebuy/top-up;
- tournament register/cancel;
- invoice create;
- provider webhook;
- withdrawal create/cancel/approve/reject/paid;
- admin wallet adjustment;
- daily claim;
- payouts/refunds;
- bonus grant/convert/expire;
- ticket issue/redeem.

Повтор того же ключа и тела возвращает тот же результат. Тот же ключ с другим телом — `409 idempotency_conflict`.

### 7.3. Event envelope

Минимальные поля:

```json
{
  "eventId": "uuid",
  "eventType": "hand_start",
  "schemaVersion": 1,
  "aggregateType": "table",
  "aggregateId": "table_id",
  "sequence": 123,
  "occurredAt": "ISO-8601",
  "serverTime": "ISO-8601",
  "actorAppUserId": null,
  "correlationId": "request-or-hand-id",
  "causationId": "previous-event-or-request-id",
  "payload": {}
}
```

Требования:

- sequence монотонный в пределах aggregate;
- событие неизменяемо;
- PII не попадает в общий event без необходимости;
- schema version меняется при несовместимом payload;
- frontend игнорирует неизвестное событие без падения;
- деньги и audit имеют отдельную retention policy.

---

## 8. Игровой движок Cash и Rating

### 8.1. Поддерживаемая игра первого запуска

- No-Limit Texas Hold'em.
- 2–6 активных игроков; UI и seating для 6-max.
- Cash и Rating используют один poker engine, но разные currency/economy adapters.
- Rating не содержит deposit, withdrawal, rake в USDT или cash rewards.

### 8.2. Позиции, button и blinds

Обязательно проверить таблицей сценариев:

- 2-handed: button = small blind; button действует первым preflop и последним postflop.
- 3–6 handed: SB/BB слева от button; first-to-act preflop слева от BB, postflop слева от button.
- button перемещается по утверждённой house rule и не пропускает право обязательных ставок.
- joining player не получает нечестную бесплатную позицию.
- missed blind policy явно опубликована и одинаково реализована сервером/UI.

### 8.3. Допустимые действия

Для каждого action prompt сервер отдаёт:

- `canFold`, `canCheck`, `canCall`, `canBet`, `canRaise`;
- `callAmount`;
- `minBet`, `minRaiseTo`, `maxRaiseTo`;
- deadline и time bank;
- reason, если действие недоступно.

Проверить:

- minimum opening bet = big blind;
- полный raise переоткрывает действие;
- short all-in не переоткрывает action игроку, уже действовавшему, если не достиг полного raise;
- сумма call ограничивается стеком;
- check недоступен facing bet;
- raise недоступен без достаточного стека;
- fold разрешён, но UI не должен подталкивать fold при бесплатном check.

### 8.4. Table stakes

- в игре участвует только stack, внесённый до руки;
- деньги за столом исключены из available cash wallet;
- top-up/rebuy зачисляется только между руками;
- pending top-up не меняет текущий pot eligibility;
- leave во время руки переводится в безопасный fold/settlement flow, а не мгновенно вынимает деньги из банка;
- после завершения обязательств остаток возвращается в cash wallet одним ledger flow.

### 8.5. Pots и settlement

Автоматическими сценариями покрыть:

- one winner;
- split pot 2/3/4-way;
- multiple side pots;
- folded contribution остаётся в pot;
- uncalled excess возвращается до showdown;
- all-in на каждой улице;
- игрок выигрывает main, проигрывает side;
- tie внутри отдельного side pot;
- odd chip выдаётся по утверждённому правилу слева от button;
- сумма payouts + rake + uncalled return = сумма contributions;
- ни одна выплата не превышает eligibility игрока.

### 8.6. Showdown, show/muck и privacy

- победитель показывается автоматически;
- при all-in runout все не-folded руки раскрываются;
- проигравшему доступно 3-секундное server-driven show/muck окно только в разрешённом сценарии;
- timeout = auto-muck;
- folded cards никогда не раскрываются другим игрокам;
- участник руки может видеть разрешённые showdown cards в session history;
- spectator получает только публично раскрытые карты;
- следующая рука не стартует до закрытия post-hand state.

### 8.7. Тайминги

Таймеры должны быть server-authoritative и конфигурируемыми по table template.

Обязательный контракт:

- `actionStartedAt`;
- `actionDeadlineAt`;
- `timeBankRemainingMs`;
- `serverTime`;
- `postHandEndsAt`;
- `nextHandStartsAt`.

Конкретные значения до публичного запуска утверждаются в одном config-файле и пользовательских правилах. Нельзя копировать случайные значения конкурента. Требуются минимум профили `standard cash`, `rating`, `tournament`; turbo/fast не включать без продукта.

### 8.8. Disconnect и session lifecycle

Cash:

1. Закрытие Mini App не удаляет игрока мгновенно.
2. До его хода стол продолжает игру без публичной метки reconnect.
3. На его ходе работает обычный timer.
4. Timeout выполняет legal auto-check, если check доступен, иначе auto-fold.
5. Затем seat становится sit-out на 300 секунд.
6. Sit-out не получает новые hole cards и не постит новые blinds.
7. Возврат до deadline восстанавливает seat.
8. После 300 секунд seat освобождается, stack возвращается через ledger.
9. Когда table occupancy становится 0, cash session закрывается.

Tournament:

- disconnect не освобождает seat;
- blinds/antes продолжают уменьшать tournament stack;
- legal timeout action применяется на каждом ходе;
- игрок может blind out и bust без подключения.

Обязательные тесты: закрыть до хода, закрыть на ходе, reconnect до/после timeout, restart в каждом состоянии, два отключившихся игрока, leave во время all-in.

### 8.9. Rake

Текущий baseline:

- percentage: 5%;
- cap: 3 BB;
- no flop no drop;
- contributed rake attribution.

Перед L2 утвердить rake matrix по stakes и heads-up. До утверждения нельзя одновременно показывать одну таблицу условий и считать по другой.

Weighted Contributed должен означать: каждому игроку атрибутируется доля фактически взятого rake пропорционально его contribution в raked pot. Формула, округление и cap фиксируются тестами.

### 8.10. Fairness

- CSPRNG server seed;
- server commit до раскрытия seed;
- player commits фиксируются до server reveal;
- отсутствие player reveal обрабатывается детерминированным fallback без возможности выбрать выгодный seed после commit;
- Fisher-Yates без modulo bias;
- proof сохраняется в hand history;
- verify endpoint/tool воспроизводит deck;
- seed и скрытая deck не попадают в logs до завершения руки;
- rotation и entropy health мониторятся.

### 8.11. Hand history и replay

История пользователя по умолчанию относится к текущей table session:

- session начинается, когда минимум два игрока seated и запущена первая рука;
- session заканчивается, когда occupancy становится 0;
- hand history имеет session id;
- UI не смешивает старые сессии без явного перехода в архив;
- запись содержит positions, stacks, actions, board, pots, rake, payouts, permitted cards и fairness proof;
- replay строится из событий, а не из произвольного текста log;
- экспорт имеет стабильный формат и privacy filtering.

### 8.12. Game cancellation и recovery

Определить правила для:

- crash до deal;
- crash после blinds, до hole cards;
- crash после действий;
- невозможность восстановить deck/state;
- corrupted revision;
- duplicate settlement attempt.

Если рука может быть детерминированно восстановлена — продолжить. Если нет — выполнить утверждённый refund contributions и записать `hand_voided` с причиной. Молчаливое удаление руки запрещено.

---

## 9. Rating mode

### 9.1. Экономика

- только `PLAY_CHIPS`;
- daily refill: `35 000` раз в 24 часа при текущем balance `<= 34 999`;
- повторный claim защищён wallet lock + idempotency;
- cash и bonus не меняются;
- free play не даёт cash tournament entry.

### 9.2. RP v1

Текущий канон:

- старт сезона: `1000 RP`;
- минимум: `0 RP`;
- cap изменения за руку: `±25 RP`;
- heads-up multiplier: `0.5`;
- private tables: `0 RP`;
- tournament hands: `0 RP`;
- минимум 2 активных игрока;
- pot threshold: минимум `2 BB`;
- leaderboard eligibility: `100 hands` и `5 active days`.

Формула RP обязана быть опубликована в правилах в понятной форме, а точный server formula version — сохранён в каждой rating mutation.

### 9.3. Anti-abuse v2 — обязательно до денежных сезонных rewards

- daily positive RP cap;
- diminishing RP against same opponent pair;
- minimum distinct opponents;
- suspicious reciprocal wins;
- chip dumping patterns;
- short-hand collusion clusters;
- device/IP/account linkage signals;
- synchronized sessions;
- newly funded account rings;
- risk score и reason codes;
- RP freeze, review, release/reversal;
- appeals и audit trail.

Автоматический risk flag не должен без review конфисковывать cash.

### 9.4. Seasons

- immutable season config/version;
- startsAt/endsAt/timezone;
- snapshot leaderboard at close;
- late events after close не меняют финал без controlled recompute;
- status `open → closing → finalized → rewarded`;
- reward tickets issue idempotently;
- admin reopen только с reason, two-person approval и audit.

### 9.5. UX

- Rating — начальный режим нового пользователя;
- рядом с рейтингом доступна короткая инструкция: что такое RP, что влияет, что не влияет, anti-abuse disclaimer;
- balance и RP визуально различаются;
- daily bonus не анимирует RP;
- при large values используется адаптивная типографика без обрезки;
- private game ведёт в cash-only flow и прямо обозначает деньги.

---

## 10. Tournaments, SNG и freerolls

### 10.1. Разделение

- обычные MTT/SNG — cash-only;
- freeroll — отдельный cash-event flow без play-chip buy-in;
- post-season reward event — ticket-only;
- ticket не продаётся как balance и не выводится;
- rating/play chips не являются buy-in.

### 10.2. State machine

```text
created
→ registration_open
→ late_registration (optional)
→ running
→ final_table
→ finished

created/registration_open → cancelled
```

Каждый переход имеет allowed actors, preconditions, timestamp, idempotency key и audit event.

### 10.3. Registration

- buy-in и fee списываются раздельными ledger entries;
- registration уникальна для user/event/entry number;
- cancel доступен только по правилам event;
- refund возвращает buy-in/fee по утверждённой policy;
- concurrent last-seat registration разрешает ровно одного пользователя;
- SNG auto-start при заполнении;
- scheduled MTT стартует по startsAt при minPlayers;
- при недоборе выполняется cancel/refund или утверждённый delayed start.

### 10.4. Runtime

- random seating с audit seed;
- table balancing минимизирует лишние moves;
- moving player не получает/теряет blinds произвольно;
- broken table order deterministic;
- final table transition единственный;
- blind level clock server-authoritative и не зависит от количества сыгранных рук;
- disconnect player blind-out;
- late registration stack/level policy опубликована;
- synchronized break поддерживается config, если включён.

### 10.5. Payout

- payout structure валидируется до открытия регистрации;
- сумма процентов = 100%;
- rounding/odd remainder имеет deterministic rule;
- prize pool = buy-ins + explicit guarantee funding, fee не попадает в prize pool;
- guarantee overlay имеет отдельный funding ledger;
- payout идемпотентен;
- finished невозможен до успешной фиксации results/payout или recovery marker;
- профиль обновляется из результатов, не из frontend counters.

### 10.6. Admin actions

- create/edit draft;
- open/close registration;
- cancel with preview refunds;
- force-start with reason;
- force-finish только через controlled settlement preview;
- view registrations, seating, blind clock, payout grid, notifications и audit;
- опасные действия требуют confirmation phrase и роли.

---

## 11. Wallet, ledger и accounting

### 11.1. Ledger contract

Каждая запись имеет:

- operation id;
- app_user_id;
- bucket/asset;
- signed amount micros;
- category;
- external/reference id;
- idempotency key;
- balance before/after;
- occurredAt/createdAt;
- actor/system;
- correlation id;
- metadata schema version.

### 11.2. Категории

Минимум:

- deposit pending/confirmed/refunded;
- withdrawal hold/release/paid/fee;
- cash table buy-in/leave/top-up;
- rake;
- tournament buy-in/fee/refund/payout/guarantee;
- daily play claim;
- bonus grant/convert/expire;
- admin adjustment;
- reconciliation correction — только controlled, не скрытая правка.

### 11.3. Reconciliation

Проверки:

- wallet balance = ledger net by bucket;
- table stacks + available wallet + holds = user funds model;
- confirmed provider payments = deposit ledger;
- paid withdrawals = hold + fee + external tx;
- tournament escrow = registrations - refunds - payouts;
- Stars paid total = authoritative Telegram confirmations;
- play bucket отдельно.

Любой ненулевой drift создаёт incident, а не только Telegram message.

### 11.4. Customer funds и treasury

До L2 утвердить:

- где хранятся player liabilities;
- reserve policy;
- hot wallet limits;
- cold storage process;
- кто может подписывать выплату;
- daily treasury reconciliation;
- emergency withdrawal freeze;
- insolvency/customer funds disclosure;
- proof/evidence retention.

---

## 12. Deposits

### 12.1. Provider state machine

```text
created → invoice_issued → pending → confirmed
                               ↘ expired
                               ↘ failed
confirmed → refunded (controlled)
```

- frontend success не кредитует баланс;
- только authoritative provider callback/polling;
- signature и timestamp проверяются;
- duplicate callback возвращает success без второго credit;
- amount/asset/order/user сверяются;
- callback после expiry обрабатывается отдельной policy;
- provider outage не превращает pending в failed без причины.

### 12.2. Telegram Stars

- pre_checkout validation;
- successful_payment idempotency by Telegram charge id;
- rate source version хранится в order;
- refund связывается с исходным платежом;
- webhook health fail-closed;
- пользователь видит pending/confirmed/failed, а не ложный «баланс пополнен».

### 12.3. Crypto rails

- network и asset обязательны;
- адрес/contract не выводится из свободного текста пользователя для deposit;
- underpayment/overpayment policy;
- required confirmations;
- tx hash uniqueness;
- chain reorg handling;
- provider/webhook retry;
- manual match с two-person review;
- адреса и memo/tag валидируются.

---

## 13. Withdrawals

### 13.1. Beta policy

- manual review;
- публичная комиссия `2% + network fee`;
- скрытый spread запрещён;
- обязательный 25% rake gate по умолчанию отключён;
- suspicious deposit→withdraw идёт в risk review;
- бонусные средства не выводятся;
- minimum/maximum и SLA опубликованы.

### 13.2. State machine

```text
draft → requested → held → reviewing → approved → paying → paid
                     ↘ rejected → released
requested/held → cancelled → released
paying → payout_unknown → reconciled_to_paid | reconciled_to_released
```

Запрещено автоматически release после commit timeout, пока неизвестно, ушла ли внешняя выплата.

### 13.3. Validation

- method selected;
- network selected;
- address checksum/format;
- memo/tag where required;
- min/max;
- enough withdrawable balance;
- destination allow/deny list;
- recent account/security changes;
- risk score;
- duplicate destination/pattern;
- cancellation запрещена после external payout start.

### 13.4. Admin review

Оператор видит:

- user profile и account age;
- deposits/withdrawals;
- available/held/bonus/table funds;
- gameplay/rake summary;
- linked accounts/risk signals;
- destination history;
- fee/net amount;
- evidence и notes.

Для high-risk/high-value — four-eyes approval. Paid требует external tx id/hash.

---

## 14. Bonuses, loyalty, statuses и achievements

### 14.1. Bonus accounting

- отдельный bonus grant;
- grant amount, remaining, wagering target, contributed rake progress, expiry;
- bonus не withdrawable;
- conversion в cash только server-side;
- expired amount списывается idempotently;
- promo budget и liability видны оператору.

### 14.2. Cash Club

Перед включением:

- утвердить points per rake;
- срок статуса;
- rakeback funding;
- cap и payout schedule;
- refund/reversal effect;
- abuse controls;
- отображение без обещаний несуществующей выгоды.

### 14.3. Achievements/statuses

- косметические и informational;
- не влияют на cards, rating formula или деньги;
- server-defined immutable id;
- versioned eligibility;
- idempotent grant/revoke;
- audit actor/reason;
- selected status только из earned;
- скрытие статуса пользователем;
- seasonal statuses архивируются, не переписываются.

До beta достаточно архитектуры, каталога и нескольких проверяемых achievements. Не строить сложную meta-game раньше стабильной игры.

---

## 15. Identity, authentication и account security

### 15.1. Telegram auth

- initData валидируется сервером;
- auth_date имеет максимальный возраст;
- replay контролируется;
- provider user id не принимается из body как доверенный;
- session rotation при auth;
- logout/revoke;
- bot token rotation runbook.

### 15.2. Sessions

- Redis TTL;
- refresh policy;
- device/session list;
- revoke all;
- risk event на смену критических данных;
- admin session отдельна от player session;
- secure cookie/header strategy и CORS allowlist.

### 15.3. Account recovery

- Telegram account ownership является главным фактором;
- ручное восстановление не должно позволять support забрать аккаунт по username;
- payout destination changes имеют cooling period/risk review;
- все recovery/admin actions аудируются.

---

## 16. Game integrity и anti-fraud

### 16.1. Сигналы

- multi-account graph;
- device/IP/network clustering;
- impossible/coordinated timing;
- chip dumping;
- collusion rings;
- soft play;
- account sharing;
- bot-like action timing;
- real-time assistance indicators;
- promo/referral abuse;
- payment laundering patterns;
- chargeback/refund abuse.

### 16.2. Case management

Risk case содержит:

- immutable case id;
- signal reasons и confidence;
- linked users/tables/hands/payments;
- evidence snapshot;
- assigned reviewer;
- actions/timestamps;
- user communication;
- appeal;
- final disposition.

### 16.3. Возможные меры

По возрастающей:

- enhanced monitoring;
- RP freeze;
- promo/affiliate hold;
- withdrawal manual review;
- table restriction;
- temporary account restriction;
- closure/confiscation только по юридически утверждённой policy.

Cash нельзя конфисковывать одной непрозрачной model score.

---

## 17. Responsible gaming, legal и privacy

До реальных пользователей определить:

- целевые и запрещённые юрисдикции;
- возраст `18+` и verification policy;
- KYC triggers;
- AML/source-of-funds triggers;
- sanctions screening;
- geolocation/geofence;
- self-exclusion;
- cooling-off;
- deposit/loss/time limits;
- reality checks и session duration alerts;
- responsible gaming contacts;
- complaint/dispute procedure;
- retention/deletion/export персональных данных;
- lawful basis/consent для маркетинга;
- customer funds disclosure;
- правила блокировки и возврата остатка.

Юридические тексты не должны обещать больше, чем реально делает код. Любое изменение fee, KYC, withdrawal SLA или bonus rules обновляет UI и документы одновременно.

---

## 18. Admin и backoffice

### 18.1. Роли

Минимум:

- `support_read`;
- `support_write`;
- `payments_operator`;
- `payments_approver`;
- `risk_analyst`;
- `tournament_operator`;
- `content_manager`;
- `finance_auditor`;
- `superadmin`.

Запрещён общий admin password для команды.

### 18.2. Player 360

- identity и status;
- sessions/devices;
- wallet buckets/holds/table funds;
- ledger timeline;
- deposits/withdrawals;
- gameplay/tournaments/rating;
- bonuses/tickets/achievements;
- risk links/cases;
- support contacts;
- responsible gaming restrictions;
- audit of every admin view/change.

### 18.3. Live table operations

- active tables и occupancy;
- current public state, positions, stacks, pot, deadline;
- connection/sit-out state;
- server event timeline;
- session hand history;
- table wallet movements and ledger references;
- game node/owner/revision;
- stale snapshot/lag indicator;
- cards скрыты до разрешённого reveal;
- force actions не добавлять без отдельной policy.

### 18.4. Payment operations

- deposit order queue;
- unmatched/late provider events;
- withdrawal review and four-eyes;
- refund flow;
- reconciliation dashboard;
- provider health;
- export for finance;
- all actions with actor/reason/evidence.

### 18.5. Tournament operations

- calendar;
- templates/config versions;
- registrations/refunds;
- seating/tables;
- level clock;
- payouts/overlay;
- notifications;
- controlled cancel/force start/finish.

---

## 19. Support operations

### 19.1. Каналы

- Telegram support handle;
- in-app FAQ/docs;
- incident banner/status message;
- escalation to payments/risk/game integrity.

### 19.2. Ticket model

- ticket id;
- user and category;
- priority;
- affected hand/order/withdrawal/table;
- attachments;
- owner;
- SLA;
- internal notes vs user-visible messages;
- resolution and compensation reference.

### 19.3. Приоритеты

- P0: возможная потеря/создание денег, массовая недоступность, unfair game.
- P1: застрявший вывод/депозит, неверный settlement, account takeover.
- P2: одиночный UX/function defect.
- P3: question/content request.

Компенсация выполняется только через admin adjustment с reason и audit, не прямым SQL.

---

## 20. Frontend, UX и design system

### 20.1. Общие требования

- SF Pro / system fallback по зафиксированным tokens;
- Telegram theme params, safe areas и viewport APIs;
- mobile-first;
- dark theme без жёсткого чёрного фона;
- один набор radii/colors/row heights;
- SVG из `figma/` и утверждённых assets, не самодельные аналоги;
- touch target не менее platform guideline;
- никакого horizontal overflow;
- текст не обрезает денежные значения;
- loading, empty, disabled, error, success и offline states для каждого flow.

### 20.2. Navigation

- Home, Tournaments, Profile, Menu;
- активный овал перемещается плавно после успешного выбора;
- Menu sheet не меняет текущий route;
- закрытие возвращает indicator на фактическую вкладку;
- background не scroll одновременно со sheet;
- drag cancel отменяет press;
- Telegram native BackButton имеет корректное действие по контексту.

### 20.3. Lobby

- Rating открывается первым;
- Cash и Rating switch без fade/рывка;
- daily bonus доступен только в Rating;
- claim animation изменяет только PLAY balance;
- cash balance, rating, avatar выровнены и адаптивны;
- cash controls отсутствуют в Rating;
- channel/support links актуальны;
- private game ведёт на отдельный cash-only screen;
- blind selection выбирает один limit, а не накапливает фильтры.

### 20.4. Cashier

- deposit/withdrawal — одинаковый sheet shell;
- фон и cards используют утверждённые tokens;
- keyboard не двигает lobby и не создаёт jump;
- tap outside/Done закрывает keyboard без изменения scroll position;
- submit не перекрывает content;
- amount parsing locale-safe;
- `$` и decimals отображаются единообразно;
- payment method selection заметна, icon box и text state синхронны;
- ошибки видны рядом с причиной;
- withdrawal fee/net preview понятны;
- address validation происходит до hold.

### 20.5. Poker table

- seats строго на границе felt, но не выходят за viewport;
- community cards достаточно крупные и не вытянуты;
- pot/stakes/info не конкурируют с картами;
- action buttons не закрывают hole cards;
- текущий actor, timer и bet читаемы;
- left menu и right info panel симметричны и скрыты по умолчанию;
- панели не создают лишние слои;
- press/drag/cancel повторяют grouped-list pattern;
- hand end — короткая pot push/winner sequence без гигантского чёрного поля;
- combination label компактно над action area;
- session history показывает руки, не internal logs.

### 20.6. Accessibility и performance

- prefers-reduced-motion;
- contrast audit;
- dynamic text не ломает layout;
- screen reader labels для icon-only controls;
- keyboard focus для desktop;
- animation transform/opacity, не layout thrashing;
- target 60 fps на поддерживаемых iPhone/Android;
- image assets имеют размеры и lazy-loading вне critical view.

### 20.7. Visual QA

Для каждого изменённого экрана:

1. Проверить в sandbox на целевом mobile viewport.
2. Проверить реальный Telegram iOS и Android.
3. Проверить светлую/тёмную/кастомную theme params.
4. Проверить keyboard open/close.
5. Проверить long values и русский текст.
6. Сохранить before/after screenshot.
7. Не пушить заведомо перекошенное состояние.

---

## 21. Brand system Weez

### 21.1. Brand architecture

Зафиксировать:

- master brand: `Weez`;
- product: `Weez Poker`;
- bot, channel, support, admin naming;
- tone of voice;
- descriptor/tagline;
- legal entity/brand owner;
- домены, Telegram handles, social handles;
- правила co-branding с affiliates.

### 21.2. Asset package

- primary wordmark;
- compact mark/avatar;
- monochrome/inverse versions;
- minimum size/clear space;
- dark/light/custom theme variants;
- app icon, bot avatar, channel avatar;
- social templates;
- tournament/season lockups;
- favicon/open graph;
- source SVG + export manifest.

### 21.3. Migration from QWZ

- code/search inventory `QWZ`, old handles и old URLs;
- UI strings;
- Telegram bot name/description/menu;
- provider invoice descriptions;
- support templates;
- legal docs;
- emails/notifications;
- admin;
- analytics source names;
- SEO/social assets;
- database historical labels не переписывать без необходимости;
- redirect/announcement plan.

Definition of Done: пользователь нигде не видит случайное смешение QWZ/Weez.

---

## 22. Referral и affiliate operations

### 22.1. Attribution

- first touch immutable;
- last non-direct touch;
- signed/unguessable partner token;
- self-referral block;
- attribution window;
- conflict rule;
- manual re-attribution только с audit;
- device/account graph.

### 22.2. Qualification

Referral не становится qualified только по регистрации. Конфигурируемые критерии:

- unique verified account;
- first deposit confirmed;
- minimum cash activity/rake;
- active days;
- no linked/self/chargeback/fraud flag.

Точные числа утверждаются экономической моделью и не хардкодятся в UI.

### 22.3. RevShare

- база — утверждённый net revenue, не deposit amount;
- Weighted Contributed attribution;
- fee/refund/bonus/rakeback deductions определены;
- negative carryover policy;
- hold period;
- payout minimum;
- reversal/chargeback;
- statement per period;
- dispute SLA;
- partner status and contract version.

### 22.4. Partner backoffice

- links/campaigns;
- clicks/opens/registrations/FTD/qualified players;
- active players;
- attributed rake/NGR;
- pending/approved/paid commission;
- fraud/rejected count with reason category;
- export;
- no access to player PII beyond policy.

---

## 23. Marketing, content и CRM

### 23.1. Growth principle

Маркетинг запускается волнами, соответствующими ликвидности. Привести 500 регистраций в пустой room хуже, чем 30 игроков в согласованные окна.

### 23.2. Acquisition tracking

Каждая campaign имеет:

- source;
- campaign;
- creative;
- placement;
- owner;
- spend;
- start/end;
- target audience;
- legal/brand approval;
- deep link;
- expected KPI;
- stop condition.

### 23.3. Telegram channel

Контентные блоки:

- расписание liquidity windows/tournaments;
- product updates;
- education/how to play;
- transparent rules/economy;
- winner stories только с consent;
- responsible play;
- incident/status communications;
- community polls без обещаний прибыли.

### 23.4. CRM lifecycle

- welcome/onboarding;
- first rating hand;
- daily refill reminder без spam;
- first cash deposit education;
- tournament start/table move/payout;
- interrupted cashier flow;
- dormant user;
- responsible gaming suppression;
- self-excluded users не получают promos.

### 23.5. Advertising safety

- не таргетировать несовершеннолетних;
- не обещать заработок/гарантированную прибыль;
- показывать 18+ и applicable restrictions;
- affiliate creatives проходят approval;
- influencer disclosure;
- offline QR также атрибутирован;
- complaints/opt-out отслеживаются.

---

## 24. Analytics и data platform

### 24.1. Event taxonomy

Минимум:

- app_open/auth_success;
- lobby_mode_view;
- daily_claim_view/click/success/reject;
- table_view/join/start_hand/action/leave/session_end;
- cashier_open/method_select/invoice_create/provider_confirm;
- withdrawal_start/validation_error/request/cancel/approve/paid;
- tournament_view/register/start/bust/finish/payout;
- referral_touch/qualified;
- support_contact;
- responsible_play_action;
- error/incident exposure.

Analytics event не заменяет audit/ledger.

### 24.2. Канонические KPI

- DAU/WAU/MAU;
- new authenticated users;
- activation: first completed rating hand;
- FTD;
- D1/D7/D30 retention;
- cash active users;
- hands/user/day;
- concurrent players;
- seated occupancy;
- tables with 2+ players;
- wait time to first opponent/hand;
- hands per table hour;
- rake and contributed rake;
- GGR/NGR по утверждённой формуле;
- deposit success/time;
- withdrawal success/SLA;
- payment reconciliation drift;
- tournament entries/overlay/payout;
- rating eligible users;
- support volume/SLA;
- fraud loss/prevented amount;
- CAC, qualified CAC, FTD CAC, LTV;
- affiliate payable margin.

### 24.3. Liquidity dashboard

По 15/30-минутным интервалам:

- online authenticated;
- lobby viewers;
- seated;
- active hands;
- occupancy by stake/mode;
- empty tables;
- joins without hand start;
- median time to game;
- exits before first hand;
- regional/timezone distribution.

### 24.4. Data quality

- canonical metric dictionary;
- event schema registry;
- duplicate/event gap monitoring;
- source freshness;
- identity merge rules;
- timezone policy;
- backfill/recompute audit;
- finance metrics reconcile to ledger;
- dashboards display data timestamp.

---

## 25. Observability и SRE

### 25.1. SLI/SLO proposals — требуют утверждения

Предлагаемые цели после L2:

- money mutation correctness: 100%, duplicate credits/debits = 0;
- reconciliation drift: 0;
- hand settlement invariant failures: 0;
- public API availability: 99.9% pilot, 99.95% scale;
- gameplay mutation p95: <250 ms в целевом регионе без client network;
- realtime event delivery p95 after commit: <500 ms;
- crash-free client sessions: >=99.5% pilot;
- RPO wallet/ledger: 0 committed transactions;
- RTO pilot: <=60 min; scale: <=15 min.

Это цели программы, не обещание пользователю до нагрузочных и recovery-тестов.

### 25.2. Dashboards

- API latency/error by route;
- event loop lag/CPU/memory;
- Postgres pool/locks/slow queries/replication;
- Redis latency/memory/evictions/leases;
- SSE connections/reconnect/gaps;
- active tables/hands/timers;
- payment webhook lag/failures;
- withdrawal queue age;
- reconciliation;
- provider/bot health;
- deploy version and error rate.

### 25.3. Alerting

P0:

- non-zero money drift;
- duplicate settlement/credit;
- widespread table ownership conflict;
- wallet database unavailable;
- security compromise.

P1:

- payment webhook unhealthy;
- withdrawal backlog over SLA;
- Redis/Postgres degradation;
- elevated action errors;
- tournament payout failure.

Telegram notification — один канал доставки, не система инцидентов. Нужны acknowledgement, owner и timeline.

### 25.4. Incident management

- severity;
- incident commander;
- communications owner;
- mitigation/rollback;
- evidence preservation;
- user impact estimate;
- resolution;
- blameless postmortem;
- corrective actions with owners/deadlines.

---

## 26. Backup, disaster recovery и business continuity

- automated encrypted PostgreSQL backups;
- point-in-time recovery;
- Redis не единственная копия денег;
- configuration/secrets backup;
- object storage retention;
- restore test в отдельной среде;
- documented RPO/RTO;
- game node loss drill;
- region/provider outage plan;
- Telegram outage behavior;
- payment provider outage behavior;
- withdrawal freeze switch;
- incident contact tree;
- quarterly recovery rehearsal после L3.

Backup без успешного restore test не считается рабочим.

---

## 27. Security engineering

### 27.1. Application

- ASVS-based checklist;
- strict input schemas;
- output escaping/CSP;
- no secrets in frontend/logs;
- rate limits per user/IP/action;
- abuse-resistant idempotency storage;
- SSRF protection for provider URLs;
- webhook allow/signature validation;
- dependency audit;
- admin CSRF/session protection;
- least privilege DB roles;
- security headers;
- error responses without internals.

### 27.2. Infrastructure

- separate prod credentials;
- secrets manager/rotation;
- no committed tokens;
- network restrictions;
- encrypted transit/storage;
- audit log shipping;
- access review;
- break-glass account;
- deploy provenance;
- vulnerability patch SLA.

### 27.3. Testing

- threat model per money flow;
- auth/session abuse tests;
- IDOR tests;
- concurrency/idempotency attacks;
- webhook forgery/replay;
- admin privilege escalation;
- XSS in username/content/support notes;
- rate-limit bypass;
- pentest before L3.

---

## 28. SDLC, environments и release management

### 28.1. Environments

- local/demo;
- integration with disposable PG/Redis;
- staging with provider sandboxes;
- production.

`main` не должен оставаться единственной безопасной площадкой проверки перед ростом.

### 28.2. CI gates

- unit tests;
- deterministic poker scenarios;
- schema/migration checks;
- frontend smoke;
- security/dependency check;
- forbidden secret scan;
- docs/canon consistency checks where possible;
- integration tests on scheduled/release pipeline.

### 28.3. Migrations

- backward-compatible expand/contract;
- no destructive migration in same deploy as code dependence;
- dry-run/backup;
- lock duration estimate;
- rollback/roll-forward plan;
- migration audit.

### 28.4. Release

- release owner;
- changelog;
- risk class;
- feature flags;
- health verification;
- smoke paths;
- monitoring window;
- rollback trigger;
- active tournament/table compatibility;
- user/support communication if needed.

---

## 29. QA strategy

### 29.1. Engine tests

- example-based poker rules;
- property tests: conservation of chips/money, no negative stack, one actor, legal deck uniqueness;
- random deterministic simulations of millions of hands offline;
- replay same seed = same result;
- differential validation against a trusted evaluator for hand ranking.

### 29.2. Persistence/concurrency

- two simultaneous joins for one seat;
- two actions same revision;
- duplicate payout;
- retry after server commit but before response;
- Redis loss during hand;
- process restart each street;
- Postgres timeout/deadlock;
- outbox publish retry;
- stale writer fencing.

### 29.3. Payments

- provider success/duplicate/out-of-order/invalid signature;
- timeout after provider success;
- under/overpayment;
- withdrawal cancel race;
- payout_unknown reconciliation;
- admin four-eyes;
- wallet/ledger drift always zero.

### 29.4. Client E2E

- Telegram iOS/Android/Desktop;
- supported viewport and safe areas;
- slow network/offline/reconnect;
- keyboard and sheets;
- long names/large balances;
- multiple theme params;
- route/back/swipe;
- event replay after app resume;
- table actions and post-hand animation.

### 29.5. Performance

- 100/500/1000 concurrent SSE clients;
- table action burst at street transition;
- scheduler/tournament burst;
- payment webhook burst;
- 24h soak;
- memory/session leak;
- Redis/Postgres saturation and graceful degradation.

---

## 30. Операционная модель команды

Даже при маленькой команде роли должны быть обозначены:

- Product owner: правила, экономика, priorities, go/no-go.
- Engineering owner: architecture, code quality, releases.
- Game integrity owner: disputes, collusion, rules.
- Payment/finance owner: treasury, payouts, reconciliation.
- Support owner: tickets, user communication.
- Risk/compliance owner: KYC/AML/RG/geofence.
- Growth/content owner: acquisition, channel, CRM.
- Incident commander: назначается на событие.

Один человек может совмещать роли, но действие и approval для критических денег не должны совпадать при возможности.

Ежедневно на beta:

- health/payment/reconciliation review;
- withdrawal queue;
- active incidents;
- liquidity windows;
- support backlog;
- deployment changes.

Еженедельно:

- KPI/liquidity/retention;
- risk cases;
- affiliate quality;
- treasury/liabilities;
- bugs and release plan;
- responsible gaming review;
- content calendar.

---

## 31. Приоритетная программа работ

### P0 — запрещает real-money public launch

1. Выбрать юрисдикцию, legal/compliance model и player-funds policy.
2. Развернуть always-on production PG/Redis и staging/integration environment.
3. Пройти все 9 инфраструктурно gated tests.
4. Проверить backup restore и documented RPO/RTO.
5. Provider E2E для каждого реально включённого deposit/withdrawal rail.
6. Закрыть wallet/ledger/table atomicity и commit-timeout recovery доказательствами.
7. Проверить single-writer fencing под конкурентной нагрузкой.
8. Утвердить и опубликовать cash house rules/timings/rake matrix.
9. Пройти engine invariant/property simulation.
10. Закрыть withdrawal payout_unknown и four-eyes flow.
11. Настроить incident alerting/runbooks.
12. Security review Telegram auth, admin, payments и IDOR.
13. Device QA всех money/table flows.
14. Исключить stale QWZ branding и неверные документы.

### P1 — контролируемая beta с измеримыми результатами

1. Rating anti-abuse v2 и review UI.
2. Session hand history/replay device QA.
3. Liquidity dashboard.
4. Support ticket model/player 360.
5. Withdrawal SLA/status notifications.
6. Tournament failure/recovery drills.
7. Brand asset package и content operations.
8. Affiliate qualification/statement foundation.
9. Responsible gaming controls минимум self-exclusion/cooling-off/limits по legal model.
10. Metric dictionary и data-quality dashboard.

### P2 — публичный рост

1. Advanced fraud/collusion graph.
2. Automated provider payouts после достаточной статистики.
3. Cash Club economics.
4. Season rewards/tickets automation.
5. CRM lifecycle campaigns.
6. Multi-language/localization.
7. Regional capacity and failover.
8. Formal pentest/certification where required.

### P3 — только после отдельного product discovery

- Rabbit Hunt;
- Run It Twice;
- All-in Cash Out;
- bounty/re-entry/add-on;
- multi-table client;
- waiting list/seat-me;
- chat/social layer;
- complex missions with cash value;
- native apps.

---

## 32. Work packages для последовательной разработки

### EPIC-01 — Canon Consistency

**Результат:** один актуальный набор правил без противоречий.  
**Работы:** inventory, stale statements, decision links, generated config tables.  
**Приёмка:** daily refill, withdrawals, rake, rating и optional features одинаково описаны в UI/API/docs.

### EPIC-02 — Poker Rules Certification

**Результат:** engine rule matrix и test suite.  
**Работы:** positions, raises, side pots, showdown, odd chips, reconnect, void hand.  
**Приёмка:** conservation properties, deterministic replays, review by poker-rules owner.

### EPIC-03 — Table Runtime Resilience

**Результат:** стол переживает process/Redis/network failures без double writer.  
**Приёмка:** failure injection, revision fencing, outbox replay, zero fund drift.

### EPIC-04 — Money Safety

**Результат:** полный deposit/table/tournament/withdrawal lifecycle.  
**Приёмка:** every operation ledgered/idempotent; reconciliation zero; unknown payout recoverable.

### EPIC-05 — Tournament Operations

**Результат:** scheduled and SNG events без ручного исправления денег.  
**Приёмка:** concurrency, restart, cancellation, overlay и payout tests.

### EPIC-06 — Rating Integrity

**Результат:** понятная RP система и anti-abuse v2.  
**Приёмка:** versioned formula, eligibility, freeze/review, no private cash exploit.

### EPIC-07 — Player Experience

**Результат:** Telegram-native app без визуальных/keyboard/reconnect дефектов.  
**Приёмка:** device matrix, visual evidence, no P0/P1 UX defects.

### EPIC-08 — Admin and Support

**Результат:** оператор расследует hand/payment/user case без SQL.  
**Приёмка:** RBAC, player 360, live table, audit, ticket escalation.

### EPIC-09 — Risk and Compliance

**Результат:** legal/RG/KYC/AML/geofence policies выражены в продукте.  
**Приёмка:** approved policy, tested restrictions, audit/export.

### EPIC-10 — Data and Growth

**Результат:** источник → игрок → FTD → active → revenue измеряется без ручной догадки.  
**Приёмка:** metric dictionary, attribution, costs, cohort/liquidity dashboards.

### EPIC-11 — Brand and Media

**Результат:** единый Weez на всех surfaces.  
**Приёмка:** asset kit, naming inventory, no stale links, content/creative approval flow.

### EPIC-12 — SRE and Release

**Результат:** контролируемые deploy, rollback, alerts, backup/restore.  
**Приёмка:** staging release drill, incident drill, recovery evidence, signed go/no-go.

---

## 33. Definition of Done для любой задачи

Задача завершена только если:

- есть ссылка на канон/решение;
- scope и non-goals зафиксированы;
- обе server storage ветки учтены или demo path сознательно удалён;
- server validates all critical conditions;
- idempotency/concurrency обработаны;
- money/ledger impact описан;
- event/API contract обновлён;
- tests прошли на релевантном уровне;
- UI проверен в Telegram, если изменён frontend;
- analytics/audit добавлены, если flow операционный;
- docs/env/runbook обновлены;
- rollback понятен;
- не осталось скрытого feature flag или dev-only поведения в production;
- отчёт перечисляет остаточные риски честно.

---

## 34. Формат отчёта разработчика/агента

1. **Итог:** что теперь умеет продукт.
2. **Исходная проблема:** конкретный дефект/риск.
3. **Изменённые файлы.**
4. **Контракт:** API/events/data/config.
5. **Money/game invariants:** что доказано.
6. **Тесты:** команды и результаты.
7. **Device/visual QA:** где проверено.
8. **Migration/env/deploy:** что требуется оператору.
9. **Остаточные gaps:** что не сделано.
10. **Следующий безопасный шаг.**

Нельзя писать «готово к real money», если не пройдены соответствующие release gates.

---

## 35. Реестр ключевых рисков

| Риск | Вероятность до hardening | Ущерб | Обязательная мера |
|---|---:|---:|---|
| Double settlement/credit | Средняя | Критический | Idempotency, DB locks, fencing, integration tests |
| Потеря hand state при restart | Средняя | Высокий | Atomic snapshot, recovery drill, outbox |
| Redis split-brain writer | Средняя при scale | Критический | Lease + fencing token + revision |
| Provider callback spoof/replay | Средняя | Критический | Signature, freshness, unique external id |
| Withdrawal to invalid destination | Средняя | Высокий | Network-aware validation + confirmation/review |
| Collusion/chip dumping | Высокая | Высокий | Integrity signals, case review, graph |
| Rating farming | Высокая | Средний/высокий | Pair caps, diversity, freeze/review |
| Empty-room churn | Высокая | Высокий | Liquidity windows, stake concentration, dashboard |
| Legal/geofence mismatch | Неизвестна | Критический | Jurisdiction decision and counsel |
| Customer funds shortfall | Неизвестна | Критический | Segregation/reserve/treasury policy |
| Admin account compromise | Средняя | Критический | MFA/session controls/RBAC/four-eyes |
| Silent reconciliation drift | Средняя | Критический | Scheduled checks, alerts, incident ownership |
| UX hides fee/rule | Средняя | Высокий | Transparent preview, doc consistency, QA |
| Brand fragmentation | Высокая сейчас | Средний | Weez migration inventory and asset governance |
| Unmeasurable acquisition | Средняя | Высокий | Attribution + spend + cohort metrics |

---

## 36. Решения, которые обязан принять владелец до L2/L3

1. Целевые и запрещённые юрисдикции.
2. Лицензионная/операторская модель.
3. KYC/AML vendor и triggers.
4. Player funds custody/segregation/reserve.
5. Production hosting region/provider и бюджет.
6. Список реально включённых payment rails.
7. Withdrawal SLA, limits и high-risk threshold.
8. Cash rake matrix по stakes/HU.
9. Action timer/time bank profiles.
10. Missed blind/join policy для cash.
11. Tournament cancellation/late-reg/overlay policies.
12. Rating season duration/rewards и anti-abuse thresholds.
13. Referral/affiliate qualification и economics.
14. Responsible gaming limits/self-exclusion flow.
15. Support hours и incident contact chain.
16. Brand master assets и официальные handles.
17. SLO/RPO/RTO targets.
18. Data retention/privacy policy.

До решения спорный параметр остаётся feature-flagged/deferred, а не выбирается разработчиком по вкусу.

---

## 37. Ближайший практический порядок

1. Закрыть противоречия канона и сформировать release checklist L1/L2.
2. Провести полный engine rules/invariants pass без добавления optional функций.
3. Завершить device QA table history, show/muck, reconnect, cashier и navigation.
4. Поднять staging/integration PG+Redis и включить gated tests.
5. Провести payment provider E2E и withdrawal recovery drill.
6. Проверить backup restore, single-writer failure и tournament payout failure.
7. Утвердить legal/player-funds/responsible-gaming policies.
8. Запустить контролируемую beta с оператором и liquidity windows.
9. Собрать D1/D7, time-to-game, FTD, payment success, incidents и support evidence.
10. Только после этого принимать решение о public traffic и масштабе.

Главный критерий качества Weez: пользователь может быстро начать игру, но внутренняя система никогда не жертвует проверяемостью игры и денег ради скорости интерфейса.
