## Контекст

Три проблемы в `src/pages/workspace/LaunchWizard.tsx`:

1. **Математика Per day игнорирует cap 200/номер в Send now**, и в Pick days показывает «идеальное» распределение (351), а не cap (400).
2. **Шаблоны утилити имеют переменные `{1} {2} {3}`** (см. скрин — "Missing: 1, 2, 3"). Они не подгружаются автоматически, потому что у GO Greece/Malta аудитории столбцы — `business_name, city, category, segment`, а не `1/2/3`. У Salesforge сработало случайно (имена переменных совпадали со столбцами). Нужно сделать маппинг очевидным и быстрым.
3. **Pipeline-автоматизации** настраиваются отдельно — встроить как опциональный Step 4.

---

## Изменения

### 1. Математика Per day и Send now cap

Файл: `src/pages/workspace/LaunchWizard.tsx`

**Pick days (уже работает корректно по логике, нужна ясность UI):**
- Per day = `min(idealPerDay, dailyCap)` где `dailyCap = numbers × perNumberQuota`. При 8 датах × 2808 → 351/день, потому что выбрано 8 дат. Это нормально — мы равномерно распределяем по выбранным датам.
- Если хочешь жарить по 400/день — выбери 7 дат вместо 8 (пользователь сам управляет). Добавим подсказку: «Выбрано 8 дней → 351/день. Уменьши до X дней чтобы выйти на cap 400/день».

**Send now (главный баг):**
- Сейчас при Send now `Per day = recipients.length` (2808), cap 200/номер игнорируется в UI и в backend (отправляется все одной кучей).
- Фикс: применить тот же `dayPlan` к Send now → Per day = `min(recipients.length, numbers × 200)` = 400. Остальные 2408 уезжают на следующие дни автоматически (campaign-day-rollover уже умеет это).
- В строке Review «Per day / Per number / Days needed / ETA» использовать `dayPlan.effectivePerDay` для обоих режимов.
- Подсказка под расписанием для Send now: «Стартует сейчас. Cap 200/номер/день = 400/день. Сегодня уйдёт 400, остальные 2408 авторазвернутся на следующие дни».

### 2. Variable mapping — очевидный и быстрый (для случая с {1}{2}{3})

Файл: `src/pages/workspace/LaunchWizard.tsx`, Step 5.

**Проблема:** если автомаппинг не нашёл столбец с именем переменной, юзер видит «Missing: 1, 2, 3» в превью, но Step 5 спрятан внизу и неочевиден. У Salesforge всё работало потому что переменная называлась `name` и в CSV был столбец `name`.

**Что меняем:**
- Step 5 («Variable mapping») всплывает выше — сразу после Step 4 (Audience), и подсвечивается янтарным бейджем `Action required`, если есть неразмеченные переменные.
- В заголовке шага показывать `{N} of {M} variables mapped`.
- Каждая строка показывает превью значения из первого контакта рядом со селектом (чтобы было видно, что подставится).
- Добавляем кнопку «Apply same value to all» рядом со static value (массовая заливка одного текста для всех).
- В превью (Step 7) если есть Missing — сверху красный бэннер «Map variables in Step 5 before launch» со скроллом к Step 5.
- Launch button блокируется, пока есть unmapped variables (сейчас не блокируется).

**Документируем для будущего**: в `src/pages/workspace/LaunchWizard.tsx` коммент: имена переменных в шаблоне (`{1}`, `{2}`, …) должны либо матчить колонку в audience payload, либо быть смаплены руками в Step 5 как static.

### 3. Step 4: Pipeline automations (опционально)

Файл: `src/pages/workspace/LaunchWizard.tsx` + переиспользовать `src/components/workspace/StageAutomationsDialog.tsx` или его внутренности.

**Новый Step 4 (collapsible, по умолчанию свёрнут):**
- Заголовок: `Pipeline automations · optional`.
- Если свёрнут — применяются дефолты выбранного pipeline.
- Если открыт — показываем 3 простых тогла:
  - **Auto-reply rules** (использовать stage automations из `pipeline_stage_automations`).
  - **Auto-move on reply** (recipient → стадия "Replied").
  - **Slack ping on reply** (использовать `pipeline.slack_channel_id`).
- Кнопка «Edit full pipeline config» открывает существующий `PipelineConfigSheet` поверх wizard.
- Перенумеровать последующие шаги (Audience → 5, Variable mapping → 6, Naming → 7, Preview → 8).

### 4. Не трогаем

- Backend dispatcher (`supabase/functions/campaigns`, `campaign-day-rollover`) — он уже уважает `daily_cap` и rollover, изменения только в UI/предсказании.
- `perNumberQuota` cap=200 уже стоит (предыдущий фикс).
- Существующие шаблоны/копии в БД не трогаем.

---

## Технические детали

```text
Send now math fix (lines ~1273-1287, ~1274):
- Row "Per day" value:
    scheduleMode === "scheduled" ? dayPlan.effectivePerDay : recipients.length
  →
    dayPlan.effectivePerDay   // (works for both modes; dayPlan уже считает min(ideal, cap))

- В useMemo dayPlan для scheduleMode === "now":
    daysSelected = Math.max(1, Math.ceil(total / dailyCap))
  чтобы Per day = min(total, dailyCap), а Days needed = correct.
```

```text
Step 5 highlight:
- В заголовке Step показываем badge: "Action required" если
  variableNames.some(v => !mapping[v])
- Launch button: disabled={resolution.missing.length > 0 || unmappedVars.length > 0}
```

```text
Step 4 Pipeline automations:
- Состояние: const [automationsOpen, setAutomationsOpen] = useState(false)
- При submit: passед поверх дефолтов pipeline на сервер через body.automations_override = { ... }
  (либо просто открываем сайдшит для редактирования pipeline без передачи overrides — MVP)
```

## Out of scope

- Backend cap enforcement в Send now (дispatcher уже уважает recipient.scheduled_at; UI исправит то, что отдаёт).
- Изменение шаблонов в Gupshup или ре-синк копии.
- Переименование переменных в шаблонах с `{1}` на `{name}` — это надо делать в Gupshup.
