## 2026-06-18: Cash — начальный режим лобби

**Зона:** product / frontend / development

**Решение:** При каждом открытии приложения лобби изначально показывает Cash. Переключение между Cash и Рейтинг меняет содержимое текущего экрана и не выполняет навигацию на другую нижнюю вкладку. В рейтинговом режиме скрыты Турниры, Sit&Go и Приватный, поскольку этот режим содержит только публичные рейтинговые столы.
**Почему:** Переключатель выбирает режим игры, а не раздел приложения. Дополнительные форматы не относятся к рейтинговой логике.
**Влияет на:** `public/app.js`, `public/index.html`, `public/styles.css`, frontend UX.
**Что обновлено:** Начальное состояние Cash, поведение переключателя, видимость дополнительных форматов, regression-тест.
**Открытые вопросы:** Нет.

## 2026-06-18: Production deploy работает в real-money режиме

**Зона:** architecture / economy / development

**Решение:** Render запускает `npm start` и использует `REAL_MONEY_ENABLED=true`. Query-параметр frontend `dev` остаётся локальным QA-инструментом и не определяет режим кассы.
**Почему:** Касса определяется серверным флагом `REAL_MONEY_ENABLED`; при `false` API намеренно отдаёт demo/play кассу. В real-money режиме отсутствие PostgreSQL или Redis является фатальной ошибкой запуска.
**Влияет на:** `render.yaml`, production deploy, cash API и платежи.
**Что обновлено:** Production start command и regression-тест конфигурации.
**Открытые вопросы:** Перед деплоем проверить, что в Render заданы `DATABASE_URL`, `REDIS_URL`, `BOT_TOKEN` и секреты активных платежных провайдеров.

## 2026-06-18: Подтверждение Stars-депозита только по серверному paid

**Зона:** architecture / economy / frontend / development

**Решение:** Telegram callback `openInvoice(status='paid')` не считается подтверждением зачисления. UI показывает успешное пополнение только после authenticated polling конкретного order, когда backend вернул `payment_orders.status='paid'` и актуальный PostgreSQL cash wallet. Перед созданием Stars-инвойса backend проверяет Telegram webhook через `getWebhookInfo` и при неверном URL блокирует создание счёта.
**Почему:** Telegram может списать Stars до того, как webhook и транзакция wallet+ledger завершились. Без server-side проверки UI выдавал ложное сообщение «Баланс пополнен» при нулевом балансе.
**Влияет на:** Stars deposits, `/api/cashier`, `/api/profile`, payment monitoring, frontend cashier UX.
**Что обновлено:** Payment-status endpoint с ownership check, authoritative wallet refresh, polling UI, fail-closed webhook readiness, USDT-aware Stars reconciliation, regression-тесты и incident runbook.
**Открытые вопросы:** Production работает на `https://qwz-poker-t8mc.onrender.com`; старый адрес без суффикса не относится к активному сервису. Проверить pending Stars-order пользователя `@quinwize` и обработать его по runbook без повторного платежа.

## 2026-06-18: Guarded manual approval для pending Stars

**Зона:** architecture / economy / development

**Решение:** Finance-admin может вручную подтвердить Stars-order только в статусе `pending/manual_review`, после отдельного UI-предупреждения и с API-флагом `confirmPaid=true`. Начисление проходит через тот же идемпотентный `completePaymentOrder`, прямые wallet updates запрещены.
**Почему:** Telegram webhook может исчерпать retries после production-ошибки, но подтверждённый receipt должен иметь безопасный операционный recovery path.
**Влияет на:** admin payment orders, Stars incident recovery, audit trail.
**Что обновлено:** Кнопки Stars approve/reject, receipt confirmation guard, PostgreSQL `FOR UPDATE OF` fix, тесты.
**Открытые вопросы:** Нет.
