# Статус развёртывания CSQTT на Xiaomi Mi Router 3G (MT7621)

> Снимок на 2026-11-09. Работа приостановлена на этапе «сервер не отвечает на GETCONF».
> Диагностические скрипты: [`docs/diagnostics/`](docs/diagnostics/).

## 1. Что сделано и работает

| Компонент | Состояние |
|---|---|
| Прошивка | OpenWrt **25.12.5** r33051-f5dae5ece4 (чистая, `sysupgrade -n`, сеть восстановлена вручную) |
| LAN / WiFi | 192.168.5.1/24, `Keenetic-0922` (оба радио), DHCP — работают |
| `luci-app-csqtt` 2.0-r1 | установлена (arch `noarch`, двухпоточный apk v2), LuCI → Службы → CSQTT |
| `csqtt-core-2.1.9` + `csqtt-core-2.5.1` | установлены оба; активно ядро 2.5.1 (`/usr/libexec/csqtt/csqtt-core-2.5.0`) |
| Сервис `csqtt` | enabled, запущен, конфиг восстановлен из бэкапа (`prof_lv_velopit_ru`) |
| `luci-app-ssclash` 4.7.1 + mihomo v1.19.33 | enabled, запущен, конфиг пользователя восстановлен |
| `luci-app-ttyd` | enabled, запущен |
| Интернет для LAN | **работает через Sub Proxy** (временно, см. §5) |

Конфиг туннеля (восстановлен из предпрошивочного бэкапа):
peer `lv.velopit.ru:46000`, VK-ссылка `…/call/join/KaahsJncWEzOhwsozPzdOp6se3TCnX6RW3qfU1AV5K4`,
workers 3, obfs audio, turn udp, srtp auto, fingerprint chrome, vk-auth `vkcalls`, listen `127.0.0.1:9000`, tun `csqtt0` mtu 1300.

## 2. Главная проблема: туннель не поднимается (GETCONF silence)

**Симптом:** `csqtt0` поднят, но без IPv4; трафика 0; clash-нога `CSQTT` (direct через `interface-name: csqtt0`) — Timeout.

**Что работает на клиенте (проверено, всё ОК):**
1. VK Auth `vkcalls`: step1–step4 успешны, получены anonymous_token, session_key, 2 TURN-URL.
2. TURN-аллокации на ретрансляторах VK (`90.156.236.101`, `91.231.135.141`) активны, ChannelBind 0x4000 установлен.
3. DTLS-рукопожатие **успешно** (ECDSA P-256, профиль SRTP согласован) по всем воркерам.

**Где обрыв:** после DTLS клиент шлёт регистрацию `GETCONF:<port>|<пароль>|<gen>|<salt>|<worker>|<count>`
по зашифрованному каналу (client → VK TURN relay → `lv.velopit.ru:46000`) — **сервер не отвечает никогда**:
ни `TUNCONF`, ни `NOCONF`, ни `DENIED:*` (ни wrong_password, ни protocol_mismatch).
Лог: `[GETCONF][RETRY] Нет подтверждения, N попытка восстановления`, воркеры перезапускают хендшейк по кругу.

**Проверено обе линии протокола** — результат одинаков:
- ядро **2.5.1** (формат без device_id): `GETCONF:9000|<pwd>|0||1|3` — молчание;
- ядро **2.1.9** (старый формат с device_id и маркером `CSQTT-WIRE-3`, запущено вручную с корректными флагами): `FATAL_HANDSHAKE: сервер не подтвердил конфигурацию после 3 попыток` — молчание.

**Вывод: клиентская сторона полностью исправна. Проблема на сервере `lv.velopit.ru:46000`** —
он завершает DTLS (транспорт жив), но прикладной уровень не отвечает ни на один известный формат регистрации.

## 3. Что проверить на сервере (VPS `lv.velopit.ru`, 169.40.2.6)

