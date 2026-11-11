#!/bin/ash
# CSQTT для MediaTek MT7621 — удаление панели и ядер.
set -eu

KEEP_CONFIG=1
while [ "$#" -gt 0 ]; do
	case "$1" in
		--purge) KEEP_CONFIG=0 ;;
		--help|-h) echo 'Использование: ash uninstall-csqtt.sh [--purge]'; exit 0 ;;
		*) echo "Неизвестный параметр: $1" >&2; exit 2 ;;
	esac
	shift
done

if [ -f /etc/config/csqtt ] && [ "$KEEP_CONFIG" -eq 1 ]; then
	cp -p /etc/config/csqtt /etc/config/csqtt.backup
fi

if [ -x /etc/init.d/csqtt ]; then
	/etc/init.d/csqtt stop >/dev/null 2>&1 || true
	/etc/init.d/csqtt disable >/dev/null 2>&1 || true
fi

if command -v apk >/dev/null 2>&1; then
	PKG_MGR='apk'
elif command -v opkg >/dev/null 2>&1; then
	PKG_MGR='opkg'
else
	echo 'Не найден пакетный менеджер: требуется OpenWrt 25.12.x (apk) или 24.10.x (opkg).' >&2
	exit 1
fi

PACKAGES=''
for package in luci-app-csqtt csqtt-core-2.1.9 csqtt-core-2.5.0 luci-app-csqtt-netis csqtt-core; do
	if [ "$PKG_MGR" = 'apk' ]; then
		if apk info -e "$package" >/dev/null 2>&1; then
			PACKAGES="$PACKAGES $package"
		fi
	else
		if opkg status "$package" 2>/dev/null | grep -q '^Status:.*installed'; then
			PACKAGES="$PACKAGES $package"
		fi
	fi
done
if [ -n "$PACKAGES" ]; then
	# shellcheck disable=SC2086
	if [ "$PKG_MGR" = 'apk' ]; then
		apk del $PACKAGES
	else
		opkg remove $PACKAGES
	fi
fi

rm -rf /tmp/luci-indexcache* 2>/dev/null || true
rm -f /var/run/csqtt/status.json
/etc/init.d/rpcd restart >/dev/null 2>&1 || true

if [ "$KEEP_CONFIG" -eq 0 ]; then
	rm -f /etc/config/csqtt /etc/config/csqtt.backup
	echo 'Удалено полностью, включая конфигурацию.'
else
	echo 'Удалено. Конфигурация сохранена в /etc/config/csqtt.backup.'
fi
