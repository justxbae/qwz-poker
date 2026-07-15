# Weez Poker — готовность продукта к контролируемой beta

Последнее обновление: 2026-07-11  
Статус документа: обязательный launch-checklist поверх `MASTER_SPEC.md`  
Scope: продукт, базовый NL Hold'em, интерфейс, аналитика, статусы и ручная операционная проверка.

## 1. Что означает «готов к запуску»

В проекте разделяются три разных состояния:

1. **Готов к локальному и Telegram QA** — функциональность реализована, unit/memory suite зелёный, можно системно искать интерфейсные и сценарные баги.
2. **Готов к закрытой beta** — все сценарии этого документа вручную пройдены на реальном телефоне ограниченной группой, найденные P0/P1 дефекты закрыты, оператор присутствует и способен вернуть средства вручную.
3. **Готов к публичному real-money трафику** — дополнительно выполнены инфраструктурные, юридические, security и payment E2E gates из §12.

Текущая цель итерации — довести проект до первого состояния и подготовить проверяемый путь ко второму. Отсутствие отдельной test PostgreSQL/Redis среды не блокирует продуктовую разработку, но блокирует заявление о полной публичной real-money готовности.

## 2. Границы первой beta

В beta входят:

- Rating как начальный режим, `PLAY_CHIPS` полностью отделены от cash;
- daily claim `35 000 PLAY_CHIPS` раз в 24 часа по `app_user_id`, только при play-балансе не выше `34 999`;
- cash NL Hold'em 6-max на утверждённых стейках;
- private cash tables;
- MTT/SNG cash-only и freeroll как отдельный cash-event flow;
- базовая касса, ручной withdrawal review и история операций;
- профиль, сессии, статистика, документы и поддержка;
- server-driven table events, reconnect, sit-out и auto-release;
- show/muck после обычного showdown;
- first-touch/last-touch атрибуция;
- техническая основа статусов и достижений;
- admin live table view, аудит и reconciliation.

Не входят:

- Rabbit Hunt;
- Run It Twice;
- All-in Cash Out / insurance;
- чат, emoji и table gifts;
- bounty, re-entry и add-on;
- spontaneous play-chip tournaments;
- вывод или конвертация `PLAY_CHIPS`;
- обещания автоматической выплаты до отдельной интеграции payout provider.

## 3. Канон show/muck

### 3.1. Правила

1. Победившая showdown-рука показывается автоматически.
2. После обычного showdown проигравший активный игрок получает server-driven выбор `Показать` / `Скрыть`.
3. Окно живёт `3 000 ms`. Источник времени — серверный `deadline`; клиент не продлевает окно.
4. Без ответа сервер применяет `auto-muck`.
5. All-in runout раскрывает все не сброшенные руки и не открывает show/muck-окно.
6. Игрок, сбросивший карты до showdown, не получает право показать их через это окно.
7. Визуальный muck скрывает карты на столе. После завершения руки участник этой раздачи может проверить в hand history все не сброшенные showdown-руки. Наблюдателю они не выдаются. Карты, сброшенные на ставку, остаются скрытыми от других игроков.
8. Следующая рука не стартует до закрытия show/muck-окна.
9. Повторный запрос с тем же выбором безопасен; после закрытия новый выбор не принимается.

### 3.2. Контракт

Состояние `table.showMuck`:

```json
{
  "canDecide": true,
  "deadline": 1783780000000,
  "choice": "pending",
  "status": "open"
}
```

Mutation:

```text
POST /api/tables/:tableId/show-muck
body: { "choice": "show" | "muck" }
```

События в порядке возникновения:

1. `showdown_reveal`
2. `show_muck_window_open` — только если есть eligible loser;
3. `show_muck_selected` — явный выбор;
4. `show_muck_window_closed` — `completed` или `timeout`;
5. `pot_push` / `odd_chip_award` остаются серверными фактами выплаты.

Hand history не считается готовой к durable persistence, пока окно открыто. После explicit choice или timeout в неё записываются итоговые choices.

### 3.3. Обязательная ручная проверка

- победитель + один проигравший: `show` раскрывает руку;
- `muck` не раскрывает её визуально;
- без нажатия через 3 секунды происходит auto-muck;
- reload в открытом окне не создаёт новое полное окно;
- all-in сразу показывает обе руки;
- spectator не получает скрытые hole cards;
- dealt-in player видит не сброшенные showdown-карты в истории;
- folded hand в чужой истории скрыта.

## 4. Атрибуция трафика

### 4.1. Формат ссылок

Канонический Telegram `startapp` token:

```text
source--campaign--creative--placement
```

Примеры:

