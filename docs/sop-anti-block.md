# SOP: Avoiding WhatsApp Blocks & Spam Throttling

> **Источник:** только наши собственные данные (`whatsapp_message_events`, `whatsapp_numbers`) за последние 14 дней.
> Все цифры можно перепроверить запросом из раздела "Appendix · Queries".
> Время в документе - **GST (Dubai, UTC+4)**.

---

## 1. Что мы реально словили (last 14 days)

| Code  | Meaning                                       | Кол-во | Где болит                                                                 |
|-------|-----------------------------------------------|-------:|---------------------------------------------------------------------------|
| 131008| Required parameter missing (наш payload-баг)  | **620**| US SMB campaign · Myra Curvera + Bala Bangle x2 - ~200/номер              |
| 131026| Message Undeliverable (нет WhatsApp)          | 69     | Greece Medspa - 30/30 на одном номере (мёртвая база)                      |
| 135000| Generic user error                            | 48     | Родственник 131008                                                        |
| **471**| **Spam Rate Limit hit**                      | **35** | UK Carrots · Kartik `447401573177` - 35 fails из 394 sent (**8.9%**)      |
| 131031| Business Account locked                       | 5      | Greece Kartik `306976333065` - **BM уже залочен Meta**                    |
| 470   | Re-engagement >24h                            | 2      | мелочь                                                                    |

### Самые "горящие" номера

| Phone           | Owner          | Sent | Failed | %      | Комментарий                                       |
|-----------------|----------------|-----:|-------:|-------:|---------------------------------------------------|
| `447401573177`  | Kartik (UK)    | 394  | 38     | 9.6%   | **35x #471** - вывести из ротации на 48ч           |
| `306976333065`  | Kartik (Greece)| 930  | 35     | 3.8%   | **5x #131031 (locked)** - в карантин, BM appeal    |
| `12232681516`   | Bala (US)      | 206  | 202    | 98%    | 100% payload-баг #131008 - **не Meta**             |
| `18649013748`   | Bala (US)      | 202  | 201    | 99%    | 100% payload-баг                                   |
| `16062904573`   | Myra (US)      | 202  | 204    | 100%   | 100% payload-баг                                   |

---

## 2. SOP

### A. Pre-flight: чистка базы
- Greece-кейс: 30/30 undeliverable на одном номере = база без WhatsApp.
- Перед запуском: HLR/WA-check на сэмпле **50 контактов**. Если >10% undeliverable - стоп, чистим CSV.
- В runtime: если первые **100 sent** дают >5% #131026 - кампания на pause, ручной review.

### B. Warmup и ramp
- UK Kartik словил #471 после ~390 sent за период.
- На новом номере: **≤200/день первые 3 дня**, +100/день, пока quality rating не подтверждён HIGH.
- Текущий per-number quota = 200/день - оставляем как baseline.
- **Circuit breaker:** если на номере >2% #471 или >1% #131031 за 24ч - автоматический pause на 48ч.

### C. Real-time quality monitoring
| Trigger                                | Действие                                              |
|----------------------------------------|--------------------------------------------------------|
| 3+ #471 за час на одном номере         | Slack alert + автопауза на 48ч                         |
| Любой #131031                          | Номер в blacklist + ручной review BM                   |
| #131008 > 50/час                       | Алерт "payload broken" - стоп всех кампаний на app     |
| #131026 > 5% от sent на кампании       | Pause кампании - база гнилая                           |

Дашборд **Fleet Health** должен показывать per-number:
- `failed_rate_24h`, `spam_471_count_24h`, `last_locked_at`
- цвета: >2% red, >1% amber, <1% green

### D. Контент / payload
- 620 #131008 = **наш баг отправки**, не Meta.
- В LaunchWizard добавить **smoke-test**: до старта slать 5 сообщений на internal-контакты, ждать `event_type='sent'`. Без прохождения - кампания не стартует.
- Templates: ротация 3-5 вариантов на BM (best practice from Meta docs - на наших данных ещё не подтверждено).

### E. Recovery протокол: #471 (Spam Rate Limit)
1. **Stop** рассылку с номера на **48 часов**. Meta восстанавливает quality rating обычно за 24-72ч.
2. Не выкидывать номер - после паузы запустить **warmup-кампанию на тёплую базу** (текущие лиды, кто отвечал) на 50 сообщений/день × 3 дня.
3. Только после **3 чистых дней без #471** - возврат к 200/день.
4. Если #471 повторяется - quality rating "LOW", Meta понизит tier (10k → 1k → 250 → 50). Перевести номер на nurture-only.

### F. Recovery протокол: #131031 (BM locked)
1. Номер в карантин **немедленно**.
2. В Meta Business Suite → Account Quality → подать **appeal** с указанием use case.
3. **Все остальные номера этого BM** убрать из активной рассылки на время review (риск каскадного бана).
4. После unlock - не возвращать на ту же базу/template, которые вызвали лок.

---

## 3. Что НЕ в этом SOP (нет данных)
- Оптимальное время суток для отправки - нет per-hour reply-rate breakdown.
- Влияние длины сообщения / эмодзи на spam-флаги - все шаблоны похожие, сравнивать не на чем.
- Tier upgrade triggers (250 → 1k → 10k) - истории апгрейдов в БД нет.

Добавим, когда наберём 30+ дней истории.

---

## 4. Что построить в админке (next steps)
1. **Fleet Health дашборд** - колонки `spam_471_24h`, `locked_count`, `failed_rate_pct`, цветовые индикаторы.
2. **Auto-pause cron** - SQL trigger / pg_cron job, который пишет `whatsapp_numbers.paused_until = now() + interval '48h'` при срабатывании трешхолдов из таблицы C.
3. **Pre-flight smoke-test в LaunchWizard** - блокирующий чек до запуска кампании.
4. **Slack alert** edge function `whatsapp-error-monitor` на #471, #131031, #131008 burst.

---

## Appendix · Queries для перепроверки

### Топ ошибок за 14 дней
```sql
SELECT error_code, error_message, COUNT(*) AS cnt
FROM whatsapp_message_events
WHERE error_code IS NOT NULL
  AND created_at > now() - interval '14 days'
GROUP BY error_code, error_message
ORDER BY cnt DESC;
```

### Per-number health (failed rate)
```sql
SELECT wn.display_name, wn.phone_number,
  COUNT(*) FILTER (WHERE event_type='sent')   AS sent,
  COUNT(*) FILTER (WHERE event_type='failed') AS failed,
  COUNT(*) FILTER (WHERE error_code='471')    AS spam_471,
  COUNT(*) FILTER (WHERE error_code='131031') AS locked
FROM whatsapp_message_events wme
JOIN whatsapp_numbers wn ON wn.id = wme.whatsapp_number_id
WHERE wme.created_at > now() - interval '14 days'
GROUP BY wn.display_name, wn.phone_number
ORDER BY failed DESC;
```
