#!/bin/ash
# CSQTT для MediaTek MT7621 (OpenWrt 25.12, apk) — локальная установка.
# Устанавливает панель luci-app-csqtt и выбранное ядро из APK-файлов,
# лежащих рядом со скриптом или в каталоге dist.
set -eu

CORE_CHOICE='2.5.1'
DRY_RUN=0

usage() {
	cat <<'EOF'
Использование: ash install-csqtt.sh [параметры]

  --core 2.1.9    установить панель + ядро 2.1.9
  --core 2.5.1    установить панель + ядро 2.5.1 (по умолчанию)
  --core both     установить панель + оба ядра (auto выберет 2.5.1;
                  переключение: uci set csqtt.main.core_version='2.1.9')
  --dry-run       показать план без установки
  --help          показать эту справку
EOF
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--core) shift; CORE_CHOICE="${1:-}" ;;
		--core=*) CORE_CHOICE="${1#--core=}" ;;
		--dry-run) DRY_RUN=1 ;;
		--help|-h) usage; exit 0 ;;
		*) echo "Неизвестный параметр: $1" >&2; usage >&2; exit 2 ;;
	esac
	shift
done

case "$CORE_CHOICE" in
	2.1.9|2.5.1|2.5.0|both) ;;
	*) echo "Недопустимое ядро: $CORE_CHOICE (ожидается 2.1.9, 2.5.1 или both)" >&2; exit 2 ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

find_package() {
	name="$1"
	for dir in "$SCRIPT_DIR" "$SCRIPT_DIR/dist"; do
		if [ -f "$dir/$name" ]; then
			printf '%s\n' "$dir/$name"
			return 0
		fi
	done
	return 1
}

command -v apk >/dev/null 2>&1 || {
	echo 'Этот установщик требует OpenWrt 25.12.x с менеджером apk.' >&2
	exit 1
}

PANEL_NAME='luci-app-csqtt-2.0-openwrt-25.12.apk'
CORE219_NAME='csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk'
CORE251_NAME='csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk'

PANEL_APK=$(find_package "$PANEL_NAME") || {
	echo "Не найден пакет панели $PANEL_NAME рядом со скриптом или в dist." >&2
	exit 1
}

PACKAGES="$PANEL_APK"
if [ "$CORE_CHOICE" = '2.1.9' ] || [ "$CORE_CHOICE" = 'both' ]; then
	CORE219_APK=$(find_package "$CORE219_NAME") || { echo "Не найден $CORE219_NAME" >&2; exit 1; }
	PACKAGES="$PACKAGES $CORE219_APK"
fi
if [ "$CORE_CHOICE" != '2.1.9' ]; then
	CORE251_APK=$(find_package "$CORE251_NAME") || { echo "Не найден $CORE251_NAME" >&2; exit 1; }
	PACKAGES="$PACKAGES $CORE251_APK"
fi

echo "Панель:  $PANEL_APK"
[ -n "${CORE219_APK:-}" ] && echo "Ядро 2.1.9: $CORE219_APK"
[ -n "${CORE251_APK:-}" ] && echo "Ядро 2.5.1: $CORE251_APK"

if [ "$DRY_RUN" -eq 1 ]; then
	echo 'Режим dry-run: изменений не внесено.'
	exit 0
fi

# shellcheck disable=SC2086
apk add --allow-untrusted $PACKAGES

rm -f /tmp/luci-indexcache
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/csqtt enable >/dev/null 2>&1 || true

echo 'Установка завершена.'
echo 'Панель: LuCI -> Службы -> CSQTT (VK-туннель).'
echo 'Выбор ядра (если установлены оба): uci set csqtt.main.core_version='"'"'2.1.9'"'"' && uci commit csqtt'
