# Weez Poker Design System

Этот файл нужен для Claude/Fable/любого frontend-агента. Его задача — не придумывать новый дизайн, а строго продолжать уже утверждённый Telegram-native стиль проекта.

## 1. Главный принцип

Проект должен выглядеть как нативный Telegram Mini App в тёмной теме, а не как отдельный web-casino сайт.

Нельзя:

- придумывать новые карточки, новые цвета и новые стрелки;
- делать чёрный `#000` фон для всего приложения;
- делать лишние обводки, glow, gradients, glass/blur без явной задачи;
- менять плотность, радиусы и размеры “на глаз”;
- смешивать старый QWZ-стиль с новым Telegram UI Kit стилем;
- делать элементы “примерно похожими”, если есть SVG-референс.

Нужно:

- использовать уже утверждённые блоки;
- копировать структуру существующих компонентов;
- использовать SVG из `figma/` и `public/assets/`;
- держать одинаковые углы, цвета, отступы, стрелки, иконки, шрифт;
- проверять UI в Telegram-like viewport, а не только на desktop ширине.

## 2. Файлы, на которые обязательно опираться

Перед изменениями прочитать:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/lobby-qa.css`
- `public/telegram-ui-kit-overrides.css`
- `docs/13-decisions.md`
- `docs/CHAT_04_FRONTEND_UX.md`
- `docs/CHAT_05_DEVELOPMENT_CODEX.md`

Основной актуальный CSS-регламент сейчас находится в:

- `public/telegram-ui-kit-overrides.css`

Именно он содержит финальные override-правки по Telegram UI Kit стилю. Если есть конфликт между старым `styles.css` и `telegram-ui-kit-overrides.css`, ориентироваться на `telegram-ui-kit-overrides.css`.

SVG/референсы:

- `figma/footer_lobby.svg`
- `figma/icons/chevronright.svg`
- `figma/icons/cash.svg`
- `figma/icons/monetization.svg`
- `figma/icons/wear.svg`
- `figma/icons/tournament icon.svg`
- `figma/icons/botprofile2.svg`
- `figma/icons/Group 1.svg`
- `figma/icons/poker-chip-svgrepo-com (1) 1.svg`
- `figma/Edit Menu/Mode3.svg`
- `figma/Mode=Dark.svg`

Если пользователь дал новый SVG — использовать его напрямую или адаптировать цвет/размер через CSS mask/filter, но не рисовать похожий элемент вручную.

## 3. Typography

Базовый шрифт всего приложения:

```css
font-family: "SF Pro Text", "SF Pro Display", "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif;
```

Правила:

- основной UI — SF Pro Text / system;
- крупные цифры, особенно рядом с `cash.svg`, могут использовать SF Pro Rounded;
- не делать жирнее стандартного без причины;
- заголовки блоков — medium/semibold;
- обычные строки списков — normal/regular;
- вторичные значения — muted gray;
- баланс на главном экране должен быть крупным, как в утверждённом hero-блоке.

Запрещено:

- случайно ставить `font-weight: 700/800/900` для обычных строк;
- делать весь UI bold;
- делать слишком маленький текст ради “влезания”.

## 4. Цветовая система

Цвета должны зависеть от Telegram theme params:

- `--tg-bg`
- `--tg-secondary-bg`
- `--tg-surface`
- `--tg-surface-soft`
- `--tg-text`
- `--tg-hint`
- `--tg-link`
- `--tg-button`
- `--tg-button-text`

Фон приложения:

- не чистый чёрный;
- должен подстраиваться под Telegram dark theme;
- для red/dark тем не превращать всё в один цвет;
- карточки должны быть видимы, но без жёстких обводок.

Основная схема:

- app background — Telegram dark background;
- большие карточки — surface/card;
- внутренние кнопки/rows — чуть более светлый surface;
- активное состояние — Telegram accent/button color;
- текст — white / `--tg-text`;
- secondary text — muted gray, близкий к Telegram hint;
- chevron/right meta — muted, не ярко-белый.

Важно:

- цвет всех однотипных карточек должен совпадать;
- если один блок в sheet имеет цвет `A`, соседний аналогичный блок не должен иметь другой оттенок без причины;
- не добавлять stroke/border, если его нет в референсе.

## 5. Радиусы и геометрия

Ориентир — Telegram iOS UI Kit:

- большие карточки: `26px-30px`;
- grouped list container: около `30px`;
- rows/buttons внутри grouped list: мягкий pill/card radius;
- маленькие икон-боксы: скруглённые квадраты;
- bottom nav: pill capsule;
- active bottom nav item: pill внутри capsule;
- sheet top corners: крупные, около `30px`;
- sheet drag handle: короткий серый rounded bar.

Правило: если блок повторяет `footer_lobby`, `menu`, `cashier methods`, он должен быть сделан одним и тем же компонентным стилем.

## 6. Иконки и chevron

Стрелки:

- использовать `figma/icons/chevronright.svg`;
- не использовать самодельные CSS-стрелки;
- не использовать JPEG/PNG chevron;
- цвет — muted gray, как у secondary text;
- для table rows можно делать ближе к white/muted по задаче, но форма должна быть та же;
- стрелки должны быть строго по центру строки.

Иконки:

- внутри colored icon box — белые;
- inactive tab icons — muted gray;
- active tab icons — white;
- размер иконок внутри боксов немного меньше box, не `fit: cover`;
- не растягивать SVG до края бокса.

Bottom nav icons:

- главная — playing cards / текущая утверждённая;
- турниры — `tournament icon.svg`;
- профиль — `botprofile2.svg`, инвертированный/белый active;
- меню — утверждённый menu icon.

## 7. Основные компоненты

### 7.1. Footer lobby / grouped list

Эталон: `figma/footer_lobby.svg`.

Используется для:

- нижнего блока лобби;
- menu sheet;
- cashier payment methods;
- profile detail row;
- settings/language rows.

Структура:

- общий rounded container;
- строки одинаковой высоты;
- слева colored icon box;
- по центру main label;
- справа optional meta;
- справа chevron;
- между строками separator;
- separator начинается после icon area, не от самого края;
- separator не должен превращаться в маленькие точки.

Поведение:

- вся строка кликабельна, не только chevron;
- при press строка затемняется/подсвечивается внутри своих углов;
- если пользователь начал scroll/drag — press state отменяется;
- иконка и текст не должны “проваливаться” криво.

### 7.2. Home wallet / balance block

Главный баланс:

- аватар слева;
- ник + username рядом;
- баланс справа/или в утверждённой сетке;
- cash отображается как `0.00 $`, где `$` может быть SVG только для основного баланса и профиля;
- в остальных местах обычный символ `$`;
- слово “Баланс” — muted, не ярко-белое;
- цифры баланса — крупные, белые, выровнены с `$` по baseline.

В rating mode:

- не писать “фишек” рядом с балансом, если это ломает сетку;
- daily claim показывать отдельно.

### 7.3. Cash / Rating switch

Требования:

- outer container и inner active pill должны иметь согласованные радиусы;
- active color совпадает с цветом выбора блайндов/cash mode accent;
- inactive background — утверждённый button/card gray;
- переключение Cash -> Rating и обратно должно быть плавным transform animation;
- иконки Cash/Rating слева от текста не должны сдвигать текст из центра;
- inactive icons/text muted, active white.

### 7.4. Table list

Cash tables:

- title: “Техасский холдем” или cash-specific заголовок по текущему UX;
- rows компактные, не раздутые;
- table number `#1`, `#2`, `#3` — muted gray, если это декоративная заглушка;
- blinds column;
- buy-in column;
- players column;
- chevron справа;
- columns должны быть выровнены;
- buy-in цифры выровнять по левой стороне, если так утверждено последней правкой;
- chevron и icon возле buy-in должны быть близко к цифрам, но не вплотную.

