## Проблема
Сейчас в Section access нет тумблера **Stats**: страница Stats гейтится по `perm_inbox`, поэтому любой у кого есть Inbox получает Stats автоматически. Также нельзя дать сеттеру право видеть **всех** — он всегда видит только себя, full-team scope открыт только менеджерам/owner/admin.

## Что добавляем
Два новых permission-флага:
- `perm_stats` - может вообще видеть раздел Stats. По умолчанию свою личную статистику.
- `perm_stats_all` - может переключаться в режим "Team" и видеть всю команду. Без `perm_stats` бесполезен (тумблер серый).

## Миграция БД
```sql
ALTER TABLE workspace_members
  ADD COLUMN perm_stats boolean NOT NULL DEFAULT false,
  ADD COLUMN perm_stats_all boolean NOT NULL DEFAULT false;

-- Backfill: всем существующим менеджерам и тем у кого perm_settings - даём оба
UPDATE workspace_members
  SET perm_stats = true, perm_stats_all = true
  WHERE perm_settings = true OR role = 'manager';

-- Остальным с perm_inbox - даём только свою (perm_stats=true, perm_stats_all=false)
UPDATE workspace_members
  SET perm_stats = true
  WHERE perm_stats = false AND perm_inbox = true;
```

## Код
1. **`src/lib/workspaceRole.ts`** - добавить `perm_stats`, `perm_stats_all` в `PERM_KEYS` и в SELECT.
2. **`src/pages/workspace/WorkspaceLayout.tsx`** + **`WorkspaceSidebar.tsx`** - заменить `stats: "perm_inbox"` на `stats: "perm_stats"`.
3. **`src/pages/workspace/WorkspaceStats.tsx`** - заменить `canViewAll = canManageSettings || isAdmin || isOwner` на `canViewAll = isAdmin || isOwner || permissions.perm_stats_all`. Без `perm_stats_all` scope-селектор скрыт, всегда "me".
4. **`src/components/workspace/TeamView.tsx`** - добавить два новых лейбла в `PERM_LABELS`:
   - `perm_stats: "Stats"`
   - `perm_stats_all: "Stats - see whole team"`
   В UI: тумблер "Stats - see whole team" disabled когда `perm_stats=false`.

## UX в Section access
```
Stats                          [toggle]
  ↳ See whole team             [toggle]   (indented, disabled if Stats off)
```

## Что НЕ трогаем
- Существующие настройки клиентов - backfill сохраняет текущее поведение
- RLS на underlying таблицах - фильтрация уже идёт через `setterIdForRpc` на клиенте/RPC
- Никаких визуальных изменений в самой странице Stats для тех у кого `perm_stats_all`
