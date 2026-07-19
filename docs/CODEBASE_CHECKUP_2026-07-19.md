# Weez Poker — codebase check-up

Дата: 2026-07-19  
Scope: структура репозитория, runtime-код, статические ресурсы, документация, бренд, зависимости и базовая автоматическая проверка.

## Итог

Кодовая база запускается и проходит локальный memory-mode suite: **121 tests / 112 pass / 0 fail / 9 skipped**. Девять пропусков — тесты, которым нужны отдельные тестовые PostgreSQL/Redis или внешние платёжные провайдеры. Синтаксическая проверка JS, `git diff --check` и проверка статических asset-ссылок прошли без ошибок.

Репозиторий очищен от сгенерированной runtime-копии, временных preview-файлов, неиспользуемых тяжёлых изображений, пустых документов и устаревших заметок, противоречивших актуальному канону.

## Что очищено

- Удалена отслеживаемая папка `release/`: она дублировала runtime-код, устаревала относительно `server/` и `public/` и содержала старый бренд. Скрипт `npm run release:clean` остаётся единственным способом собрать чистый runtime-export по требованию; результат теперь игнорируется Git.
- Удалены временные изображения `tmp/arrivo-avatar-preview*.jpg`.
- Удалён неиспользуемый `public/assets/chips-reference.jpg` размером около 3 MB.
- Удалён неиспользуемый `public/assets/nav/botprofile.svg`.
- Удалены пустые root-файлы и Obsidian-заготовки без продуктовой ценности.
- Удалены старые root-дубли `backend.md`, `frontend.md`, `decisions.md`, содержавшие уже неверные правила (10 000 daily chips, play tournaments, Cash-first lobby).
- Удалены локальные `.DS_Store` и пустые render-check каталоги.
- В `.gitignore` добавлены `release/`, `tmp/`, `output/playwright/` и общий `.docx_render_*/`.

## Что приведено в порядок

- Runtime-бренд и package name переведены на `Weez Poker` / `weez-poker`.
- Клиент больше не зависит от захардкоженного старого Telegram username: он получает `botUsername` из `/api/config` с безопасным fallback.
- Affiliate preview и table invite используют актуальный username из конфигурации.
- `render.yaml` больше не фиксирует старый username в репозитории: значение задаётся в Render environment.
- Исправлены TonConnect public routes: `/terms` и `/privacy` теперь открывают реальные отдельные документы, а не Mini App.
- `docs/CHAT_05_DEVELOPMENT_CODEX.md` обновлён под Weez и реальные канонические пути.
- README сокращён до актуального operational entry point.
- `docs/TECH_ROADMAP.md` и `docs/13-decisions.md` синхронизированы с enterprise-планом и правилом daily claim 35 000 при балансе не выше 34 999.
- Все mutation-операции активного стола выполняются под Redis single-writer lock; повторные действия, выход и возврат защищены `X-Idempotency-Key`, а клиент блокирует параллельную отправку одного и того же действия.
- Удалены мёртвые frontend-селекторы и обработчики, оставшиеся после прежних итераций интерфейса.
- Ключевые sheets и меню получили корректную dialog-семантику, управление фокусом и синхронный `aria-expanded`; Telegram API теперь вызываются только начиная с поддерживаемой версии WebApp.
- Выполнен smoke-test локального Mini App в реальном браузере: загрузка лобби, открытие кассы, фокус диалога и отсутствие JavaScript-ошибок подтверждены.
- Игровой chrome (toolbar, felt, action controls, левое меню и правый info drawer) перенесён в финальный `weez-design-system-v2.css`; совпадающие legacy-правила удалены из `telegram-ui-kit-overrides.css`.
- Добавлен CSS architecture test: финальный порядок stylesheet, budget legacy-строк/`!important`, обязательные токены и accessibility guards.
- Добавлен отдельный staging blueprint и runbook. Staging работает из ветки `staging`, требует отдельные PostgreSQL/Redis/Telegram secrets и не разрешает withdrawals/payments.
- Redis snapshot mirror получил revision compare-and-set; startup выбирает новейший snapshot PostgreSQL/Redis с tie-break в пользу durable PostgreSQL.

## Что намеренно сохранено