```text
tiktok--beta_july--video_07--bio
telegram--weez_channel--post_12--button
offline--chelyabinsk--flyer_kirovka_a--qr
youtube--holdem_guide--short_03--description
```

Служебные форматы не смешиваются с marketing campaign:

- `tbl_<token>` — приглашение за конкретный стол;
- `ref_<partner>` — referral;
- пустой param — `direct`.

### 4.2. First touch и last touch

- First touch фиксируется один раз и не переписывается.
- Last touch обновляется новым недиректным касанием.
- Обычное повторное открытие без параметра не уничтожает предыдущую last-touch campaign.
- Marketing start param не должен трактоваться как table id.

Хранятся отдельно:

- `source`;
- `campaign`;
- `creative`;
- `placement`;
- исходный `start_param`;
- тип касания;
- first/last timestamps.

В аналитику запрещено писать Telegram `initData`, hole cards, fairness seeds и полный withdrawal address.

### 4.3. Отчётность

Admin attribution card группирует first-touch по `source / campaign / creative / placement` и показывает:

- users;
- new users за период;
- players с table join;
- payers/FTD;
- player activation rate.

Минимальные формулы:

```text
Trial activation = users with first completed hand / new acquired users
FTD conversion   = first depositors / new acquired users
Cash activation  = users with completed cash hand / first depositors
CAC               = spend / activated users (или FTD — указывать знаменатель)
```

Нельзя смешивать test/admin/bot traffic с пользовательскими cohorts.

## 5. Статусы и достижения — архитектурная основа

### 5.1. Принципы

- Это identity/retention layer, а не валюта и не gameplay advantage.
- Определение хранится на сервере и версионируется.
- Выдача идемпотентна: один `code` не начисляется повторно.
- Для ручной выдачи обязателен actor, reason, source id и audit log.
- Сезонные титулы неизменяемы после settlement; исправление выполняется отдельной audited correction.
- Выбрать в профиль можно только заработанный item с `isStatus=true`.
- Награда деньгами или play chips не добавляется молча. Для неё требуется отдельное economy decision.

### 5.2. Каталог beta groundwork

| Code | Тип | Trigger | Выбираемый статус |
|---|---|---|---:|
| `beta_tester` | founder | manual audited grant | да |
| `founding_player` | founder | manual audited grant | да |
| `first_cash_win` | cash | первая cash-рука с profit > 0 | нет |
| `freeroll_winner` | tournament | первое место в official freeroll | да |
| `season_1_final_table` | season | season settlement | да |
| `season_1_champion` | season | season settlement | да |

API профиля отдаёт:

- `selectedStatus`;
- `earned`;
- catalog metadata;
- `earned/status/completedAt/selected` без внутренних rules.

Mutation выбора:

```text
POST /api/profile/status
body: { "code": "beta_tester" }
```

До отдельного UI-pass допустимо не показывать каталог публично. Backend/database contract уже должен оставаться стабильным.

### 5.3. Следующая итерация статусов

1. Admin grant/revoke correction с обязательной причиной.
2. Автоматическая выдача `freeroll_winner` и season statuses из settlement.
3. Profile selector без locked-item noise.
4. Compact table badge только после visual approval.
5. Anti-abuse: achievement не засчитывается на admin/test hands, cancelled/aborted hands и private self-play.

## 6. Покнопочный продуктовый контракт

Каждая интерактивная кнопка имеет состояния:

```text
idle → pressed → loading → success | error
                    ↘ cancelled (палец ушёл за hit area)
disabled — отдельное видимое и семантическое состояние
```

Общие требования:

- hit area не меньше 44×44 px;
- повторное нажатие во время loading не создаёт второй mutation;
- денежные действия используют `X-Idempotency-Key`;
- ошибка объясняет, что случилось и что сделать дальше;
- после success интерфейс синхронизируется с серверным ответом, не прибавляет баланс самостоятельно;
- при network error пользовательские данные остаются в форме, доступен retry;
- pressed highlight снимается, если палец ушёл со строки;
- скрытая кнопка не остаётся focusable/clickable;
- системный Back не выполняет скрытую денежную операцию.

## 7. Screen-by-screen QA

### 7.1. Boot / auth

- валидный Telegram initData открывает лобби;
- invalid initData не создаёт пользователя и показывает понятную ошибку;
- повторный auth восстанавливает текущую сессию и стол;
- start param записывается один раз в first touch;
- slow start показывает loader, не пустой экран;
- retry не создаёт дубликаты аналитики и денег.

### 7.2. Главная / Rating

