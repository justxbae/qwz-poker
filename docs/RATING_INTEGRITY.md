# Rating Integrity — anti-abuse policy

Статус: `rp-v2-beta`, действует с 2026-07-19. Источник конфигурации:
`server/economy.js` (`RATING`, `RATING_INTEGRITY`). Пороговые значения считаются
beta-калибровкой: менять их можно только датированным продуктовым решением с
последующим анализом реальных когорт.

## Формула и eligibility

| Правило | Значение |
|---|---|
| Старт сезона | 1 000 RP |
| Нижняя граница | 0 RP; ноль не сбрасывается обратно на 1 000 |
| Базовая дельта | результат руки в BB × `tableMultiplier` |
| Кап за руку | от -25 до +25 RP |
| Heads-up | множитель 0.5 |
| Минимальный банк | 2 BB; меньший банк даёт 0 RP |
| Допустимый стол | только публичный rating/play; private, cash и tournament не рейтингуются |
| Сезон | календарный UTC-месяц, отдельный `rating_season_players` |
| Лидерборд eligibility | не менее 100 рук, 5 активных UTC-дней и 3 разных соперников |

## Enforced anti-abuse

1. Положительное начисление ограничено `+150 RP` за UTC-день. Отрицательная
   дельта не обрезается дневным лимитом.
2. Для каждого игрока считается доля рук против доминирующего соперника за
   скользящие 7 дней. После 20 рейтинговых рук доля свыше 60% блокирует только
   положительное начисление и создаёт deduplicated HIGH-флаг
   `rating_pair_farm`. Отрицательная дельта сохраняется.
3. Пока у игрока открыт HIGH/CRITICAL `rating_*` risk-флаг, положительная
   дельта заморожена, отрицательная продолжает применяться. Игра не блокируется.
4. Каждая eligible-рука имеет стабильный `handId`, идемпотентно отмечается в
   `profile_hand_progress` и создаёт `rating_entries` с formula version,
   исходной дельтой и результатом integrity-проверки, включая нулевую дельту.
5. PostgreSQL-обновление season state, pair history, risk flag, entry и profile
   snapshot выполняется одной транзакцией с блокировкой строки игрока. Demo
   memory-path повторяет формулу, дневной кап, pair detector и freeze.

## Хранилище и аудит

- `rating_seasons` — границы и versioned rules сезона;
- `rating_season_players` — points/peak/hands/days текущего сезона;
- `rating_pair_hands` — opponent diversity и 7-day pair concentration;
- `rating_entries` — неизменяемая история начислений по рукам;
- `risk_flags` — review/dismiss/resolve контур без скрытого удаления истории;
- `player_profiles` — только текущий read-model snapshot, не источник аудита.

## Не реализовано и не должно считаться готовым

- device/IP cluster detection между оппонентами;
- chip-dumping/all-in-fold pattern detector и ring/collusion graph;
- операторский review с RP correction/reversal entry и апелляцией;
- immutable season close snapshot, prizes/tickets и публичная методика tie-break;
- калибровка порогов по реальным данным.

Эти пункты обязательны до денежных/материальных наград за рейтинг. PLAY_CHIPS
никогда не конвертируются в cash; rating-флаги не меняют cash wallet.