- `figma/`, дизайнерские ТЗ, reference media, PDF/DOCX бизнес-материалы: это исходники и deliverables, а не runtime-мусор.
- `vendor/pokersolver`: используется как независимая тестовая/справочная реализация покерной оценки.
- Исторические решения в `docs/13-decisions.md`: они нужны для аудита эволюции продукта; актуальность определяется датой и приоритетом документов.
- Технический префикс Prometheus `qwz_*` и header `X-QWZ-Crypto-Secret`: это совместимые технические контракты. Переименование требует отдельной миграции мониторинга и webhook-клиентов.
- Текущий Render service URL содержит `qwz-poker`; его смена без миграции сломает Telegram webhook, TonConnect и внешние ссылки.

## Найденные риски

### P0 — до публичного real-money запуска

1. Заполнить в Terms/Privacy юридического оператора, применимое право, территорию обслуживания, сроки хранения и процедуру споров. Добавленные страницы — честный beta-baseline, а не замена юридической проверки.
2. Развернуть подготовленный `render.staging.yaml` по `docs/STAGING.md`, затем прогнать девять gated integration-тестов на отдельных тестовых PostgreSQL и Redis. Production-базы для destructive test suite не использовать.
3. Провести failure-injection для payment/withdrawal commit timeout, Redis loss, restart during hand и tournament payout retry.
4. Проверить Render environment: `BOT_USERNAME`, `APP_NAME`, `REAL_MONEY_ENABLED`, `WITHDRAWALS_ENABLED`, PostgreSQL, Redis и provider secrets. Локальный `.env` всё ещё содержит старые `qwzpokerbot` и `QWZ Poker`; он намеренно не изменялся автоматически.
5. Выполнить device QA в реальном Telegram для cashier, withdrawal, reconnect, leave/sit-out, tournament registration/payout и session-scoped hand history.

### P1 — контролируемый техдолг

1. `npm audit` сообщает 19 moderate advisories в цепочке `@sentry/node@8` / OpenTelemetry. Автоисправление требует major upgrade до Sentry 10, поэтому обновление нельзя делать вслепую: нужна отдельная ветка, smoke test observability и полный suite.
2. `server/index.js`, `server/db.js`, `public/app.js` и CSS стали монолитными. Разделять их нужно по доменам маленькими behavior-preserving этапами, а не одним переписыванием.
3. В `public/styles.css` и override-файлах накоплены последовательные legacy/final layers. Первый игровой блок перенесён, а дальнейший рост остановлен budget-test. Следующие слои удалять только component-by-component после screenshot regression на целевых Telegram viewport/theme combinations.
4. Revision CAS и Redis lock уменьшают риск stale state, но не превращают process-local `Map`/timers в полноценный multi-process game owner. Несколько game writers нельзя запускать до fencing/routing/lock-loss модели.
5. Исторические дизайнерские ТЗ с брендом QWZ сохранены как reference archive. При подготовке новых заданий источником актуальной терминологии служат `MASTER_SPEC.md`, `docs/13-decisions.md` и `docs/DESIGN_SYSTEM.md`.

### P2 — дальнейшая чистота

1. Разнести игнорируемые бизнес-DOCX и дизайнерские документы по `docs/business/`, `docs/design/`, `docs/archive/`, если команда согласует структуру. Сейчас они сохранены, чтобы не потерять пользовательские материалы.
2. После полной смены домена выполнить управляемую миграцию старых технических URL и telemetry-префиксов.
3. Добавить CI job: asset-link checker, `npm audit` report и отдельный gated integration workflow.

## Проверки

- `env -u DATABASE_URL -u REDIS_URL npm test`: 112 pass, 0 fail, 9 skipped.
- `node --check`: server, public, tests и scripts — успешно.
- `git diff --check`: успешно.
- Static asset reference scan: 30 references, 0 missing.
- `npm audit --omit=dev`: 19 moderate, 0 high, 0 critical; зафиксировано как P1 controlled upgrade.

## Канонический порядок документов

1. `docs/13-decisions.md` — более новое датированное решение.
2. `MASTER_SPEC.md` — продуктовый и экономический канон.
3. `docs/WEEZ_ENTERPRISE_MASTER_TZ.md` — общий план industrial-grade продукта.
4. `docs/TECH_ROADMAP.md` — очередь технической реализации.
5. Профильные документы (`DATABASE.md`, `PAYMENTS.md`, `docs/FAIRNESS.md`, `docs/DESIGN_SYSTEM.md` и остальные).
