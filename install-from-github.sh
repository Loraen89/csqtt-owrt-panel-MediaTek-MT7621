#!/bin/ash
# install-from-github.sh — установка CSQTT для MT7621 из GitHub Releases.
# Для публичного репозитория токен и дополнительные ключи не нужны.
# GITHUB_TOKEN используется только как необязательная авторизация для
# приватного репозитория или при ограничении анонимных запросов GitHub.
#
#   ash install-from-github.sh [--core 2.1.9|2.5.0|both]
#
# Требуется curl (apk add curl). По умолчанию берутся файлы последнего
# релиза; с --ref — файлы dist/ из указанной ветки или тега.
set -eu

REPO='Loraen89/csqtt-owrt-panel-MediaTek-MT7621'
CORE_CHOICE=''
REF=''
DRY_RUN=0
WORKDIR=''

PANEL_NAME='luci-app-csqtt-2.0-openwrt-25.12.apk'
CORE219_NAME='csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk'
CORE251_NAME='csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk'
SUMS_NAME='SHA256SUMS'

usage() {
	cat <<'EOF'
Использование: ash install-from-github.sh [параметры]

  --core 2.1.9    установить панель + ядро 2.1.9
  --core 2.5.0    установить панель + ядро 2.5.0 (бинарник 2.5.1)
  --core both     установить панель + оба ядра
  --ref REF       качать dist/ из ветки/тега (по умолчанию — последний релиз)
  --dry-run       показать план без установки
  --help          показать эту справку

Без --core в терминале будет показан выбор. В неинтерактивном режиме
используется 2.5.0. GITHUB_TOKEN необязателен для публичного репозитория.
EOF
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--core) shift; CORE_CHOICE="${1:-}" ;;
		--core=*) CORE_CHOICE="${1#--core=}" ;;
		--ref) shift; REF="${1:-}" ;;
		--ref=*) REF="${1#--ref=}" ;;
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
	*) echo "Недопустимое ядро: $CORE_CHOICE" >&2; exit 2 ;;
esac

command -v curl >/dev/null 2>&1 || {
	echo 'Нужен curl: apk add curl' >&2
	exit 1
}
command -v apk >/dev/null 2>&1 || {
	echo 'Этот установщик требует OpenWrt 25.12.x с менеджером apk.' >&2
	exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
	echo 'Для проверки пакетов нужен sha256sum.' >&2
	exit 1
}

WORKDIR=$(mktemp -d /tmp/csqtt-install.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT INT TERM

gh_api() {
	if [ -n "${GITHUB_TOKEN:-}" ]; then
		curl -fsSL --retry 3 \
			-H "Authorization: Bearer $GITHUB_TOKEN" \
			-H 'Accept: application/vnd.github+json' \
			-o "$2" "$1"
	else
		curl -fsSL --retry 3 \
			-H 'Accept: application/vnd.github+json' \
			-o "$2" "$1"
	fi
}

gh_get() {
	if [ -n "${GITHUB_TOKEN:-}" ]; then
		curl -fsSL --retry 3 \
			-H "Authorization: Bearer $GITHUB_TOKEN" \
			-H 'Accept: application/octet-stream' \
			-o "$2" "$1"
	else
		curl -fsSL --retry 3 \
			-H 'Accept: application/octet-stream' \
			-o "$2" "$1"
	fi
}

gh_raw() {
	if [ -n "${GITHUB_TOKEN:-}" ]; then
		curl -fsSL --retry 3 \
			-H "Authorization: Bearer $GITHUB_TOKEN" \
			-H 'Accept: application/vnd.github.raw+json' \
			-o "$2" "$1"
	else
		curl -fsSL --retry 3 \
			-H 'Accept: application/vnd.github.raw+json' \
			-o "$2" "$1"
	fi
}

# Собираем список URL нужных файлов
if [ -n "$REF" ]; then
	BASE="https://api.github.com/repos/$REPO/contents/dist"
	URLS="$BASE/$PANEL_NAME?ref=$REF
$BASE/$CORE219_NAME?ref=$REF
$BASE/$CORE251_NAME?ref=$REF
$BASE/$SUMS_NAME?ref=$REF"
else
	echo 'Запрашиваю последний релиз GitHub...'
	if ! gh_api "https://api.github.com/repos/$REPO/releases/latest" "$WORKDIR/.release.json"; then
		echo 'GitHub не разрешил анонимный доступ. Для установки без токена репозиторий должен быть публичным.' >&2
		echo 'Для приватного репозитория задайте GITHUB_TOKEN с Contents: read-only.' >&2
		exit 1
	fi
	TAG=$(sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$WORKDIR/.release.json" | head -n1)
	echo "Релиз: ${TAG:-неизвестно}"
	# Для приватного репо browser_download_url не принимает Bearer (404).
	# Качаем через API-URL ассета: https://api.github.com/repos/.../releases/assets/ID
	PAIRS=$(awk '
		/"url": *"https:\/\/api\.github\.com\/repos\/[^"]*\/assets\// {
			u=$0; sub(/.*"url": *"/, "", u); sub(/".*/, "", u)
		}
		/"name": *"/ {
			n=$0; sub(/.*"name": *"/, "", n); sub(/".*/, "", n)
			if (u != "") { print u " " n; u = "" }
		}' "$WORKDIR/.release.json")
	rm -f "$WORKDIR/.release.json"
