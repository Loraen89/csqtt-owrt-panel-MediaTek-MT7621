#!/bin/ash
# install-from-github.sh — установка CSQTT для MT7621 напрямую из приватного
# GitHub-репозитория Loraen89/csqtt-owrt-panel-MediaTek-MT7621.
#
# Репозиторий приватный, поэтому нужен персональный токен GitHub с правом
# чтения (classic: scope repo; fine-grained: Contents: read-only):
#   export GITHUB_TOKEN=github_pat_xxx
#   ash install-from-github.sh [--core 2.1.9|2.5.1|both] [--ref main|v2.0-mt7621-r1]
#
# Требуется curl (apk add curl). По умолчанию берутся файлы последнего
# релиза; с --ref — файлы dist/ из указанной ветки или тега.
set -eu

REPO='Loraen89/csqtt-owrt-panel-MediaTek-MT7621'
CORE_CHOICE='2.5.1'
REF=''
DRY_RUN=0
WORKDIR='/tmp/csqtt-install'

PANEL_NAME='luci-app-csqtt-2.0-openwrt-25.12.apk'
CORE219_NAME='csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk'
CORE251_NAME='csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk'
SUMS_NAME='SHA256SUMS'

usage() {
	cat <<'EOF'
Использование: ash install-from-github.sh [параметры]

  --core 2.1.9    установить панель + ядро 2.1.9
  --core 2.5.1    установить панель + ядро 2.5.1 (по умолчанию)
  --core both     установить панель + оба ядра
  --ref REF       качать dist/ из ветки/тега (по умолчанию — последний релиз)
  --dry-run       показать план без установки
  --help          показать эту справку

Перед запуском: export GITHUB_TOKEN=<ваш токен GitHub>
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

case "$CORE_CHOICE" in
	2.1.9|2.5.1|2.5.0|both) ;;
	*) echo "Недопустимое ядро: $CORE_CHOICE" >&2; exit 2 ;;
esac

[ -n "${GITHUB_TOKEN:-}" ] || {
	echo 'Задайте GITHUB_TOKEN (репозиторий приватный):' >&2
	echo '  export GITHUB_TOKEN=github_pat_xxx' >&2
	exit 1
}
command -v curl >/dev/null 2>&1 || {
	echo 'Нужен curl: apk add curl' >&2
	exit 1
}
command -v apk >/dev/null 2>&1 || {
	echo 'Этот установщик требует OpenWrt 25.12.x с менеджером apk.' >&2
	exit 1
}

mkdir -p "$WORKDIR"

gh_get() {
	curl -fsSL --retry 3 \
		-H "Authorization: Bearer $GITHUB_TOKEN" \
		-H "Accept: application/octet-stream" \
		-o "$2" "$1"
}

# Собираем список URL нужных файлов
if [ -n "$REF" ]; then
	BASE="https://raw.githubusercontent.com/$REPO/$REF/dist"
	URLS="$BASE/$PANEL_NAME
$BASE/$CORE219_NAME
$BASE/$CORE251_NAME
$BASE/$SUMS_NAME"
else
	echo 'Запрашиваю последний релиз GitHub...'
	gh_get "https://api.github.com/repos/$REPO/releases/latest" "$WORKDIR/.release.json"
	TAG=$(sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$WORKDIR/.release.json" | head -n1)
	echo "Релиз: ${TAG:-неизвестно}"
	URLS=$(sed -n 's/.*"browser_download_url": *"\([^"]*\)".*/\1/p' "$WORKDIR/.release.json")
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
	url=$(printf '%s\n' "$URLS" | grep "/$name\$" | head -n1)
	[ -n "$url" ] || url=$(printf '%s\n' "$URLS" | grep "/$name?" | head -n1)
	[ -n "$url" ] || { echo "В источнике не найден файл $name" >&2; exit 1; }
	echo "Скачиваю $name ..."
	gh_get "$url" "$WORKDIR/$name"
done

# Проверка целостности
if command -v sha256sum >/dev/null 2>&1 && [ -f "$WORKDIR/$SUMS_NAME" ]; then
	echo 'Проверяю SHA256...'
	( cd "$WORKDIR" && sha256sum -c "$SUMS_NAME" 2>/dev/null ) || {
		echo 'Ошибка контрольных сумм!' >&2
		exit 1
	}
fi

PACKAGES="$WORKDIR/$PANEL_NAME"
[ "$CORE_CHOICE" = '2.1.9' ] || [ "$CORE_CHOICE" = 'both' ] && PACKAGES="$PACKAGES $WORKDIR/$CORE219_NAME"
[ "$CORE_CHOICE" != '2.1.9' ] && PACKAGES="$PACKAGES $WORKDIR/$CORE251_NAME"

echo "Будут установлены: $PACKAGES"
if [ "$DRY_RUN" -eq 1 ]; then
	echo 'Режим dry-run: изменений не внесено.'
	exit 0
fi

# shellcheck disable=SC2086
apk add --allow-untrusted $PACKAGES

rm -f /tmp/luci-indexcache
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/csqtt enable >/dev/null 2>&1 || true

rm -rf "$WORKDIR"
echo 'Установка завершена.'
echo 'Панель: LuCI -> Службы -> CSQTT (VK-туннель).'
echo "Выбор ядра (если установлены оба): uci set csqtt.main.core_version='2.1.9' && uci commit csqtt"
