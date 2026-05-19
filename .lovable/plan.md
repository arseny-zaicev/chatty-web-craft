# Audit: почему не грузит админ-панель

## 1. Что я проверил

- **Lovable Cloud status**: backend healthy.
- **Прямой curl с сервера** к `xglfamaaotmwulglwcui.supabase.co`:
  - `/auth/v1/health` → HTTP 401 за **64 ms** (норма, эндпоинт жив)
  - `/rest/v1/` → HTTP 401 за **57 ms** (норма)
- **Браузерные логи у тебя**:
  - `GET /auth/v1/user` → **Failed to fetch** (не таймаут, а обрыв на сетевом уровне до ответа сервера)
  - 2× `POST /auth/v1/token?grant_type=password` → **Failed to fetch**
  - Финальный toast: `Login request timed out. Try again.` через 15 s — это наш собственный `withTimeout` в `AdminAuth.tsx`, сработавший потому что fetch так и не дождался ответа.
- **Код**:
  - `src/pages/AdminAuth.tsx` — login обёрнут в `withTimeout(15s)`, ошибку показывает корректно.
  - `src/lib/adminGuard.ts` — `getSession` (5s) и MFA-вызовы (8s) тоже под таймаутами, при сбое идёт redirect на `/admin-auth` с `reason: "auth-unavailable"`. Это уже починено в прошлых итерациях.
  - Service worker'ов и перехватчиков `fetch` в проекте нет.

## 2. Диагноз

Бэкенд работает. **`Failed to fetch` в браузере = запрос даже не дошёл до Supabase.** Это всегда одна из трёх причин на стороне клиента:

1. **Сетевой обрыв / нестабильный канал** (Wi-Fi, VPN, корпоративный прокси). Самый частый случай — особенно совпадает с тем, что у тебя был параллельный `Failed to fetch` к `/auth/v1/user` (это фон, не клик).
2. **Браузерное расширение / ad-blocker / DNS-фильтр**, режущий `*.supabase.co` или конкретно `/auth/v1/*`. uBlock, Brave Shields, Pi-hole, NextDNS regular suspects.
3. **Stale preview-таб**: токен в браузере истёк/повреждён, preview-iframe держит мёртвое CORS-соединение. После долгого открытого таба это бывает.

Что **точно НЕ причина** (исключено по логам/curl):
- Lovable Cloud (auth/DB здоровы)
- Наш guard-код (он работает корректно — именно поэтому ты видишь redirect и тост, а не белый экран)
- RLS / роли (до них не доходит — падает сам HTTP-запрос)
- Service worker (его нет)

## 3. План действий — от дешёвого к сложному

### Шаг 0. Быстрая проверка (30 сек, без кода)
Прежде чем что-то менять, попроси юзера сделать в таком порядке:
1. Открыть в браузере напрямую: `https://xglfamaaotmwulglwcui.supabase.co/auth/v1/health` → должен прийти JSON.
2. Если открылось → проблема в preview-табе: **hard reload** (Cmd+Shift+R) + очистить cookies/localStorage для `lovableproject.com`.
3. Если **не** открылось → VPN / расширение / DNS. Отключить uBlock/Brave Shields, выключить VPN, попробовать в Incognito или другом браузере.

В 90% случаев на этом всё закончится.

### Шаг 1. Сделать диагностику видимой в UI (мелкая правка `AdminAuth.tsx`)
Сейчас юзер видит только `"Login request timed out"`. Различить «сервер тупит» от «браузер не может выйти в сеть» нельзя. Добавить:
- Перед `signInWithPassword` делать `fetch('https://xglfamaaotmwulglwcui.supabase.co/auth/v1/health', { method: 'GET' })` с таймаутом 3 s.
- Если этот health-чек падает с `TypeError: Failed to fetch` → показывать конкретный месседж: *"Can't reach auth server from your browser. Check VPN / extensions / network, then retry."* + опциональная ссылка на open-in-new-tab.
- Если health-чек прошёл, а login упал → старый таймаут-месседж (значит реально сервер медленный).

Это +~20 строк, **только** в `AdminAuth.tsx`, без архитектурных изменений.

### Шаг 2. Авто-ретрай login один раз (мелкая правка)
Внутри `handleLogin`: если первая попытка упала с `TypeError: Failed to fetch` (именно сетевой error, не auth error), подождать 800 ms и автоматически повторить **один** раз. Большинство `Failed to fetch` — transient. Тоже только в `AdminAuth.tsx`.

### Шаг 3. (Опционально, если шаги 0–2 не решили)
- Сбросить локальный auth-state кнопкой "Reset session": `await supabase.auth.signOut(); localStorage.clear(); location.reload();` прямо на форме логина. Помогает при «отравленных» токенах.

## 4. Чего **не** делаю

- Не трогаю `adminGuard.ts` — он уже корректный.
- Не переписываю MFA flow.
- Не меняю Supabase клиент или роуты.
- Не делаю системных оптимизаций (это отдельная задача из предыдущего optimization-плана).

## 5. Порядок имплементации

1. Сначала **Шаг 0** — без кода, ты проверяешь у себя (это решит проблему здесь и сейчас).
2. Если хочешь, чтобы на будущее юзер сразу видел внятное сообщение — делаю **Шаг 1 + Шаг 2** одним коммитом в `src/pages/AdminAuth.tsx` (один файл, ~30 строк, риск нулевой).
3. **Шаг 3** — только если Шаги 0–2 не помогли.

Жду апрува: делать Шаги 1+2, или сначала прогонишь Шаг 0 у себя?
