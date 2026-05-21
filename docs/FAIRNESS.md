# Provably Fair Раздача

QWZ Poker больше не использует `Math.random()` для перемешивания колоды. Каждая раздача создается через SHA-256 commit/reveal схему.

## Как работает

1. Перед раздачей сервер генерирует секретный `serverSeed`.
2. До перемешивания считается `serverSeedHash = sha256(serverSeed)`.
3. Для руки формируется `clientSeed` из стабильного состава игроков за столом и `nonce = handNumber`.
4. Колода перемешивается Fisher-Yates алгоритмом, но каждый индекс берется из SHA-256 потока:
   `algorithm:serverSeed:clientSeed:nonce:tableId:cursor`.
5. После завершения руки в историю пишется `fairnessProof`:
   - `algorithm`;
   - `serverSeedHash`;
   - `serverSeed`;
   - `clientSeed`;
   - `nonce`;
   - `deckHash`;
   - `tableId`, `handNumber`, `playerIds`.

## Что это дает

- Сервер не может тихо поменять seed после раздачи: хеш уже привязан к seed.
- Раздачу можно пересобрать тем же алгоритмом и проверить, что `deckHash` совпадает.
- В истории PostgreSQL есть отдельная колонка `hand_histories.fairness_proof`.

## Ограничение MVP

Сейчас `clientSeed` формируется сервером из состава игроков. Для полноценного commercial-grade commit/reveal нужно добавить player-seed протокол: каждый активный игрок перед рукой отправляет/подтверждает свой seed hash, а финальный `clientSeed` собирается из всех player seeds. Это следующий этап перед реальными денежными играми.
