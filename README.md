# CSQTT-PANEL v2.0

Панель LuCI и клиентские ядра CSQTT для **MediaTek MT7621**, OpenWrt **25.12.x**,
архитектура `mipsel_24kc`. Подходит для Xiaomi Mi Router 3G и Netis N6 v1.

**Ядро и первоисточник:** [amurcanov/csqtt](https://github.com/amurcanov/csqtt).
Этот репозиторий содержит адаптацию панели и упаковку для OpenWrt/MT7621;
авторство ядра не меняется. Подробности — [NOTICE.md](NOTICE.md).

## Установка из репозитория

Публичные файлы можно скачать без GitHub-аккаунта и токена. Команды выполняются
**по SSH на роутере** с OpenWrt 25.12.x, пакетным менеджером `apk` и доступом в интернет.

### Проверенный кандидат r10-rc1

```sh
apk add curl ca-bundle
curl -fsSL -o /tmp/install-from-github.sh \
  https://raw.githubusercontent.com/Loraen89/csqtt-owrt-panel-MediaTek-MT7621/main/install-from-github.sh
ash /tmp/install-from-github.sh --core both --ref v2.0-mt7621-r10-rc1
```

Это **prerelease**, исправляющий найденные ошибки r9. Результаты и ограничения:
[AUDIT.md](AUDIT.md). Программа проверяет SHA256 каждого выбранного APK перед установкой.
Профили сохраняются; настроенные WAN, LAN, Wi-Fi, DHCP и SSClash установщик не меняет.
Сохраните свою резервную копию перед обновлением.

### Последний стабильный GitHub Release

Без `--ref` установщик выбирает GitHub Latest — сейчас это r9, который не содержит
исправлений кандидата r10-rc1:

```sh
ash /tmp/install-from-github.sh --core both
```

Вместо `both` можно указать `2.1.9` или `2.5.0` для установки только одного ядра.
Ветка 2.5.0 использует исправленный бинарник **2.5.1**.
Для приватных зеркал поддерживается необязательная переменная `GITHUB_TOKEN`
с разрешением Contents: read; в публичном репозитории она не нужна.

### Ручная установка APK

Скачайте APK, `SHA256SUMS` и `install-csqtt.sh` из одного выпуска в общую папку
`/tmp/csqtt` на роутере. Для двух ядер нужны все три APK, для одного — панель и выбранное ядро:

```sh
cd /tmp/csqtt
ash install-csqtt.sh --core both
```

## Совместимость с прокси-клиентами

Работает в связке с **SSClash** — проверено с SSClash v4/Mihomo — и аналогичными
прокси-клиентами, которые умеют использовать интерфейс **csqtt0** как выход в сеть.
Панель поднимает CSQTT-туннель, а SSClash или другой клиент выбирает, какой трафик
направлять через него. Сам SSClash, другие прокси-клиенты и подписки в пакет не входят.

## Пакеты и настройка

| Файл в `dist/` | Назначение |
|---|---|
| `luci-app-csqtt-2.0-openwrt-25.12.apk` | Панель CSQTT-PANEL v2.0, кандидат 2.0-r10 |
| `csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk` | Ядро 2.1.9 |
| `csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk` | Ядро 2.5.1; имя пакета `csqtt-core-2.5.0` |

Откройте **LuCI → Службы → CSQTT-PANEL v2.0 → Профили** и импортируйте ссылку.

- Открытая ссылка `csqtt://connect?...` выбирает ядро **2.1.9**.
- Успешно расшифрованная ссылка выбирает **2.5.1**; ядро сохраняется в профиле.
- Транспорт TURN по умолчанию — **UDP**; TCP можно выбрать вручную.
- Общие параметры VK находятся на странице **Туннель и VK**.
- Для одновременных клиентов одного сервера нужны отдельные серверные профили
  с уникальными адресами туннеля.
- Экспорт 2.1.9 работает по HTTP; зашифрованный экспорт 2.5.1 требует HTTPS/WebCrypto.

Ссылки CSQTT, VK-токены и подписки содержат секреты — не публикуйте их.
Ограничения формата шифрования ссылок описаны в [SECURITY.md](SECURITY.md).

## Сборка и проверка

Исходники ядер: `core219/` и `core251/`. Для пересборки нужны Rust, Zig и musl runtime
из OpenWrt SDK. Скрипты принимают путь к установленным инструментам:

```powershell
powershell -File core219/build-mips.ps1 -Jobs 4 -ToolingPath D:/csqtt-tooling
powershell -File core251/build-mips.ps1 -Jobs 4 -ToolingPath D:/csqtt-tooling
```

Первую сборку с загрузкой зависимостей выполняйте с `-Online`. После появления
бинарников в `core219/dist/` и `core251/dist/`:

```sh
node luci-app-csqtt/build-package.mjs
node tools/verify-panel.mjs
node tools/test-export.mjs
node tools/test-logs.mjs
```

Проверка на роутере:

```sh
/usr/libexec/csqtt/csqtt-core-2.1.9 --self-test
/usr/libexec/csqtt/csqtt-core-2.5.0 --self-test
ubus call csqtt access_check
```

Лицензия: [PolyForm Noncommercial 1.0.0](LICENSE).
Ядро и первоисточник: [amurcanov/csqtt](https://github.com/amurcanov/csqtt).
