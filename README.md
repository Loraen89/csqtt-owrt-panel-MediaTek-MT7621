# CSQTT для MediaTek MT7621 (OpenWrt 25.12)

> **Текущий статус развёртывания и диагностика: [STATUS.md](STATUS.md)**
> (сервер lv.velopit.ru не отвечает на GETCONF — разбор и чеклист; скрипты в `docs/diagnostics/`)

Порт пакета **CSQTT** (VK-туннель) на роутеры с SoC **MediaTek MT7621**
(`mipsel_24kc`, musl, MIPS32r2 soft-float): Netis N6, Xiaomi Mi Router 3G
и другие устройства ramips/mt7621 под управлением **OpenWrt 25.12**.

Основано на [csqtt-openwrt](https://github.com/starkugz/csqtt-openwrt) v2.0
(скрипты, конвенции пакетов) и MT7621-адаптациях ядра из приватных репозиториев
Netis N6 / Xiaomi Mi Router 3G. Ядро: [amurcanov/csqtt](https://github.com/amurcanov/csqtt),
лицензия **PolyForm Noncommercial 1.0.0** (см. `LICENSE`, `NOTICE.md`).

## Состав

| Пакет | Файл в `dist/` | Описание |
|---|---|---|
| `csqtt-core-2.1.9` | `csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk` | Ядро 2.1.9 (`2.1.9-mt7621-r1`) |
| `csqtt-core-2.5.0` | `csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk` | Ядро 2.5.1 (`2.5.1-mt7621-r1`) |
| `luci-app-csqtt` | `luci-app-csqtt-2.0-openwrt-25.12.apk` | Панель LuCI 2.0 (arch `all`) |

Оба ядра — статические ELF32 MIPS32r2 o32 soft-float (musl), без внешних
зависимостей, кроме `kmod-tun`. MT7621-патчи: `portable-atomic` вместо
64-битных атомиков, native TUN (`/dev/net/tun`), `--self-test`, режим
демона procd, запись `/var/run/csqtt/status.json` для панели.

## Установка

### Вариант A: напрямую с GitHub (рекомендуется)

Репозиторий приватный, поэтому нужен токен GitHub с доступом на чтение
(classic PAT: scope `repo`; fine-grained: `Contents: read-only`).

```sh
# на роутере (OpenWrt 25.12):
apk add curl
export GITHUB_TOKEN=github_pat_xxx
curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" \
  -o /tmp/install-from-github.sh \
  https://raw.githubusercontent.com/Loraen89/csqtt-owrt-panel-MediaTek-MT7621/main/install-from-github.sh

ash /tmp/install-from-github.sh              # панель + ядро 2.5.1
ash /tmp/install-from-github.sh --core both  # панель + оба ядра
```

Скрипт сам скачает APK из [последнего релиза](https://github.com/Loraen89/csqtt-owrt-panel-MediaTek-MT7621/releases/latest),
проверит SHA256 и установит. Параметр `--ref main` — скачивание из ветки/тега
вместо релиза.

### Вариант B: локально (файлы уже на роутере)

1. Скопируйте содержимое `dist/` и `install-csqtt.sh` на роутер (например, в `/tmp/csqtt`):
   ```sh
   scp -O dist/*.apk dist/SHA256SUMS install-csqtt.sh root@192.168.1.1:/tmp/csqtt/
   ```
   (для Windows-файлов, созданных OpenSSH 9+: флаг `-O` включает legacy-режим scp)
2. На роутере:
   ```sh
   cd /tmp/csqtt
   ash install-csqtt.sh                # панель + ядро 2.5.1 (по умолчанию)
   ash install-csqtt.sh --core 2.1.9   # панель + ядро 2.1.9
   ash install-csqtt.sh --core both    # панель + оба ядра
   ```
3. Откройте LuCI → **Службы → CSQTT (VK-туннель)**, заполните профиль
   (peer/password, VK-хеш) и включите службу.

### Выбор ядра (если установлены оба)

UCI-параметр `csqtt.main.core_version`: `auto` (по умолчанию, предпочитает
2.5.1), `2.1.9`, `2.5.0`/`2.5.1`:

```sh
uci set csqtt.main.core_version='2.1.9'
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