- Rating открыт по умолчанию;
- cash controls не видны;
- баланс — только `PLAY_CHIPS`;
- daily claim доступен каждые 24 часа при остатке не выше `34 999`;
- после claim +35 000 отражается из server response;
- countdown обновляется каждую секунду и пересинхронизируется после reopen;
- столы имеют фиксированные 100/200, 6-max;
- private game ведёт в cash-only flow и явно сообщает об этом;
- PLAY_CHIPS не попадают в withdrawals, cash tournaments или private buy-in.

### 7.3. Главная / Cash

- cash balance в USDT, storage micros не видны;
- один выбранный stake filter; активный фильтр нельзя снять до состояния «нет столов»;
- table row показывает blinds, min/max buy-in, occupancy;
- occupied own table открывается без повторного buy-in;
- пустая выдача объясняет отсутствие свободных столов без фальшивого CTA.

### 7.4. Buy-in / rebuy

- min/max соответствуют таблице стейков;
- slider и числовое поле синхронны;
- недостаточный баланс не создаёт seat;
- join/rebuy работают один раз при double tap/retry;
- top-up/rebuy применяются только между руками;
- закрытие sheet не списывает средства;
- CTA не перекрывается Telegram keyboard/bottom nav.

### 7.5. Игровой стол

- hole cards видит только владелец до разрешённого reveal;
- turn indicator и deadline приходят с сервера;
- Fold/Check/Call/Bet/Raise показываются только когда legal;
- amount min/max проверяет сервер;
- side pots, uncalled return и odd chip отражаются отдельными событиями;
- no-flop-no-drop и rake совпадают с hand history;
- reconnect не перематывает старые анимации;
- отсутствующий игрок получает auto-action по правилам, затем cash/rating sit-out 300 sec и release;
- tournament disconnect не останавливает blind-out;
- `Назад` возвращает в лобби, но не выполняет leave;
- `Покинуть стол` подтверждается отдельно и возвращает stack после допустимой границы руки;
- show/muck проходит по §3;
- гигантский текст результата не перекрывает стол; pot push остаётся кратким server-driven событием.

### 7.6. История рук

- по умолчанию только текущая table session;
- session начинается при первой реальной руке с 2+ игроками;
- session закрывается, когда за столом не осталось игроков;
- hand number, board, pot, winners, combination, result и rake непротиворечивы;
- folded cards других игроков скрыты;
- fairness proof относится именно к выбранной руке;
- stale history другой сессии не появляется в table panel.

### 7.7. Турниры

- cash-only registration и отдельные buy-in/fee;
- register/cancel не дублируются;
- late reg, level clock, seating, moves, final table — server-driven;
- disconnected player продолжает платить blinds/ante;
- payout один раз и только после finished;
- freeroll имеет zero buy-in, но cash-event payout;
- reward tournament принимает ticket, не PLAY_CHIPS.

### 7.8. Профиль

- available cash, table cash и rating не смешиваются;
- большие числа адаптивны и не выходят из карточки;
- active table возвращает к текущему seat;
- cash и tournament stats разделены;
- детализация открывает ledger/history, а не вычисляет баланс на клиенте;
- selected status показывается только после отдельного UI approval.

### 7.9. Касса и документы

В этой итерации payment provider logic не меняется, но UI обязательно проверить:

- amount input, quick amounts и выбранный method имеют однозначные states;
- keyboard закрывается tap по свободной зоне/Done;
- CTA не плавает и не перекрывает контент;
- withdrawal address обязателен и валидируется сервером;
- cancel возвращает hold ровно один раз;
- fee и network fee видимы до подтверждения;
- pending/manual review/paid/rejected/expired различимы;
- Пользовательское соглашение, Правила игры, Платежи и вывод, Responsible Gaming 18+ открываются, скроллятся и закрываются;
- Support ведёт на утверждённый контакт.

### 7.10. Admin

- live view не раскрывает hole cards активной руки;
- открытие live view логируется;
- видны table/session/hand ids, seats, stacks, bets, presence и deadlines;
- доступны hand history и server event timeline;
- money mutation требует actor/reason/idempotency/audit;
- reconciliation alert не исправляет баланс молча;
- source/campaign/creative attribution видна без доступа к initData.

## 8. Ошибки и тексты

Минимальные категории:

| Ситуация | Поведение |
|---|---|
| `401` session expired | один re-auth, затем экран повторного входа |
| `409` stale/cooldown/not your turn | применить свежий server state, не повторять mutation автоматически |
| `422/400` validation | подсветить конкретное поле, сохранить ввод |
| `429` rate limit | показать время retry, не спамить |
| `5xx/network` | нейтральная ошибка + retry; неизвестный денежный результат сначала опрашивается по order/idempotency key |
| SSE disconnect | тихий reconnect с `Last-Event-ID`, без replay старой анимации |