Rating tables:

- фиксированный blind `100/200`;
- нет выбора блайндов;
- daily claim `35 000`;
- PLAY_CHIPS не смешиваются с cash.

Фишка возле блайндов:

- использовать утверждённый SVG;
- если требуется полукруг — обрезать SVG маской/clip-path, а не вручную рисовать новую;
- сделать меньше, ближе к цифрам, но без пересечения.

### 7.5. Deposit / cashier sheet

Sheet:

- тот же стиль, что buy-in/menu sheets;
- без лишнего blur;
- без чужого фонового слоя под основным content block;
- drag handle сверху;
- scroll должен работать внутри sheet, а не прокручивать lobby под ним.

Content:

- heading: “Выберите сумму пополнения”;
- сумма по умолчанию `$1.00` / `1,00` согласно текущему UI решению;
- быстрые суммы: `$5`, `$10`, `$50`, `$100`;
- между quick amounts separators как в `Mode3.svg`;
- не должно быть двойных separators;
- methods block как `footer_lobby`;
- labels:
  - Stars — Telegram;
  - Crypto bot — USDT;
  - xRocket — USDT;
  - TON — скоро;
- кнопка “Пополнить” снизу, выровнена, не уезжает вправо.

### 7.6. Profile

Профиль не должен быть перегружен.

