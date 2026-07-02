# Poker market report for Arrivo/QWZ

Дата: 2026-07-01  
Цель: понять рынок poker rooms / Telegram poker / club apps, экономику, трафик, affiliate-модели, удержание и практические выводы для нашего Telegram-native poker room.

## 0. Важное ограничение по данным

Публично почти никто не раскрывает:

- чистую прибыль;
- точную выручку от рейка;
- средний рейк со стола;
- расходы на поддержку/платежи/антифрод;
- заполненность по часам;
- средний доход с турниров;
- реальный affiliate CAC/LTV.

Поэтому отчёт делит данные на три уровня:

| Уровень | Что это значит |
|---|---|
| Подтверждено | Есть источник: сайт рума, обзор, монитор трафика, affiliate-страница |
| Публичный proxy | Онлайн, отзывы, наличие rakeback/VIP, сетка турниров, условия рейка |
| Оценка | Расчётная модель на основе рейка, traffic proxy и типовой экономики рынка |

## 1. Источники и что из них полезно

| Источник | Что даёт |
|---|---|
| [PekarStas poker rooms](https://pekarstas.com/pokerrooms/) | Список румов, русскоязычная витрина, бонусы, rakeback/affiliate-подача |
| [GipsyTeam traffic monitor](https://www.gipsyteam.com/pokerrooms/traffic) | Сравнение онлайна покер-румов |
| [PokerScout / Online Poker Report](https://www.pokerscout.com/) | Глобальный traffic proxy по кэш-играм |
| [Worldpokerdeals room reviews](https://worldpokerdeals.com/) | Обзоры rakeback, клубных приложений, TON Poker, CoinPoker, Pokerdom и др. |
| [HighStakesDB rooms](https://www.highstakesdb.com/poker-sites/) | Обзоры крупных румов, rakeback, traffic proxy |
| Официальные страницы румов | Рейк, rakeback, VIP, турниры, платежи |

## 2. Карта рынка

### 2.1. Категории

| Категория | Примеры | Что важно для нас |
|---|---|---|
| Global poker rooms | PokerStars, GGPoker/PokerOK, WPT Global, 888poker, ACR/WPN | Огромный трафик, турниры, доверие, но тяжёлый вход для нового игрока |
| СНГ/локальные румы | Pokerdom, PokerPlanets, PokerMatch-подобные истории | Локальный маркетинг, бонусы, агенты, быстрые депозиты |
| Crypto/iGaming poker | Stake Poker, CoinPoker, BC Poker | Быстрые платежи, casino-кроссселл, affiliate-heavy модель |
| Club apps | PPPoker, PokerBros, ClubGG, Suprema, UPoker | Клубы, агенты, Telegram-сообщества, private games |
| Telegram-native | TON Poker, AK Poker, мелкие mini-app/bot проекты | Самый близкий сегмент для нас: no-install, Telegram payments/support/social |

### 2.2. Главный вывод

На рынке есть два сильных полюса:

1. **Большие румы** выигрывают ликвидностью, MTT-сеткой и доверием.
2. **Клубы/Telegram/crypto** выигрывают простотой входа, социальным трафиком, агентами и быстрыми платежами.

Наш правильный угол атаки — не “ещё один PokerOK”, а **Telegram-native poker club с прозрачной кассой, private tables, быстрыми cash games, турнирами и affiliate-механикой внутри Telegram**.

## 3. Публичная экономика покер-рума: как считать

### 3.1. Базовая формула выручки

```text
Gross Gaming Revenue poker ≈ Cash rake + Tournament fees - rakeback/promos - payment costs - fraud/chargebacks
```

Для cash:

```text
Cash rake/day ≈ hands_per_hour × active_tables × avg_rake_per_hand × active_hours
```

Для турниров:

```text
Tournament fee revenue ≈ entries × average_fee
```

### 3.2. Реалистичные диапазоны

| Метрика | Micro / low stakes | Mid stakes | High stakes |
|---|---:|---:|---:|
| Рук/час 6-max online | 55-85 | 55-85 | 45-75 |
| Рук/час 9-max online | 45-70 | 45-70 | 40-60 |
| Средний rake/hand | $0.01-$0.08 | $0.10-$0.80 | $1-$5+ |
| Рейк cap | низкий | средний | cap сильно влияет |
| Rakeback/VIP | 5-30% | 20-50% | 40-70% через deal/affiliate |

Для нашего старта важнее не “максимальный рейк”, а **оборачиваемость и доверие**: игрок должен понимать, что депозит, стек, история рук, рейк и вывод не ломаются.

## 4. Время ликвидности

Точная почасовая статистика по румам закрыта, но рынок online poker живёт по predictable-паттерну.

| Время UTC | Москва/Екб примерно | Кто активнее | Что запускать |
|---|---|---|---|
| 06:00-11:00 UTC | утро/день СНГ | Азия, часть СНГ, регуляры | низкие лимиты, sit&go, freeroll |
| 12:00-17:00 UTC | день/вечер СНГ | СНГ + Европа | основные cash tables, daily MTT |
| 18:00-23:00 UTC | вечер/ночь СНГ | Европа/СНГ peak, recreational | главный peak, депозитные акции, турниры |
| 00:00-04:00 UTC | ночь СНГ | high-risk/high-stakes, ЛатАм/US-friendly сегменты | highroller/private games, короткие турниры |

Практический вывод:

- **самое ликвидное окно для СНГ/Европы:** 18:00-23:00 UTC;
- **новички и малодепы:** после работы/учёбы, вечер, выходные, после промо/стримов;
- **регуляры:** шире по времени, ищут rakeback и слабые столы;
- **хайроллеры:** чаще private/agent traffic, вечер-ночь, после доверия к кассе.

## 5. Проекты по отдельности

### 5.1. PokerOK / GGPoker Network

**Позиция:** один из крупнейших мировых poker networks, особенно сильный по MTT, кешу и СНГ-аудитории.

| Параметр | Оценка |
|---|---|
| Сегмент | Global poker network |
| Сила | Ликвидность, турниры, бренд, мобильный клиент, GG network |
| Слабость | Высокая конкуренция регуляров, сложный UX для новичка, не Telegram-native |
| Rake/rakeback | Публично есть rake structure и Fish Buffet/VIP-like механики; условия зависят от региона |
| Affiliate | CPA/RevShare через аффилиат-сети, часто закрытые условия |
| Retention | Missions, leaderboards, daily freebies, MTT series, jackpot mechanics |
| Урок для нас | Нужны понятные daily hooks, турниры по расписанию, rakeback/affiliate, но без перегруза |

**Оценочная экономика:** при большом трафике GGR формируется в основном из cash rake + MTT fees. Для стартапа копировать объём невозможно; копировать надо дисциплину продукта: быстрый вход, стабильная касса, турнирный календарь, статусы, история.

### 5.2. PokerStars

**Позиция:** legacy-лидер по доверию, турнирам и бренду.

| Параметр | Оценка |
|---|---|
| Сегмент | Global regulated poker room |
| Сила | Доверие, история, Sunday majors, стабильность |
| Слабость | Сложность входа, KYC/regulation, меньше “клубного” вайба |
| Rake/rakeback | Официальная rake structure + rewards/challenges |
| Affiliate | Регулируемая affiliate-модель, строгая compliance |
| Retention | крупные серии, Spin-like formats, challenges, loyalty |
| Урок для нас | Доверие важнее “красивого бонуса”; история рук и fairness должны быть product-grade |

### 5.3. WPT Global

**Позиция:** новый/растущий глобальный бренд с мягкой игровой средой и агрессивным marketing angle.

| Параметр | Оценка |
|---|---|
| Сегмент | Global poker room |
| Сила | WPT brand, recreational positioning |
| Слабость | Меньше ликвидность, чем у PokerStars/GG |
| Rake/rakeback | Есть публичные rake/bonus/rakeback offers через партнёров |
| Affiliate | CPA/RevShare, партнёрские офферы |
| Retention | бонусы, серии, мягкая экосистема |
| Урок для нас | Можно продавать не “мы самые большие”, а “у нас проще и комфортнее играть” |

### 5.4. 888poker

| Параметр | Оценка |
|---|---|
| Сегмент | Regulated legacy poker |
| Сила | Бренд, казино-связка, casual audience |
| Слабость | Не самый сильный текущий poker traffic |
| Rake/rakeback | Официальные структуры рейка/промо |
| Affiliate | Хорошо развитая iGaming affiliate-модель |
| Retention | casino cross-sell, missions, freerolls |
| Урок для нас | Freerolls и beginner-friendly турниры работают как acquisition/retention |

### 5.5. Americas Cardroom / WPN

| Параметр | Оценка |
|---|---|
| Сегмент | US-facing grey-market network |
| Сила | Высокий rakeback, турниры, крипто |
| Слабость | Репутационные вопросы, сложный рынок |
| Rake/rakeback | Сильные rakeback/offers через affiliates |
| Affiliate | Очень affiliate-heavy |
| Retention | rake races, leaderboards, crypto deposits |
| Урок для нас | Для регуляров rakeback и гонки важны, но новичкам нужен простой UX |

### 5.6. Stake Poker

**Позиция:** poker внутри сильного crypto casino/sportsbook бренда.

| Параметр | Оценка |
|---|---|
| Сегмент | Crypto/iGaming poker |
| Сила | Огромный casino/sports traffic, быстрые crypto-платежи, бренд |
| Слабость | Poker может быть не главным продуктом |
| Rake/rakeback | Ставка на VIP/casino rewards; детали могут отличаться по рынкам |
| Affiliate | Один из самых сильных affiliate-подходов в iGaming |
| Retention | VIP levels, rakeback, casino cashback, streamers, challenges |
| Урок для нас | Affiliate + Telegram traffic может быть главным growth engine |

Для нас важно: Stake продаёт не только poker, а **экосистему**. Нам тоже нужна экосистема вокруг Telegram: бот, канал, саппорт, affiliate cabinet, private games, турниры.

### 5.7. 1win Poker

| Параметр | Оценка |
|---|---|
| Сегмент | Betting/casino brand with poker vertical |
| Сила | Агрессивный маркетинг, СНГ узнаваемость, платежи |
| Слабость | Poker не обязательно core product |
| Rake/rakeback | Зависит от продукта/региона; публичная детализация ограничена |
| Affiliate | CPA/RevShare, aggressive media buying, influencers |
| Retention | бонусы, casino/sports cross-sell, промокоды |
| Урок для нас | Название, визуал и affiliate-месседж должны быть максимально простыми |

### 5.8. Pokerdom

| Параметр | Оценка |
|---|---|
| Сегмент | СНГ-oriented poker/casino |
| Сила | Локальный бренд, рублёвые/локальные платежи, турниры |
| Слабость | Репутация/регуляторика зависит от рынка |
| Rake/rakeback | Публичные промо/rakeback через партнёров |
| Affiliate | Сильная affiliate-сетка в СНГ |
| Retention | бонусы, freerolls, серии, локальный контент |
| Урок для нас | СНГ игрок любит понятные платежи, быстрый саппорт, русскую коммуникацию |

### 5.9. PokerPlanets

| Параметр | Оценка |
|---|---|
| Сегмент | СНГ/локальный poker room |
| Сила | Простота, локальные акции, меньше гигантской конкуренции |
| Слабость | Меньше ликвидность, слабее бренд |
| Rake/rakeback | Часто важны affiliate/rakeback deals |
| Affiliate | Партнёрские витрины и локальные deals |
| Retention | акции, freerolls, rake races |
| Урок для нас | Малый рум может жить, если есть комьюнити и регулярный календарь игр |

### 5.10. CoinPoker

| Параметр | Оценка |
|---|---|
| Сегмент | Crypto poker |
| Сила | Crypto-native, быстрые платежи, international |
| Слабость | Trust/liquidity challenge vs giants |
| Rake/rakeback | Rakeback/promos через affiliates |
| Affiliate | Crypto affiliate и poker deals |
| Retention | leaderboards, promos, crypto payments |
| Урок для нас | Crypto-платёж сам по себе не продаёт игру; нужна ликвидность и доверие |

### 5.11. BC Poker / BC.Game poker

| Параметр | Оценка |
|---|---|
| Сегмент | Crypto casino ecosystem with poker |
| Сила | Casino audience, crypto wallet, affiliate |
| Слабость | Poker как вертикаль может быть вторичен |
| Rake/rakeback | VIP/cashback/rakeback через BC ecosystem |
| Affiliate | Сильные RevShare/CPA в casino vertical |
| Retention | VIP, cashback, missions, casino cross-sell |
| Урок для нас | Если у нас нет casino, надо компенсировать social/private game/liquidity hooks |

### 5.12. TON Poker

**Позиция:** наиболее близкий прямой референс: poker inside Telegram/TON ecosystem.

| Параметр | Оценка |
|---|---|
| Сегмент | Telegram/TON poker |
| Сила | Telegram-native angle, crypto/TON, no-install |
| Слабость | Trust/liquidity still key; рынок молодой |
| Rake/rakeback | Публично зависит от актуальной версии/акций; нужен мониторинг |
| Affiliate | Вероятно Telegram/community driven |
| Retention | mini app convenience, crypto deposits, events |
| Урок для нас | Главный прямой benchmark. Нам нужно быть понятнее по UX, кассе и турнирам |

Что важно изучать вручную каждую неделю:

- сколько столов реально запущено вечером;
- есть ли реальные турниры и сколько entrants;
- как устроен депозит/вывод;
- как они объясняют fairness;
- есть ли affiliate/club system.

### 5.13. PPPoker

| Параметр | Оценка |
|---|---|
| Сегмент | Club app |
| Сила | Private clubs, agents, social liquidity |
| Слабость | Не централизованный room; cashflow зависит от клубов/агентов |
| Rake/rakeback | Клубы сами выставляют rake/deals |
| Affiliate | Agent/club-owner model |
| Retention | клубная социальная связь, private tables, регулярные игры |
| Урок для нас | Private table + Telegram invite + агентская модель — сильнейший инструмент |

### 5.14. PokerBros

| Параметр | Оценка |
|---|---|
| Сегмент | Club app |
| Сила | Много клубов, mobile-first, private games |
| Слабость | Trust/agent risk, серый cashflow |
| Rake/rakeback | Через клубы/агентов |
| Affiliate | Агентская сеть, доля рейка/игроков |
| Retention | private games, unions, клубная динамика |
| Урок для нас | Игроки приходят не только в “рум”, а к знакомым/лидерам клубов |

### 5.15. ClubGG

| Параметр | Оценка |
|---|---|
| Сегмент | Club/subscription/social poker app |
| Сила | GG brand, club mechanics |
| Слабость | Не всегда cash-room модель напрямую |
| Rake/rakeback | Зависит от формата клубов |
| Affiliate | Club/community model |
| Retention | клубы, subscriptions, events |
| Урок для нас | Social layer вокруг игры — не декоративная вещь, а канал удержания |

### 5.16. Suprema / UPoker / аналогичные club apps

| Параметр | Оценка |
|---|---|
| Сегмент | Club/private poker apps |
| Сила | Локальные клубы, агенты, private liquidity |
| Слабость | Trust, payments, regulatory risk |
| Rake/rakeback | Клубный rake/agent deals |
| Affiliate | Агент/клубовладелец |
| Retention | постоянные клубы, чаты, private events |
| Урок для нас | Нам нужен “легальный” Telegram-native аналог клубного UX, но с прозрачной кассой |

### 5.17. AK Poker / Telegram mini-app мелкие проекты

| Параметр | Оценка |
|---|---|
| Сегмент | Telegram mini app / casual poker |
| Сила | No-install, Telegram acquisition |
| Слабость | Часто play-only или слабая экономика |
| Rake/rakeback | Обычно нет полноценной публичной модели |
| Affiliate | Может быть viral/referral |
| Retention | daily prizes, play chips, tasks |
| Урок для нас | Telegram UX сам по себе недостаточен; нужна настоящая poker economy |

## 6. Affiliate-условия рынка

### 6.1. Типовые модели

| Модель | Как работает | Где встречается |
|---|---|---|
| CPA | фикс за first deposit / qualified player | casino/sports/poker affiliates |
| RevShare | процент от net revenue игрока | iGaming, crypto casinos, poker |
| Hybrid | CPA + RevShare | крупные affiliate deals |
| Rakeback deal | часть рейка возвращается игроку/агенту | poker-specific |
| Agent/club owner | агент ведёт игроков, получает долю рейка/депозитного оборота | club apps |

### 6.2. Что разумно для нас на старте

| Партнёр | Условие |
|---|---|
| Микро-инфлюенсер / Telegram канал | RevShare 20-35% от net rake на 3-6 месяцев |
| Сильный агент/клуб | 30-50% от net rake, но с лимитами и антифродом |
| CPA | только после стабильной кассы: например $5-$20 за qualified depositor |
| Hybrid | CPA небольшой + RevShare, когда появится LTV-аналитика |

На старте опасно давать высокий CPA без антифрода: можно купить депозитчиков, которые не играют или абузят бонусы.

## 7. Retention: как удерживают игрока

| Механика | Кто использует | Как применить нам |
|---|---|---|
| Daily bonus / daily claim | почти все casual/iGaming | play chips/rating claim без cash-смешения |
| Freerolls | 888/Pokerdom/локальные | cash-event freerolls, не play-chip tournaments |
| Leaderboards | ACR, GG, crypto rooms | rating season, но без обещания cash-out play chips |
| Missions/challenges | Stars/GG/Stake | “сыграй X рук”, “зайди в турнир”, осторожно с гемблинг-комплаенсом |
| Rakeback/VIP | почти все | Weighted Contributed rakeback, прозрачно |
| Private tables | club apps | Telegram invite links, быстрый create table |
| Fast cashier | crypto/casino | Stars/USDT/CryptoBot/xRocket, статус платежа, manual reconcile |
| Support inside Telegram | Telegram-native | must-have для доверия |

## 8. Портрет среднего игрока

### 8.1. Новичок / малодеп

| Параметр | Описание |
|---|---|
| Депозит | $1-$20 |
| Мотив | быстро попробовать, поиграть с телефона, без установки |
| Боль | не понимает poker room UX, боится вывода, боится мошенничества |
| Что удерживает | простая касса, private table, freeroll, понятный баланс |

### 8.2. Регуляр low/mid stakes

| Параметр | Описание |
|---|---|
| Депозит | $50-$500+ |
| Мотив | слабое поле, rakeback, стабильный софт |
| Боль | высокий рейк, плохие столы, лаги, нечестная RNG-система |
| Что удерживает | rakeback, hand history, fairness proof, ликвидность |

### 8.3. Агент/клубовод

| Параметр | Описание |
|---|---|
| Ценность | приводит группу игроков |
| Мотив | доля рейка, управление private games, быстрые выплаты |
| Боль | ручная касса, споры, отсутствие статистики |
| Что удерживает | affiliate dashboard, прозрачные начисления, быстрый саппорт |

### 8.4. Highroller/private game player

| Параметр | Описание |
|---|---|
| Депозит | $500+ |
| Мотив | private games, доверие, скорость вывода |
| Боль | безопасность денег, collusion, заморозки |
| Что удерживает | персональный саппорт, лимиты, честные истории рук, быстрый вывод |

## 9. Практические метрики, которые надо встроить в Arrivo/QWZ

Без этих метрик нельзя честно управлять poker room:

| Метрика | Зачем |
|---|---|
| DAU / WAU / MAU | понять retention |
| First deposit conversion | оценить кассу и onboarding |
| Depositors / active players | реальный paying core |
| Active tables by hour | liquidity map |
| Hands/hour/table | качество runtime |
| Rake/hand, rake/hour/table | экономика столов |
| Tournament entries, overlay, fees | экономика турниров |
| Withdrawals pending time | trust metric |
| Payment fail rate | критично для кассы |
| Rakeback liability | не раздать больше, чем заработали |
| Affiliate NGR by partner | честный RevShare |
| Churn after first session | UX/problem signal |

## 10. Что это значит для нашего продукта

### 10.1. MVP должен быть уже “real-money trustworthy”

Обязательно:

- cash/play изоляция;
- USDT/$ без chip-conversion в cash;
- ledger + idempotency;
- payment reconciliation;
- clear table exit / sit out / reconnect;
- hand history;
- fairness proof;
- visible rake and contribution accounting;
- Telegram notifications for deposits/tournaments/table events.

### 10.2. Growth angle

Самый реалистичный путь:

1. Telegram channel + bot + mini app как единая воронка.
2. Private tables для друзей/клубов.
3. Малые cash limits и daily tournaments.
4. Freerolls только как cash-event acquisition.
5. Affiliate/agent dashboard после стабильной кассы.
6. Rakeback по Weighted Contributed, а не dealt.

### 10.3. Чего не делать

- Не обещать “вывод play chips”.
- Не смешивать rating и cash.
- Не делать spontaneous play tournaments.
- Не запускать real-money без Redis/PG atomic runtime.
- Не давать CPA без антифрода.
- Не строить бренд “как большой casino”, если нет доверия и ликвидности.

## 11. Таблица приоритетов по конкурентам

| Конкурент | Что копировать | Чего избегать |
|---|---|---|
| PokerOK/GG | турниры, mobile UX, daily mechanics | перегруз интерфейса |
| PokerStars | доверие, hand history, стабильность | тяжёлый onboarding |
| Stake | affiliate engine, crypto-speed | casino-only perception |
| Pokerdom | локальный маркетинг СНГ | сомнительная перегрузка бонусами |
| CoinPoker | crypto-native cashier | слабая ликвидность без комьюнити |
| TON Poker | Telegram-native flow | если UX/касса непрозрачны — игрок уйдёт |
| PPPoker/PokerBros | private clubs, agents | ручная/серая касса |

## 12. Итог

У проекта есть окно возможности, потому что в Telegram poker сегменте нет перенасыщения сильными продуктами. Но трафик сам по себе не решит задачу. В poker room ценность создаётся в таком порядке:

1. **Доверие к деньгам** — депозит, стек, рейк, вывод, ledger.
2. **Ликвидность** — игрок быстро находит игру.
3. **Простота входа** — Telegram-native, без установки, без перегруза.
4. **Социальный контур** — private tables, каналы, агенты, турниры.
5. **Retention economy** — rakeback, daily hooks, leaderboards, events.

На старте нам не нужно соревноваться с PokerOK по масштабу. Нужно стать лучшим Telegram-native poker club для маленьких и средних игр, где игрок понимает: деньги на месте, игра работает, выйти/вернуться можно, поддержка рядом, история прозрачна.

## 13. Следующие исследования

Чтобы превратить отчёт в финансовую модель, нужно собрать вручную за 7 дней:

- онлайн TON Poker по часам;
- количество cash tables вечером/ночью;
- турниры TON Poker: buy-in, entries, overlay, расписание;
- активность русскоязычных Telegram poker clubs;
- ставки affiliate-deals у 5-10 poker/casino affiliate managers;
- реальные цены на Telegram traffic: CPM/CPC/CPA;
- конверсию нашего mini app: visit → auth → deposit → seated → second session.

После этого можно собрать unit-economics модель: expected GGR, rakeback liability, partner payout, payment cost, support cost, net margin.

