# Диагностические скрипты (Node.js, ssh2)

Скрипты работы с роутером 192.168.5.1 (root, пустой пароль) через SSH.
Запуск с ПК: `node <script>.mjs` (нужен `npm i ssh2` рядом или глобально).
Секреты (GitHub token, пароль подключения CSQTT) вычищены — подставлять свои.

## Инфраструктура

- `router-lib.mjs` — обёртка ssh2 (`connect/exec/setHost`), tryKeyboard, пустой пароль.

## Проверка пакетов и релиза

- `verify-panel.mjs` — локальная валидация APK панели: два gzip-потока (формат apk v2), `arch`, `datahash`, pax-SHA1 всех файлов, сверка `SHA256SUMS`.
- `update-release.mjs` — замена ассетов (панель + SHA256SUMS) в GitHub-релизе через API.

## Установка и финальные проверки (хронология)

- `finish9.mjs` — установка панели из релиза + восстановление `/etc/config/csqtt` + запуск цепочки csqtt→clash.
- `finish10.mjs` — прогрев и выверка: delay-тест ноги CSQTT, сервисы, DNS.
- `finish11.mjs` — уборка `/tmp` роутера + финальная сверка (пакеты, сервисы, туннель, сеть).

## Диагностика DNS / clash

- `diag-dns.mjs` — почему SERVFAIL под clash (dnsmasq → 7874, апстримы DoH через `#Main Proxy`).
- `diag-dns2.mjs` — провайдеры подписок, порты clash, API `/proxies`.
- `diag-dns3.mjs` — группы и текущий выбор (`Main Proxy → CSQTT`).

## Диагностика туннеля CSQTT

- `diag-captcha.mjs` — события/капча/ошибки, e2e через цепочку.
- `diag-csqtt-leg.mjs` — состояние `csqtt0` (нет IPv4!), порт 9000, delay через API.
- `diag-csqtt2.mjs` — ubus-методы, event-лог без шума.
- `diag-status.mjs` — `/var/run/csqtt/status.json` (ВНИМАНИЕ: заглушка с хардкодом, см. STATUS.md §4).
- `diag-after-dtls.mjs` — лог после последнего DTLS-успеха.
- `diag-mid.mjs` — окно лога + счётчики сообщений (там видно `[GETCONF][RETRY] Нет подтверждения`).
- `diag-peer-dns.mjs` — резолв `lv.velopit.ru` напрямую через публичные DNS.

## Эксперименты с ядрами

- `try-219.mjs` — переключение `core_version` на 2.1.9 через uci (не взлетело: init.d шлёт флаги 2.5.x).
- `try-219-manual.mjs` — ручной запуск 2.1.9 с корректными флагами (подставить пароль).
  Результат: сервер молчит и на старый формат GETCONF — см. STATUS.md §2.
- `back-251.mjs` — возврат на ядро 2.5.1.
- `restore-251.mjs` — убить тестовое ядро, вернуть сервис 2.5.1, посмотреть бутстрап VK-авторизации.

## Временное переключение прокси

- `interim-subproxy.mjs` — runtime-переключение `Main Proxy` → `Sub Proxy` через API clash,
  чтобы LAN/DNS работали, пока CSQTT ждёт сервер. Конфиг не меняется.
- `interim-direct.mjs` — **актуальное** интерим-состояние: clash остановлен+disabled,
  dnsmasq возвращён на WAN-DNS. LAN ходит напрямую. Применено, т.к. мертвы оба прокси-пути
  (сервер CSQTT + истёкшая подписка BURGER).

## Позднейшая диагностика (2026-11-09, вечер)

- `probe-state.mjs` — быстрая сверка состояния роутера с целевым (прошивка, пакеты, сервисы, сеть).
- `fix-clash.mjs` — возврат clash в enabled+running, проверка csqtt0 и ноги CSQTT.
- `diag-clash-groups.mjs` — группы clash, живость членов, файл провайдера.
- `diag-subproxy.mjs` — члены Sub Proxy и delay-тесты (обнаружено: только инфо-узлы!).
- `diag-provider.mjs` — содержимое `lastdep.yaml`: заглушка Remnawave = подписка истекла.
- `diag-pc-path.mjs` — почему LAN-клиент не выходит в интернет (проверка nft/NAT/маршрутов роутера).
