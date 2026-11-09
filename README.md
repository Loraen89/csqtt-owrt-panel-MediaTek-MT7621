# CSQTT-PANEL v2.0

Панель LuCI и ядра CSQTT для **MediaTek MT7621**, OpenWrt **25.12.x**,
архитектура `mipsel_24kc`. Подходит для Xiaomi Mi Router 3G и Netis N6 v1.

## Пакеты

| Файл в `dist/` | Содержимое |
|---|---|
| `luci-app-csqtt-2.0-openwrt-25.12.apk` | Панель CSQTT-PANEL v2.0 2.0-r9 |
| `csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk` | Ядро 2.1.9 |
| `csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk` | Ядро 2.5.1; внутреннее имя пакета `csqtt-core-2.5.0` |

Имена пакетов и UCI-пространство `csqtt` сохранены для обновления без потери профилей.
Контрольные суммы находятся в `dist/SHA256SUMS`.

## Установка

Репозиторий приватный: скачайте файлы с авторизацией на компьютере.
Скопируйте три APK, `SHA256SUMS` и `install-csqtt.sh` в `/tmp/csqtt` на роутере:

```sh
cd /tmp/csqtt
ash install-csqtt.sh --core both
```

Вместо `both` можно указать `2.1.9` или `2.5.0` для установки одного ядра.
Для установки через GitHub API предусмотрен `install-from-github.sh`;
авторизация — переменная `GITHUB_TOKEN` с доступом Contents: read.
Не сохраняйте токен в исходниках и профилях.

## Настройка

Откройте **LuCI → Службы → CSQTT-PANEL v2.0 → Профили** и импортируйте ссылку.

- Открытая ссылка `csqtt://connect?...` выбирает ядро **2.1.9**.
- Успешно расшифрованная ссылка выбирает **2.5.1**.
- Ядро сохраняется в профиле; ошибочный импорт настройки не меняет.
- Транспорт TURN по умолчанию — **UDP**; TCP выбирается вручную.
- Общие параметры VK находятся на странице **Туннель и VK**.

Для одновременных клиентов одного сервера используйте отдельные серверные
профили с уникальными адресами туннеля.

## Сборка и проверка

Исходники ядер находятся в `core219/` и `core251/`. Нужны Rust, Zig и musl runtime
из OpenWrt SDK. Скрипты сборки принимают путь к инструментам:

```powershell
powershell -File core219/build-mips.ps1 -Jobs 4 -ToolingPath D:/csqtt-tooling
powershell -File core251/build-mips.ps1 -Jobs 4 -ToolingPath D:/csqtt-tooling
```

Первую сборку с загрузкой зависимостей выполняйте с `-Online`.
После появления бинарников в `core219/dist/` и `core251/dist/`:

```sh
node luci-app-csqtt/build-package.mjs
node tools/verify-panel.mjs
```

Проверка на роутере:

```sh
/usr/libexec/csqtt/csqtt-core-2.1.9 --self-test
/usr/libexec/csqtt/csqtt-core-2.5.0 --self-test
ubus call csqtt access_check
```

Лицензия и авторство: [LICENSE](LICENSE), [NOTICE.md](NOTICE.md).
