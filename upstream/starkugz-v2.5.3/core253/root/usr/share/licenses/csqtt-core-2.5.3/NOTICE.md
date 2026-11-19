# Уведомления и лицензия — клиентское ядро 2.5.3

Этот каталог содержит снимок upstream-клиента CSQTT 2.5.3
(`reference/afteroid-2.5.3`, ревизия
`84a2ce84dd4ac0716ceabd1b9a9ae455e6e86806`) плюс документированные патчи
OpenWrt (`core-2.5.3/patches/`). Поле `version` в `rust-client/Cargo.toml`
остаётся техническим значением снимка (`2.5.0`); продуктовое имя ядра —
2.5.3 (`core-2.5.3/UPSTREAM.md`).

## Встроенная зависимость Gooby

`rust-client/vendor/gooby` распространяется по **Apache License 2.0**
(`LICENSE` и `NOTICE` в каталоге Gooby). Gooby входит в ядро обязательно, но
по умолчанию выключен в настройках (`runtime-off`) и обрабатывает только явно
включённый TURN TCP/TLS.

Поскольку код Gooby компилируется в бинарник, текст лицензии и NOTICE
устанавливаются вместе с пакетом в
`/usr/share/licenses/csqtt-core-2.5.3/gooby/` (`LICENSE`, `NOTICE`).

## Применимая лицензия

Применимый лицензионный документ — **PolyForm Noncommercial License 1.0.0**
(файл `LICENSE`, скопирован из корня upstream-снимка без изменений). Он
содержит обязательные уведомления (Required Notice):

> Required Notice: Copyright 2026 amurcanov.
> Required Notice: Commercial use of CSQTT requires a separate written license
> from the licensor.
> Required Notice: Redistributions and derivative works must retain attribution
> to the original CSQTT project and these notices.

Эти уведомления сохраняются в исходниках (этот файл и `LICENSE`) и должны
сохраняться в пакете (см. `Development/openwrt/` — установка `LICENSE`/`NOTICE`
в `/usr/share/licenses/`).

## Прочие сторонние крейты

Транспорт собирается из `Cargo.lock` и содержит сторонние крейты (MIT,
Apache-2.0, ISC, BSD и совместимые). Их тексты не дублируются в этом пакете:
полный перечень версий фиксируется `Cargo.lock`, а авторские уведомления
доступны в исходниках соответствующих версий. Формирование сводного
THIRD-PARTY-NOTICES для публичной поставки — задача релизного этапа (056);
в 053 перечень зависимостей и лицензий проверен статически (RESULT, 1.3).

## Расхождение в метаданных upstream (не используем как основание)

Крейт `rust-client/Cargo.toml` в upstream содержит `license = "Unlicense"`, а
корневой файл `LICENSE` того же коммита — PolyForm Noncommercial 1.0.0 с
Required Notice. Это **внутреннее противоречие upstream**. Применяется
корневой `LICENSE` (PolyForm Noncommercial): поле `license` в
`Cargo.toml` не является лицензионным документом и противоречит корневому
файлу. Публичный выпуск не должен опираться на `Unlicense`.

Решение о том, править ли поле `license` в vendored-дереве отдельным патчем
(чтобы метаданные не противоречили `LICENSE`), **ожидает подтверждения
владельца проекта**; до него дерево остаётся байт-в-байт upstream плюс
функциональные патчи из `patches/`.

## Патчи

Список и назначение — `patches/README.md`. Патчи меняют только функциональную
часть (секреты через окружение, SIGTERM, безопасные события, события передачи
TUN) и не касаются лицензии/атрибуции.
