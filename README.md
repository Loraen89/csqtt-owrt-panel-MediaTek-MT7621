# CSQTT для MediaTek MT7621 · OpenWrt 25.12

Готовый комплект APK для запуска **CSQTT (VK-туннель)** на роутерах с SoC
**MediaTek MT7621**: Netis N6 v1, Xiaomi Mi Router 3G и других устройствах
`ramips/mt7621`. Целевая архитектура — `mipsel_24kc`, MIPS32r2 o32
soft-float, musl, пакетный менеджер `apk` из OpenWrt 25.12.

Комплект состоит из панели LuCI и двух независимых пакетов ядра. При установке
можно выбрать 2.1.9, 2.5.0 либо оба ядра; ненужное ядро не скачивается.

Основано на [csqtt-openwrt](https://github.com/starkugz/csqtt-openwrt) v2.0
(скрипты, конвенции пакетов) и MT7621-адаптациях ядра из приватных репозиториев
Netis N6 / Xiaomi Mi Router 3G. Ядро: [amurcanov/csqtt](https://github.com/amurcanov/csqtt),
лицензия **PolyForm Noncommercial 1.0.0** (см. `LICENSE`, `NOTICE.md`).

## Состав

| Пакет | Файл в `dist/` | Описание |
|---|---|---|
| `csqtt-core-2.1.9` | `csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk` | Ядро 2.1.9 (`2.1.9-mt7621-r1`) |
| `csqtt-core-2.5.0` | `csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk` | Ветка 2.5.0, исправленный бинарник 2.5.1 (`2.5.1-mt7621-r1`) |
| `luci-app-csqtt` | `luci-app-csqtt-2.0-openwrt-25.12.apk` | Панель LuCI 2.0-r6 (arch `noarch`) |

Оба ядра — статические ELF32 MIPS32r2 o32 soft-float (musl), без внешних
зависимостей, кроме `kmod-tun`. MT7621-патчи: `portable-atomic` вместо
64-битных атомиков, native TUN (`/dev/net/tun`), `--self-test`, режим
демона procd, запись `/var/run/csqtt/status.json` для панели.

Панель `2.0-r2` добавила ручную проверку HTTPS через `csqtt0` к OpenWrt,
GitHub, Cloudflare или Google. Результат действует пять минут, не меняет UCI,
маршруты, DNS, firewall или конфигурацию SSClash. Подробности и результаты
проверки: [`docs/RELEASE-NOTES-2.0-r2.md`](docs/RELEASE-NOTES-2.0-r2.md).

Панель `2.0-r3` исправляет упаковку shell-скриптов на Windows: init-скрипт и
обёртка ядра всегда попадают в APK с окончаниями строк LF. Исправление
проверено установкой на реальный Netis N6 v1 с OpenWrt 25.12.5; подробности:
[`docs/RELEASE-NOTES-2.0-r3.md`](docs/RELEASE-NOTES-2.0-r3.md).

Панель `2.0-r4` исправляет работу выбранного ядра 2.1.9: RPC проверки хешей
и импорта ссылок теперь использует бинарник из `core_version`, а init-скрипт
передаёт каждому ядру только поддерживаемые им параметры. Исправление
проверено на реальном Netis N6 v1: сервис 2.1.9 запущен, 27 воркеров готовы,
проверка VK-хешей завершилась `3/3 valid`. Подробности:
[`docs/RELEASE-NOTES-2.0-r4.md`](docs/RELEASE-NOTES-2.0-r4.md).

Панель `2.0-r5` переносит актуальную визуальную тему из официального
`starkugz/csqtt-openwrt` 2.0 без замены MT7621-совместимого backend. Импорт
проверяет тип и содержимое ссылки до записи UCI: открытая ссылка
`csqtt://connect?...` выбирает ядро `2.1.9`, успешно расшифрованная ссылка
выбирает `2.5.0` (пакет с исправленным бинарником 2.5.1). Ошибочная ссылка
не меняет `core_version`. Ядро сохраняется в самом профиле, показывается в
его карточке и используется при ручном или автоматическом переключении.
Подробности и локальные проверки приведены в
[`docs/RELEASE-NOTES-2.0-r5.md`](docs/RELEASE-NOTES-2.0-r5.md).

Панель `2.0-r6` упрощает индикаторы на странице статуса: рамки и фоновые
плашки убраны, состояния показываются цветным полужирным текстом, а интервалы
между строками увеличены для чтения. Подробности:
[`docs/RELEASE-NOTES-2.0-r6.md`](docs/RELEASE-NOTES-2.0-r6.md).

Результаты 15-минутного теста Netis N6 с российскими, зарубежными и смешанными
потоками, а также воспроизводимый сценарий мониторинга приведены в
[`docs/LOAD-TEST-2026-11-09.md`](docs/LOAD-TEST-2026-11-09.md).

## Как устроен выбор ядра

Это не один APK со встроенными двумя бинарниками:

- панель `luci-app-csqtt` устанавливается всегда;
- `--core 2.1.9` устанавливает только `csqtt-core-2.1.9`;
- `--core 2.5.0` устанавливает только пакет `csqtt-core-2.5.0` с бинарником
  версии 2.5.1;
- `--core both` устанавливает оба пакета и задаёт `core_version=auto`, при
  котором сначала выбирается 2.5.0/2.5.1, затем 2.1.9.

Без параметра установщик показывает интерактивный выбор. В автоматическом
неинтерактивном запуске используется 2.5.0.

## Установка

### Напрямую из GitHub Releases

Дополнительный ключ подписи APK добавлять не требуется: установщик скачивает
только выбранные пакеты, сверяет их с `SHA256SUMS` и после этого передаёт
локальные APK в `apk add --allow-untrusted`.

Для полностью анонимной установки без GitHub-токена сам репозиторий и его
Release должны быть публичными. Пока репозиторий имеет видимость `PRIVATE`,
GitHub не отдаёт исходный скрипт и Release Assets анонимному роутеру — в этом
режиме неизбежна авторизация `GITHUB_TOKEN` либо локальное копирование файлов.

Когда репозиторий публичный, установка без токена выглядит так:

```sh
apk add curl
curl -fsSL -o /tmp/install-from-github.sh \
  https://github.com/Loraen89/csqtt-owrt-panel-MediaTek-MT7621/releases/latest/download/install-from-github.sh

ash /tmp/install-from-github.sh                 # интерактивный выбор
ash /tmp/install-from-github.sh --core 2.1.9    # только 2.1.9
ash /tmp/install-from-github.sh --core 2.5.0    # только 2.5.0/2.5.1
ash /tmp/install-from-github.sh --core both     # оба ядра
```

Для текущего приватного режима задаётся токен только на чтение
(`Contents: read-only`) и передаётся при первоначальном скачивании скрипта:

```sh
export GITHUB_TOKEN='github_pat_...'
curl -fsSL \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.raw+json" \
  -o /tmp/install-from-github.sh \
  'https://api.github.com/repos/Loraen89/csqtt-owrt-panel-MediaTek-MT7621/contents/install-from-github.sh?ref=main'
ash /tmp/install-from-github.sh --core both
```

Скрипт берёт APK из [последнего GitHub Release](https://github.com/Loraen89/csqtt-owrt-panel-MediaTek-MT7621/releases/latest).
Параметр `--ref main` предназначен для тестирования файлов `dist/` из ветки
или тега вместо последнего релиза.

### Локальная установка

1. Скопируйте содержимое `dist/` и `install-csqtt.sh` на роутер (например, в `/tmp/csqtt`):
   ```sh
   scp -O dist/*.apk dist/SHA256SUMS install-csqtt.sh root@192.168.1.1:/tmp/csqtt/
   ```
   (для Windows-файлов, созданных OpenSSH 9+: флаг `-O` включает legacy-режим scp)
2. На роутере:
   ```sh
   cd /tmp/csqtt
   ash install-csqtt.sh                # интерактивный выбор
   ash install-csqtt.sh --core 2.1.9   # панель + ядро 2.1.9
   ash install-csqtt.sh --core 2.5.0   # панель + ядро 2.5.0/2.5.1
   ash install-csqtt.sh --core both    # панель + оба ядра
   ```
3. Откройте LuCI → **Службы → CSQTT (VK-туннель)**, заполните профиль
   (peer/password, VK-хеш) и включите службу.

### Выбор ядра (если установлены оба)

UCI-параметр `csqtt.<profile>.core_version` задаёт ядро конкретного профиля:
`2.1.9` для открытых ссылок, `2.5.0`/`2.5.1` для зашифрованных. Если параметр
профиля отсутствует или равен `auto`, используется `csqtt.main.core_version`;
глобальный `auto` предпочитает установленное ядро 2.5.1:

```sh
uci set csqtt.profile1.core_version='2.1.9'
uci commit csqtt
/etc/init.d/csqtt restart
```

## Проверка ядра на устройстве

Ядро содержит офлайн-самотест (атомики, HKDF wire-vector, TUN):

```sh
/usr/libexec/csqtt/csqtt-core-2.5.0 --self-test
/usr/libexec/csqtt/csqtt-core-2.1.9 --self-test
```

## Удаление

```sh
ash uninstall-csqtt.sh           # конфиг сохраняется в /etc/config/csqtt.backup
ash uninstall-csqtt.sh --purge   # удалить всё, включая конфигурацию
```

## Структура репозитория

- `core219/` — исходники ядра 2.1.9 (upstream v2.1.9 + MT7621-патчи) и
  сборочный конвейер `build-mips.ps1` (Windows: Rust 1.97.1 + Zig 0.15.2 +
  CMake/Ninja + musl runtime из OpenWrt SDK 25.12.0 ramips/mt7621).
- `core251/` — исходники ядра 2.5.1 (2.5.0 + MT7621-патчи), тот же конвейер.
- `luci-app-csqtt/` — панель LuCI (дебрендированная, без сторонних метрик)
  и `build-package.mjs` — упаковка трёх APK в `dist/`.
- `dist/` — готовые APK и `SHA256SUMS`.

### Пересборка ядер (Windows)

Требуется tooling-каталог (Rust 1.97.1 gnu + rust-src, Zig 0.15.2, CMake,
Ninja, musl runtime из OpenWrt SDK). Путь передаётся параметром:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core219\build-mips.ps1 -Jobs 4 -ToolingPath D:\csqtt-tooling
powershell -NoProfile -ExecutionPolicy Bypass -File core251\build-mips.ps1 -Jobs 4 -ToolingPath D:\csqtt-tooling
```

Первая сборка требует сеть (кэш build-std): добавьте `-Online`.
Проверка результата: `node core219\verify-elf.mjs <binary>`.

### Пересборка APK

```sh
node luci-app-csqtt/build-package.mjs   # читает core*/dist/*, пишет dist/
```

## Совместимость

- Целевая платформа: `ramips/mt7621`, пакеты `mipsel_24kc`.
- Проверено по образцу Netis N6 и Xiaomi Mi Router 3G (OpenWrt 25.12.x, apk-tools 3).
- Панель не меняет firewall, таблицу маршрутизации, WAN/LAN и системный DNS.
- Только CSQTT: без router-metrics, podkop и прочих интеграций.
