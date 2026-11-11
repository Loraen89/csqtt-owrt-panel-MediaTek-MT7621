# Поддержка OpenWrt 24.10 (opkg/IPK)

Этот документ описывает, как в проекте устроена поддержка OpenWrt 24.10.x
пакетным менеджером `opkg` и форматом `ipk`, и в чём отличия от OpenWrt 25.12.x (apk).

## Отличия целевых релизов

| | OpenWrt 25.12.x | OpenWrt 24.10.x |
|---|---|---|
| Пакетный менеджер | `apk` (apk-tools v2) | `opkg` |
| Формат пакетов | `*.apk` (конкатенированные gzip-потоки: control + data) | `*.ipk` (ar-архив: `debian-binary`, `control.tar.gz`, `data.tar.gz`) |
| Архитектура noarch-пакета | `noarch` | `all` |
| Конфиги пакета | разрешение конфликтов средствами apk (`*.apk-new`) | `conffiles` в control: opkg сохраняет существующий файл и не затирает его |
| Lifecycle | `.post-install` / `.post-upgrade` в control-потоке | `postinst` / `prerm` / `postrm` в `control.tar.gz` |
| Каталог кеша LuCI | `/tmp/luci-indexcache` | `/tmp/luci-indexcache*` (хешированные каталоги) |

Общее: целевая архитектура `mipsel_24kc` (MediaTek MT7621, ramips), procd, ubus/ubus-rpc,
ucode, LuCI client-side rendering. Ядра CSQTT 2.1.9 и 2.5.1 собраны статически
с musl (MIPS32r2 soft-float) и не зависят от версии libc хоста — один и тот же
ELF-файл упаковывается и в APK, и в IPK.

## Как собираются IPK

`luci-app-csqtt/build-package.mjs` собирает шесть пакетов в `dist/`: три APK
(OpenWrt 25.12.x) и три IPK (OpenWrt 24.10.x). Сборщик IPK написан на Node.js
без SDK, формат ar реализован вручную.

Control-файл IPK панели:

- `Package: luci-app-csqtt`, `Version: 2.0-r10`, `Architecture: all`;
- `Depends: luci-base, rpcd-mod-ucode, ucode-mod-fs, ucode-mod-uci, curl`;
- `conffiles`: `/etc/config/csqtt`;
- `postinst`: включение автозапуска службы при новой установке, очистка кеша
  LuCI (`rm -rf /tmp/luci-indexcache*`), перезапуск `rpcd`;
- `prerm`: запоминание состояния автозапуска в `/var/run/csqtt-autostart-flag`
  и остановка службы;
- `postrm`: удаление флага автозапуска.

Порядок opkg при обновлении: `prerm` (старого пакета) → удаление файлов
(conffiles сохраняются) → распаковка нового → `postinst` (нового пакета).
Благодаря флагу поведение совпадает с APK-вариантом: при новой установке
служба включается в автозапуск, при обновлении — сохраняется прежнее состояние
(включённое остаётся включённым, отключенное — отключённым).

Ядра (`csqtt-core-2.1.9`, `csqtt-core-2.5.0`) поставляются без скриптов —
только исполняемый файл и лицензии; зависимость одна: `kmod-tun`.

## Проверки

- `node tools/verify-panel.mjs` — если IPK-набор собран, дополнительно
  проверяет структуру ar, поля control, conffiles, lifecycle-скрипты,
  лицензионные уведомления и совпадение ELF ядер с локальными бинарниками.
- `node tools/test-reproducible.mjs` — все шесть пакетов должны собираться
  байт-в-байт одинаково при LF и CRLF рабочем дереве.
- `sh tools/test-shell.sh <project>` на Linux/OpenWrt — интеграционный прогон
  установщиков с поддельными `apk`/`opkg`.

## Что проверить на устройстве с 24.10.x

1. `opkg update` и установка через `install-from-github.sh --core both`.
2. Установка по IPK из `dist/` через `install-csqtt.sh`.
3. `ubus call csqtt access_check`, страницы LuCI (статус, логи, профили).
4. Установка обновления поверх с отключённым автозапуском — состояние
   должно сохраниться; с включённым — включённым остаться.
5. `uninstall-csqtt.sh` — конфиг сохраняется в `/etc/config/csqtt.backup`.

## Ограничения

- В OpenWrt 24.10 зависимости (`rpcd-mod-ucode`, `ucode-mod-fs`, `ucode-mod-uci`,
  `kmod-tun`, `curl`) берутся из штатных фидов; если фиды недоступны, установка
  прерывается с подсказкой выполнить `opkg update`.
- Значения по умолчанию нового `/etc/config/csqtt` при обновлении opkg
  не подставляет поверх существующего файла — новые опции появятся после
  `uci set`/через LuCI.
