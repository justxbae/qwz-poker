# Frontend handoff: realtime gameplay

Backend и базовое подключение frontend готовы:

- `GET /api/tables/:id/events` — authenticated SSE через streaming `fetch`.
- Resume: передавать последний SSE `id` в `Last-Event-ID`.
- `POST /api/tables/:id/presence` каждые 5 секунд, пока открыт стол.
- При обрыве SSE используется snapshot polling fallback.
- Fairness: `POST .../fairness-commit` с SHA-256 hash, затем после `fairness.phase=commit_reveal` — `POST .../fairness-reveal`.

Frontend animation pass ещё должен заменить snapshot-diff анимации на последовательную очередь `table.events`. События нельзя переставлять; порядок задаёт `sequence`. После reconnect уже проигранные `sequence` пропускаются, snapshot используется как итоговое состояние.

Обязательные группы анимаций:

- Deal: `hand_start`, `blind_posted`, `ante_posted`, `hole_cards_dealt`.
- Actions: `action_prompt`, `check`, `call`, `bet`, `raise`, `fold`.
- Board/showdown: `street_reveal`, `all_in_runout_start`, `runout_card_revealed`, `showdown_reveal`, `pot_push`, `odd_chip_award`.
- Seats/tournaments: `seat_sit_out`, `seat_return`, `seat_disconnected`, `seat_busted`, `tournament_level_up`, `tournament_table_move`, `final_table_started`, `payout_complete`.

Frontend не должен рассчитывать победителя, side pots, reveal/muck, deadlines или tournament moves самостоятельно.
