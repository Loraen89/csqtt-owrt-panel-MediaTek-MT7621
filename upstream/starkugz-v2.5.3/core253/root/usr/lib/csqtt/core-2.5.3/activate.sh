#!/bin/sh
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
#
# [042] Активация общего управления для пакета ядра CSQTT 2.5.3.
#
# Зачем это нужно. apk отказывается устанавливать два пакета, которые владеют
# одним и тем же путём. Поэтому общие точки входа (CLI /usr/bin/csqtt, служба
# /etc/init.d/csqtt, logrotate) НЕ входят в payload пакета: ядро несёт свою
# копию управления в приватном каталоге /usr/lib/csqtt/core-2.5.3/ и
# активирует её этим скриптом при установке.
#
# [056/r4] Совместная установка с ядром 2.1.9 (набор A53/25.12.5) допустима.
# Правила выбора активного ядра те же, что у активатора 2.1.9, и не зависят от
# порядка установки:
#   1. установлено 2.5.3 — активно оно (текущее ядро выпуска);
#   2. иначе 2.1.9;
#   3. иначе 2.5.0 (распознавание старой установки).
# Удаление одного ядра не снимает общие точки входа: управление переходит
# оставшемуся ядру. Общие точки снимаются только вместе с последним ядром,
# /etc/config/csqtt при этом сохраняется (профили и секреты — пользовательские).
#
# Скрипт вызывается из post-install/post-deinstall пакета ядра:
#   activate.sh install 2.5.3 | activate.sh remove 2.5.3
# Для офлайн-тестов корень можно подменить: CSQTT_INSTALL_ROOT=<каталог>.
set -eu

ACTION=${1:-}
VERSION=${2:-}
R=${CSQTT_INSTALL_ROOT:-}
BASE="$R/usr/lib/csqtt"
ACTIVE_FILE="$BASE/active"

# Приоритет: текущее ядро выпуска 2.5.3, затем 2.1.9, затем 2.5.0.
CORES="2.5.3 2.1.9 2.5.0"

core_dir() { echo "$BASE/core-$1"; }
core_present() { [ -f "$(core_dir "$1")/etc/init.d/csqtt" ]; }

# Стабильный путь CLI для каждого ядра.
core_cli() {
	case "$1" in
	2.5.3)
		if [ -f "$BASE/core-2.1.9/owns-controller" ] &&
		   [ -x "$BASE/core-2.1.9/bin/csqtt-control" ]; then
			echo /usr/lib/csqtt/core-2.1.9/bin/csqtt-control
		else
			echo /usr/lib/csqtt/core-2.5.3/bin/csqtt-control
		fi
		;;
	2.1.9)
		if [ -x "$BASE/core-2.1.9/bin/csqtt-control" ]; then
			echo /usr/lib/csqtt/core-2.1.9/bin/csqtt-control
		else
			echo /usr/bin/csqtt-2.1.9
		fi
		;;
	2.5.0) echo /usr/lib/csqtt/core-2.5.0/bin/csqtt-control ;;
	*) return 1 ;;
	esac
}

best_core() {
	for v in $CORES; do
		core_present "$v" && { echo "$v"; return 0; }
	done
	return 1
}

remove_entry_points() {
	rm -f "$R/usr/bin/csqtt" \
	      "$R/etc/init.d/csqtt" \
	      "$R/etc/logrotate.d/csqtt"
	# rc.d-симлинки создаёт procd при enable; снимаем только ссылки на csqtt.
	for f in "$R"/etc/rc.d/*csqtt; do
		[ -L "$f" ] || [ -e "$f" ] || continue
		rm -f "$f"
	done
}

activate_core() {
	v=$1
	src=$(core_dir "$v")
	[ -d "$src" ] || return 1
	cli=$(core_cli "$v") || return 1
	mkdir -p "$R/usr/bin" "$R/etc/init.d" "$R/etc/config" \
	         "$R/etc/logrotate.d" "$BASE" || return 1
	# CLI: символическая ссылка на бинарник активного ядра. Цель — путь
	# внутри образа (без префикса CSQTT_INSTALL_ROOT), поэтому ссылка
	# остаётся корректной и после копирования корня на устройство.
	cp -f "$src/etc/init.d/csqtt" "$R/etc/init.d/csqtt" || return 1
	chmod 0755 "$R/etc/init.d/csqtt" || return 1
	cp -f "$src/etc/logrotate.d/csqtt" "$R/etc/logrotate.d/csqtt" || return 1
	chmod 0644 "$R/etc/logrotate.d/csqtt" || return 1
	# UCI-конфиг — пользовательские данные: создаём только если его нет.
	if [ ! -f "$R/etc/config/csqtt" ]; then
		cp -f "$src/etc/config/csqtt" "$R/etc/config/csqtt" || return 1
		chmod 0600 "$R/etc/config/csqtt" || return 1
	fi
	ln -sfn "$cli" "$R/usr/bin/csqtt" || return 1
	printf '%s\n' "$v" >"$ACTIVE_FILE" || return 1
	# Включение службы. Штатный default_postinst пакета выполняется ДО нашего
	# postinst, когда init-скрипта ещё нет, поэтому rc.d-симлинки создаём сами.
	# В офлайн-корне (тесты) rc.common отсутствует — шаг пропускается.
	if [ -x "$R/etc/init.d/csqtt" ] && [ -f "$R/etc/rc.common" ]; then
		"$R/etc/init.d/csqtt" enable >/dev/null 2>&1 || true
	fi
}

case "$ACTION" in
install | remove)
	best=$(best_core || true)
	if [ -n "$best" ]; then
		activate_core "$best" || exit 1
	else
		# Последнее ядро удалено: панель и /etc/config/csqtt остаются.
		remove_entry_points
		rm -f "$ACTIVE_FILE"
	fi
	;;
*)
	echo "usage: $0 install|remove <core version>" >&2
	exit 2
	;;
esac
exit 0