Структура:

- верхний hero:
  - аватар слева;
  - ник;
  - username/id;
- под ним компактные финансы:
  - доступно;
  - за столами;
  - рейтинг;
- блок “Детализация” отдельной строкой как grouped list row;
- блок “Сессия”:
  - если нет активного стола: “Активных столов нет”;
  - без лишней надписи “нет” в правом верхнем углу;
- статистика:
  - cash games отдельно;
  - tournaments отдельно.

Не возвращать нижний лишний блок “Игрок”, если он был удалён.

### 7.7. Menu sheet

Menu sheet:

- тот же sheet background, что и другие sheets;
- не делать лишнюю прозрачность;
- не добавлять blur, которого нет в других sheets;
- основной menu block должен быть как `footer_lobby`;
- ниже можно отдельный block:
  - Настройки;
  - Язык приложения.

Не добавлять крупный заголовок “Меню”/“Weez Poker”, если задача не требует.

### 7.8. Игровой стол

- felt — тёмный приглушённый зелёный, без светящегося casino-gradient;
- аватары игроков стоят на краю стола, но не выходят за viewport;
- верхние кнопки используют готовые `ic_list.svg`, `cancel.svg` и утверждённую info-иконку;
- левая и правая панели используют один Telegram grouped-list язык, одинаковые радиусы и surface tokens;
- обычные действия (`check/call/fold`, новая раздача, блайнды) не показываются крупной плашкой по центру: они видны у места игрока и на самом столе;
- комбинация пользователя показывается компактно прямо над панелью действий;
- на showdown подсвечиваются лучшие пять карт, у победителя показывается комбинация и проигрывается движение банка;
- после showdown не должно быть второго крупного оверлея, закрывающего карты и результат;
- цифровые значения используют `ui-rounded`/SF Pro Rounded fallback и tabular numerals.

## 8. Деньги и валюты

Cash:

- продуктово это `$` / USDT-backed balance;
- в UI cash показывается как `$`/долларовый формат;
- `$` справа через пробел — для обычных сумм;
- SVG dollar icon использовать только:
  - основной баланс на главном экране;
  - основной баланс/финансы в профиле.

Play:

- PLAY_CHIPS не отображать как `$`;
- не смешивать с cash;
- daily claim = `35 000`.

Турниры:

- ordinary tournaments/SNG = cash-only;
- play chips не участвуют;
- reward tournaments позже через tickets, ticket не валюта.

## 9. Interaction / motion

Нужны короткие нативные анимации:

- button press: local darken/highlight inside row radius;
- sheet drag: плавно, без прыжков;
- Cash/Rating switch: transform active pill;
- rating mode wallet block shift: плавный сдвиг, если кнопки deposit/withdraw скрываются;
- no heavy web animations.

Если пользователь скроллит, press/click state должен отменяться.

## 10. Testing checklist перед сдачей UI

Проверить:

- `?minimal=1&dev=1`;
- Telegram dark theme params;
- red/dark custom theme params;
- ширина iPhone viewport;
- home;
- tournaments;
- profile;
- menu sheet;
- deposit sheet;
- buy-in sheet;
- cash mode;
- rating mode;
- active/inactive bottom nav;
- separators не исчезли и не стали точками;
- chevrons выровнены;
- sheet scroll не скроллит lobby под ним;
- нет горизонтального overflow;
- нет чистого black background;
- нет случайных borders/glow/blur.

Команды:

```bash
node --check public/app.js
git diff --check
```

Если менялись frontend tests:

```bash
npm test
```

## 11. Как работать с правками

Правильный порядок:

1. Найти существующий компонент.
2. Скопировать его структуру/класс.
3. Поменять только смысловое наполнение.
4. Если нужен новый variant — добавить минимальный modifier class.
5. Не переписывать весь блок с нуля.
6. Не добавлять новый design language.

Если нет уверенности, какой стиль использовать — брать стиль `footer_lobby` / grouped list и текущие tokens из `public/telegram-ui-kit-overrides.css`.
