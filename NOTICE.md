# NOTICE — авторство и лицензии

Программа распространяется на условиях **PolyForm Noncommercial 1.0.0**.
Полный текст находится в [LICENSE](LICENSE). Обязательные уведомления:

> Required Notice: Copyright 2026 amurcanov.
> Required Notice: Commercial use of CSQTT requires a separate written license from the licensor.
> Required Notice: Redistributions and derivative works must retain attribution to the original CSQTT project and these notices.

## Происхождение

- Ядро CSQTT: [amurcanov/csqtt](https://github.com/amurcanov/csqtt), автор amurcanov.
- Исходная интеграция OpenWrt и панель LuCI: [starkugz/csqtt-openwrt](https://github.com/starkugz/csqtt-openwrt), автор starkugz; исходное уведомление также указывает соавтора luminescq.
- Адаптация MT7621, упаковка и оформление **CSQTT-PANEL v2.0**: данный репозиторий Loraen89. Стороннее ядро не является собственной разработкой этой адаптации.

В комплект входят ядро 2.1.9 и сборка 2.5.1 на базе CSQTT 2.5.0 с клиентским
community-патчем 02 и адаптацией MT7621. Внутреннее имя пакета `csqtt-core-2.5.0`
сохранено; обозначение 2.5.1 не означает новый wire-протокол.
Авторство и лицензии исходных community-патчей сохраняются.

OpenWrt, LuCI и Rust-зависимости имеют собственные лицензии. Исходники и
Cargo.lock ядер находятся в `core219/source/` и `core251/source/`.
VK, OK и TURN — внешние сервисы с отдельными условиями использования.

При распространении сохраняйте LICENSE, этот NOTICE и исходные уведомления
об авторстве. Коммерческое использование требует отдельного разрешения автора.
