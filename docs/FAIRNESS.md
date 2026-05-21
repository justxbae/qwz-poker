# Provably Fair Раздача

QWZ Poker больше не использует `Math.random()` для перемешивания колоды. Каждая раздача создается через SHA-256 commit/reveal схему.

## Как работает

1. Перед раздачей сервер генерирует секретный `serverSeed`.
2. До перемешивания считается `serverSeedHash = sha256(serverSeed)`.
3. Каждый игрок за столом имеет player seed:
   - если игрок задал seed вручную, используется `source = player`;
   - если seed еще не задан, используется безопасный fallback `source = server-fallback`, чтобы раздача не блокировалась.
4. Для руки формируется `clientSeed = sha256(userId:playerSeed|...)` и `nonce = handNumber`.
5. Колода перемешивается Fisher-Yates алгоритмом, но каждый индекс берется из SHA-256 потока:
   `algorithm:serverSeed:clientSeed:nonce:tableId:cursor`.
6. После завершения руки в историю пишется `fairnessProof`:
   - `algorithm`;
   - `serverSeedHash`;
   - `serverSeed`;
   - `clientSeed`;
   - `playerSeeds`;
   - `nonce`;
   - `deckHash`;
   - `tableId`, `handNumber`, `playerIds`.

## Что это дает

- Сервер не может тихо поменять seed после раздачи: хеш уже привязан к seed.
- Раздачу можно пересобрать тем же алгоритмом и проверить, что `deckHash` совпадает.
- В истории PostgreSQL есть отдельная колонка `hand_histories.fairness_proof`.

## Backend API

Игрок может обновить seed между раздачами:

```http
POST /api/tables/:tableId/fairness-seed
Content-Type: application/json

{ "seed": "any private player seed, 16-256 chars" }
```

Во время активной раздачи публично доступен только `serverSeedHash` и хеши player seeds. Сами seed раскрываются только после завершения руки в `handHistory.fairnessProof`.

## Ограничение текущей версии

Сейчас player seed задается обычным backend endpoint и хранится в снапшоте стола. Для финального real-money уровня нужно сделать полноценный двухфазный commit/reveal:

1. Игрок отправляет только `seedHash` до раздачи.
2. После фиксации server hash игрок раскрывает seed.
3. Если игрок не раскрыл seed вовремя, применяется заранее описанное правило fallback/auto-fold/skip-hand.
4. Все события commit/reveal пишутся в отдельный audit ledger.