- [ ] Жив ли процесс csqtt-сервера; что в его логах — видит ли он входящие DTLS/GETCONF.
- [ ] Версия сервера: если она не 2.1.9 и не 2.5.x — оба наших клиента ему «чужие».
- [ ] Совпадает ли пароль подключения (у клиента — из `option password` в `/etc/config/csqtt`).
- [ ] UDP 46000 открыт снаружи (на него ретранслирует VK TURN).
- [ ] Не завис ли сервер: DTLS принимает, но обработчик регистрации мёртв → помогает рестарт.
- [ ] Актуальна ли VK-ссылка (клиентская сторона по ней успешно получает TURN, но проверить стоит).

## 4. Найденные подводные камни (важно для понимания)

- **`/var/run/csqtt/status.json` — заглушка**: пишется `stats.rs` ядра 2.5.0 с захардкоженными
  `address: 10.66.67.5`, `name: "SkyPass NL Primary"`, `workers.configured: 10`.
  Реально значимы только `active/bytes` (всегда 0) и `uptime`. **Не ориентироваться по нему.**
- Логи ядра — через `logread` (tag `run-core.sh[pid]`), файл `/var/log/csqtt.log` пуст.
- Для реального статуса смотреть: `logread | grep run-core`, `ip -4 addr show csqtt0`, счётчики пакетов.
- Назначение IP на `csqtt0` делает ядро по событию `TUNCONF:` от сервера (`dispatcher.configure_tun` → `SIOCSIFADDR`). Нет TUNCONF — нет IP.
- Формат GETCONF различается между 2.1.9 и 2.5.x (см. исходники `core219/source`, `core251/source`, файл `protocol.rs`). Xiaomi-сборка 2.5.0 (`csqtt-owrt-panel-xiaomi-mi-router-3g-v1`) использует тот же формат, что и наша 2.5.1.

## 5. Временное состояние clash (вернуть после оживления CSQTT)

В конфиге пользователя `Main Proxy` (fallback) → `CSQTT` (direct через csqtt0). Пока туннель мёртв,
DNS-цепочка (dnsmasq → clash:7874 → DoH через `#Main Proxy`) ломалась. Выполнен runtime-переключатель:

```
curl -X PUT -H "Content-Type: application/json" -d '{"name":"Sub Proxy"}' http://127.0.0.1:9090/proxies/Main%20Proxy
```

Файл конфига не менялся. **Вернуть как было:** LuCI → SSClash → выбрать `Main Proxy` → `CSQTT`
(или тот же PUT с `{"name":"CSQTT"}`). Скрипт: `docs/diagnostics/interim-subproxy.mjs`.

## 6. Напоминания по безопасности

- **Пароль root на роутере НЕ задан** (пустой) — задать: `passwd` или LuCI → System → Administration.
- **Отозвать GitHub classic PAT** (`Loraen89`, использовался для релизов) после завершения всех работ: GitHub → Settings → Developer settings → Personal access tokens.
- Токен нигде не сохранён в git-ремоутах/репозитории (пуши шли через `http.extraHeader`).

## 7. Что осталось доделать

1. **Починить сервер** `lv.velopit.ru:46000` (§3) — после этого клиент подключится сам:
   сервис `csqtt` работает и бесконечно ретраит, рестарт не нужен. Признак успеха:
   `ip -4 addr show csqtt0` покажет туннельный IP, в logread появится `[ТУННЕЛЬ] Tunnel IP: …`.
2. Вернуть `Main Proxy` → `CSQTT` в clash (§5) и проверить e2e с ПК:
   `curl --interface <IP ПК> https://api.ipify.org` — должен вернуть IP туннеля.
3. Переустановить AmneziaWG (конфиг и ключи — в бэкапе `D:\mt7621-emu\backups\keep\network`).
4. Задать пароль root, отозвать GitHub токен (§6).
5. Бэкапы: `D:\mt7621-emu\backups\backup-pre-flash-25.12.5.tar.gz` (полный предпрошивочный), `backups\keep\` (configs: network, wireless, dhcp, csqtt, clash-config.yaml).
