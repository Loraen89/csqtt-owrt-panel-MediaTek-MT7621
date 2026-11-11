#!/bin/ash
# CSQTT для MediaTek MT7621 — локальная установка.
# Поддерживает два целевых релиза OpenWrt:
#   25.12.x — пакетный менеджер apk (файлы *.apk из dist);
#   24.10.x — пакетный менеджер opkg (файлы *.ipk из dist).
# Устанавливает панель luci-app-csqtt и выбранное ядро из пакетов,
# лежащих рядом со скриптом или в каталоге dist.
set -eu

CORE_CHOICE=''
DRY_RUN=0

usage() {
	cat <<'EOF'
Использование: ash install-csqtt.sh [параметры]

  --core 2.1.9    установить панель + ядро 2.1.9
  --core 2.5.0    установить панель + ядро 2.5.0 (бинарник 2.5.1)
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

choose_core() {
	[ -n "$CORE_CHOICE" ] && return 0
	if [ -t 0 ]; then
		cat <<'EOF'
Выберите устанавливаемое ядро:
  1) 2.1.9
  2) 2.5.0 (пакет содержит исправленный бинарник 2.5.1) [по умолчанию]
  3) оба ядра
EOF
		printf 'Ваш выбор [2]: '
		read -r answer || answer=''
		case "$answer" in
			1|2.1.9) CORE_CHOICE='2.1.9' ;;
			3|both|оба) CORE_CHOICE='both' ;;
			''|2|2.5.0|2.5.1) CORE_CHOICE='2.5.0' ;;
			*) echo "Недопустимый выбор: $answer" >&2; exit 2 ;;
		esac
	else
		CORE_CHOICE='2.5.0'
	fi
}

choose_core
case "$CORE_CHOICE" in
	2.1.9|2.5.0|both) ;;
	2.5.1) CORE_CHOICE='2.5.0' ;;
	*) echo "Недопустимое ядро: $CORE_CHOICE (ожидается 2.1.9, 2.5.0 или both)" >&2; exit 2 ;;
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

command -v apk >/dev/null 2>&1 && PKG_MGR='apk'
command -v opkg >/dev/null 2>&1 && PKG_MGR='opkg'
if [ -z "${PKG_MGR:-}" ]; then
	echo 'Не найден пакетный менеджер: требуется OpenWrt 25.12.x (apk) или 24.10.x (opkg).' >&2
	exit 1
fi
if [ "$PKG_MGR" = 'apk' ]; then
	PANEL_NAME='luci-app-csqtt-2.0-openwrt-25.12.apk'
	CORE219_NAME='csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk'
	CORE251_NAME='csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk'
else
	PANEL_NAME='luci-app-csqtt-2.0-openwrt-24.10.ipk'
	CORE219_NAME='csqtt-core-2.1.9-openwrt-24.10-mipsel_24kc.ipk'
	CORE251_NAME='csqtt-core-2.5.1-openwrt-24.10-mipsel_24kc.ipk'
fi
echo "Пакетный менеджер: $PKG_MGR"

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

SUMS_FILE=''
for dir in "$SCRIPT_DIR" "$SCRIPT_DIR/dist"; do
	if [ -f "$dir/SHA256SUMS" ]; then
		SUMS_FILE="$dir/SHA256SUMS"
		break
	fi
done
command -v sha256sum >/dev/null 2>&1 && [ -n "$SUMS_FILE" ] || {
	echo 'Для установки нужны sha256sum и файл SHA256SUMS.' >&2
	exit 1
}
if [ -n "$SUMS_FILE" ]; then
	echo 'Проверяю SHA256 выбранных пакетов...'
	for package in $PACKAGES; do
		name=$(basename "$package")
		expected=$(awk -v wanted="$name" '$2 == wanted { print $1; exit }' "$SUMS_FILE")
		[ -n "$expected" ] || { echo "В SHA256SUMS нет $name" >&2; exit 1; }
		actual=$(sha256sum "$package" | awk '{ print $1 }')
		[ "$actual" = "$expected" ] || { echo "Ошибка контрольной суммы: $name" >&2; exit 1; }
	done
fi

if [ "$DRY_RUN" -eq 1 ]; then
	echo 'Режим dry-run: изменений не внесено.'
	exit 0
fi

# shellcheck disable=SC2086
if [ "$PKG_MGR" = 'apk' ]; then
	apk add --allow-untrusted $PACKAGES
else
	opkg install $PACKAGES || {
		echo 'opkg не смог установить пакеты. Проверьте доступ к фидам OpenWrt 24.10:' >&2
		echo 'перед установкой выполните: opkg update' >&2
		exit 1
	}
fi

case "$CORE_CHOICE" in
	2.1.9) SELECTED_CORE='2.1.9' ;;
	2.5.0) SELECTED_CORE='2.5.0' ;;
	both) SELECTED_CORE='auto' ;;
esac
if command -v uci >/dev/null 2>&1; then
	uci -q set "csqtt.main.core_version=$SELECTED_CORE"
	uci -q commit csqtt
fi

rm -rf /tmp/luci-indexcache* 2>/dev/null || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/csqtt enable >/dev/null 2>&1 || true

echo 'Установка завершена.'
echo 'Панель: LuCI -> Службы -> CSQTT-PANEL v2.0.'
echo "Режим ядра: $SELECTED_CORE"
echo "Если установлены оба: uci set csqtt.main.core_version='2.1.9|2.5.0|auto'"
