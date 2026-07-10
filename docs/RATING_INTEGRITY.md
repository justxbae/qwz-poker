# Rating Integrity — anti-abuse policy

Статус: v1, действует с 2026-07-10. Backend-хуки: `server/economy.js` (`RATING_INTEGRITY`, `ratingDeltaForHand`).

## Что уже enforced в коде (v1)

| Правило | Значение | Где |
|---|---|---|
| Private tables не рейтингуются | delta = 0 | `ratingDeltaForHand(isPrivate)` + private = cash-only в UI/API |
| Минимум активных игроков | ≥ 2 | `activePlayers < 2 → 0` |
| Микро-банк не рейтингуется | pot < 2 BB → 0 RP | `RATING_INTEGRITY.minPotBigBlinds` (анти fold-farm: мгновенные фолды блайндов не двигают RP) |
| Heads-up demping | ×0.5 к дельте | `RATING_INTEGRITY.headsUpMultiplier` (перекачка фишек между двумя аккаунтами вдвое медленнее и симметрично убыточна) |
| Кап за руку | ±25 RP | `RATING.maxHandDelta` |
| Турнирные руки | не считаются | `ratingEligible` в progress-хуках |
| Лидерборд-порог | ≥100 рук и ≥5 активных дней | `RATING.minActiveHandsForLeaderboard/minActiveDaysForLeaderboard` — калибровка отсекает свежие фермы |

## v2 — требует хранения (не реализовано, план)

1. **Дневной кап RP** на аккаунт (например +150/день): нужна таблица `rating_daily_accrual (app_user_id, day, rp_gained)`.
2. **Пара-детектор**: доля рук против одного и того же оппонента за 7д > 60% → RP-множитель 0 для пары + risk-флаг `rating_pair_farm`.
3. **Кластеры устройство/IP/Telegram**: совпадение `device_sessions.ip_hash/device_id_hash` у оппонентов → флаг `rating_cluster`, руки идут в аудит.
4. **Паттерн all-in/fold**: N подряд рук с preflop all-in→fold между теми же местами → флаг `rating_dump_pattern`.
5. Флаги пишутся в существующий `risk_flags`, отображаются в админке (risk tab), RP-начисление при активном HIGH-флаге замораживается (delta 0, руки копятся в аудит).

## Инварианты

- Ничего из этого не блокирует саму игру — только начисление RP.
- Play chips ↔ cash конверсии нет ни при каком статусе.
- Все пороги — конфиг, не хардкод в вызовах.