Пользовательский текст не должен содержать `micros`, stack internals, raw provider errors, SQL/Redis и секреты.

## 9. Официальные ориентиры

### PokerStars

- [Show or muck your cards](https://www.pokerstars.com/help/articles/show-hole-card/11087/?ooac=1): краткий выбор show/muck и auto-muck по timeout.
- [Cards mucked in hand histories](https://www.pokerstars.com/help/articles/hh-mucked-cards-rule/33780/): called showdown hands доступны участникам через hand history, folded-facing-bet остаются скрыты.
- [All-in hole cards](https://www.pokerstars.com/poker/learn/news/hole-cards-visible-when-all-in-162417/): hole cards при all-in показываются всем.
- [Hand histories](https://www.pokerstars.com/help/articles/save-hand-histories/): история и replayer — отдельный продуктовый слой.
- [Game fairness and security](https://www.pokerstars.com/help/articles/integrity-info/): статическая заранее зафиксированная колода и отсутствие доступа к hole cards во время руки.
- [Unfair play](https://www.pokerstars.com/help/articles/unfair-play-master/): collusion/chip dumping запрещены, расследование опирается на hand/table ids.
- [Seat Me](https://www.pokerstars.com/help/articles/seat-me-introduction/): защита liquidity/integrity через управляемую посадку; это ориентир на будущее, не обязательный beta feature Weez.

### PokerDom

- [Официальные правила Texas Hold'em](https://pokerdom.com/poker/tehasskiy-holdem/): порядок blinds, streets, showdown и смена dealer.
- [Правила дисциплин](https://pokerdom.com/poker-rules/): базовый reference по cash blinds и отличиям tournament blinds.

### PokerOK / GGNetwork

PokerOK является полезным UX-референсом интерфейса GGNetwork, но публичная русскоязычная документация не даёт достаточно точного стабильного контракта для всех спорных server rules. Поэтому скриншоты/видео PokerOK используются только для визуального сравнения, а не как единственный нормативный источник. Для account security, responsible gaming, game cancellation и feature categories используется [официальная база GGPoker](https://help.ggpoker.com/categories/Account/Account_Creation); спорное правило без первичной официальной страницы не копируется по памяти.

## 10. Что уже закрыто этой итерацией

- server-driven show/muck state, API, deadline, events, reconnect snapshot и tests;
- all-in reveal и history privacy boundary;
- first/last-touch attribution и campaign token parser;
- attribution persistence и admin source/campaign report;
- achievement/status catalog, persistence, profile contract и status selection guard;
- automatic `first_cash_win` grant;
- daily claim строго соответствует refill-правилу `35 000 / 24h` при play-балансе не выше `34 999`;
- Rabbit Hunt исключён из runtime и launch scope.

## 11. Что остаётся продуктовым QA, а не новой разработкой

1. Пройти §7 на iPhone внутри Telegram минимум двумя реальными аккаунтами.
2. Сыграть сценарии heads-up, 3-way side pot, all-in, fold-win, disconnect и leave/rejoin.
3. Проверить cash/rating isolation через профиль, кассу и историю.
4. Проверить все empty/loading/error/disabled состояния.
5. Исправлять только воспроизводимые дефекты с table/hand/session id и видео.
6. После каждой правки повторять соответствующий сценарий и smoke остальных денежных экранов.

## 12. Go / no-go

### Можно начинать Telegram QA / закрытый rating pilot, когда

- memory/unit suite зелёный;
- sandbox не показывает show/muck до eligible showdown;
- auth, lobby, daily claim, table join/action/leave и profile smoke проходят;
- нет P0 дефекта «баланс изменился без ledger» или «игрок не может вернуть stack».

### Можно приглашать ограниченную cash beta только после

- ручного прохождения всего §7;
- always-on paid runtime без sleep/scale-to-zero;
- backup/restore rehearsal;
- отдельного test PG/Redis и infra/failure suite;
- payment/withdrawal E2E на малых суммах с нулевым reconciliation drift;
- webhook secrets, admin secret, metrics token и rate limits в fail-closed режиме;
- юридической проверки юрисдикции, 18+, KYC/AML/sanctions, privacy и responsible gaming;
- опубликованного withdrawal SLA и оператора на смене.

### Текущий честный вердикт

После зелёных локальных тестов и ручного sandbox smoke проект является **кандидатом на системное Telegram QA**, а не доказанно готовым публичным real-money room. Это не оценка качества идеи: продуктовый core уже достаточно полный. Ограничение связано с тем, что пользователь осознанно перенёс инфраструктурные и provider E2E проверки на этап с нормальным сервером. После этого этапа документ используется как go/no-go протокол, а не переписывается заново.