fi

WANTED="$PANEL_NAME $SUMS_NAME"
if [ "$CORE_CHOICE" = '2.1.9' ] || [ "$CORE_CHOICE" = 'both' ]; then
	WANTED="$WANTED $CORE219_NAME"
fi
if [ "$CORE_CHOICE" != '2.1.9' ]; then
	WANTED="$WANTED $CORE251_NAME"
fi

for name in $WANTED; do
	if [ -n "$REF" ]; then
		url=$(printf '%s\n' "$URLS" | grep "/$name?" | head -n1)
	else
		url=$(printf '%s\n' "$PAIRS" | awk -v n="$name" '$2==n {print $1; exit}')
	fi
	[ -n "$url" ] || { echo "В источнике не найден файл $name" >&2; exit 1; }
	echo "Скачиваю $name ..."
	if [ -n "$REF" ]; then
		gh_raw "$url" "$WORKDIR/$name"
	else
		gh_get "$url" "$WORKDIR/$name"
	fi
done

# Проверка целостности
if command -v sha256sum >/dev/null 2>&1 && [ -f "$WORKDIR/$SUMS_NAME" ]; then
	echo 'Проверяю SHA256...'
	SELECTED_SUMS="$WORKDIR/.selected-sha256sums"
	: > "$SELECTED_SUMS"
	for name in $WANTED; do
		[ "$name" = "$SUMS_NAME" ] && continue
		awk -v wanted="$name" '$2 == wanted { print; found=1 } END { if (!found) exit 1 }' \
			"$WORKDIR/$SUMS_NAME" >> "$SELECTED_SUMS" || {
				echo "В $SUMS_NAME нет контрольной суммы для $name" >&2
				exit 1
			}
	done
	( cd "$WORKDIR" && sha256sum -c "$(basename "$SELECTED_SUMS")" ) || {
		echo 'Ошибка контрольных сумм!' >&2
		exit 1
	}
fi

PACKAGES="$WORKDIR/$PANEL_NAME"
if [ "$CORE_CHOICE" = '2.1.9' ] || [ "$CORE_CHOICE" = 'both' ]; then
	PACKAGES="$PACKAGES $WORKDIR/$CORE219_NAME"
fi
if [ "$CORE_CHOICE" != '2.1.9' ]; then
	PACKAGES="$PACKAGES $WORKDIR/$CORE251_NAME"
fi

echo "Будут установлены: $PACKAGES"
if [ "$DRY_RUN" -eq 1 ]; then
	echo 'Режим dry-run: изменений не внесено.'
	exit 0
fi

# shellcheck disable=SC2086
apk add --allow-untrusted $PACKAGES

case "$CORE_CHOICE" in
	2.1.9) SELECTED_CORE='2.1.9' ;;
	2.5.0) SELECTED_CORE='2.5.0' ;;
	both) SELECTED_CORE='auto' ;;
esac
if command -v uci >/dev/null 2>&1; then
	uci -q set "csqtt.main.core_version=$SELECTED_CORE"
	uci -q commit csqtt
fi

rm -f /tmp/luci-indexcache
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/csqtt enable >/dev/null 2>&1 || true

echo 'Установка завершена.'
echo 'Панель: LuCI -> Службы -> CSQTT-PANEL v2.0.'
echo "Режим ядра: $SELECTED_CORE"
echo "Если установлены оба: uci set csqtt.main.core_version='2.1.9|2.5.0|auto'"
