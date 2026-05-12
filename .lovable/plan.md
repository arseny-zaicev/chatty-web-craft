## Что я проверил

В коде Marketing-пресет уже захардкожен:
- `delayMin: 0`, `delayMax: 0` → на бэкенд уходит `delay_min_seconds: 0`, `delay_max_seconds: 0`
- Это значит реальный blast — гэпов между сообщениями нет, отправляется так быстро, как Gupshup принимает

То есть твоя интуиция верна: поля **Min delay** и **Max delay** в маркетинге — чистый UI, реально игнорируются. **Scheduler** (Poisson/Uniform) тоже бессмыслен при 0/0 — нечего распределять. **Time zone basis** влияет только когда задано окно `Window from/to` или Pick days.

## Что поменяю (только UI, без логики бэка)

**Step 4 (Pacing & schedule), при `type === "marketing"` и `scheduleMode === "now"`:**

1. **Min delay (s)** и **Max delay (s)** — `disabled`, значение всегда `0`, серым.
2. **Scheduler (Poisson/Uniform)** — `disabled`, значение фиксируется на `Poisson` (визуально не имеет значения при 0/0).
3. **Time zone basis** — `disabled` пока режим `Send now` + marketing (не на что влиять).
4. Под полями добавлю одну строку-подсказку:
   *"Marketing Blast sends instantly without gaps. To spread sends across multiple days, switch to Pick days."*
5. Подпись "Speed" в Review справа уже показывает **Blast** для marketing — оставляю.

**Что остаётся активным для marketing:**
- **Quota / number** (всё ещё нужен — это дневной cap на номер)
- **Send now ↔ Pick days** переключатель
- В режиме **Pick days** — все поля снова активны (даты, окно, scheduler, time zone), потому что там реально планируется на несколько дней

**Utility (Utility Paced) не трогаю** — там min/max delay реально работают (60-120s по умолчанию).

## Файлы

- `src/pages/workspace/LaunchWizard.tsx` — добавить условие `disabled={type === "marketing" && scheduleMode === "now"}` на 4 инпута/селекта в Step 4 + текст подсказки.

Никакой логики отправки/бэка не меняю — поведение и так blast.