#!/bin/sh
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copy effective tunnel/VK settings to independent profiles. Never starts a service.
# [PER-PROFILE TUN] Помимо общих VK/транспортных полей (только при schema<3)
# переносит туннельные параметры main (tun_address/tun_mtu/dns) в КАЖДЫЙ профиль
# на любой схеме, включая 3: раньше эти поля не мигрировали, а наследование из
# main допустимо только для совместимости до миграции. Собственные значения
# профилей не затираются; из main поля удаляются только после копирования и
# построчной проверки результата; перед записью — резервная копия (см. ниже).
set -eu
DIR=/etc/config
APPLY=0
while [ "$#" -gt 0 ]; do
 case "$1" in
  --config-dir) shift; DIR=$1 ;;
  --apply) APPLY=1 ;;
  --dry-run) APPLY=0 ;;
  *) echo 'ERROR: unsupported argument' >&2; exit 2 ;;
 esac
 shift
done
FILE="$DIR/csqtt"
[ -f "$FILE" ] || { echo 'ERROR: config missing' >&2; exit 2; }
command -v uci >/dev/null || { echo 'ERROR: uci required' >&2; exit 2; }
W=$(mktemp -d)
chmod 700 "$W"
TMP=
cleanup(){ [ -z "$TMP" ] || rm -f "$TMP"; rm -rf "$W"; }
trap cleanup EXIT HUP INT TERM
cp -p "$FILE" "$W/csqtt"
# libuci drops explicitly empty options. Preserve their presence from the
# original text so an empty main secret cannot revive a legacy profile secret.
awk '
 $1 == "config" { section=$3; gsub(/["\047]/, "", section); main=(section=="main") }
 main && $1 == "option" { field=$2; gsub(/["\047]/, "", field); print field }
' "$FILE" > "$W/main-fields"
get(){ uci -c "$W" -q get "csqtt.$1" 2>/dev/null || :; }
schema=$(get main.schema_version)
case "$schema" in ''|1) schema=1 ;; 2) ;; 3) ;; *) echo 'ERROR: unsupported schema; unchanged' >&2; exit 2 ;; esac

# [PER-PROFILE TUN] Туннельные поля main переносятся при любой схеме. При
# schema 3 (общие поля уже в профилях) миграция выполняется, только если в
# main ещё остались tun-поля — иначе прежнее поведение «unchanged».
TUN_FIELDS='tun_address tun_mtu dns'
has_tun=0
for field in $TUN_FIELDS; do
 if grep -qx "$field" "$W/main-fields"; then has_tun=1; break; fi
done
if [ "$schema" = 3 ] && [ "$has_tun" = 0 ]; then
 echo 'Already profile schema 3; unchanged'
 exit 0
fi

ids=$(uci -c "$W" -q show csqtt | sed -n 's/^csqtt\.\([A-Za-z0-9_]*\)=server$/\1/p')
[ -n "$ids" ] || { echo 'ERROR: create a profile before migrating; unchanged' >&2; exit 2; }

count=0
tun_moved=0
if [ "$schema" != 3 ]; then
 fields='vk vk_js_token vk_hash_mode vk_auth_mode workers obfs turn_transport captcha_mode fingerprint client_ids device_id'
 for id in $ids; do
  for field in $fields; do
   main=$(get "main.$field")
   value=$(get "$id.$field")
   if [ "$field" = obfs ] && [ "$schema" = 2 ]; then
    [ -n "$value" ] || value=$main
   elif grep -qx "$field" "$W/main-fields"; then value=$main
   elif [ "$schema" = 2 ]; then value=
   fi
   case "$field" in
    vk_hash_mode) [ -n "$value" ] || value=manual ;;
    vk_auth_mode) [ -n "$value" ] || value=vkcalls ;;
    workers) [ -n "$value" ] || value=18 ;;
    obfs) [ -n "$value" ] || value=audio ;;
    turn_transport) [ -n "$value" ] || value=udp ;;
    captcha_mode) [ -n "$value" ] || value=auto ;;
    fingerprint) [ -n "$value" ] || value=chrome ;;
   esac
   uci -c "$W" set "csqtt.$id.$field=$value"
  done
  count=$((count+1))
 done
 for field in $fields; do uci -c "$W" -q delete "csqtt.main.$field" || :; done
 uci -c "$W" set csqtt.main.schema_version=3
fi

# [PER-PROFILE TUN] Действующее значение = своё значение профиля, иначе main.
# Копируем main→профиль ТОЛЬКО когда у профиля пусто (собственное не трогаем),
# после каждой копии сразу сверяем результат (проверка до удаления из main).
for id in $ids; do
 for field in $TUN_FIELDS; do
  mainv=$(get "main.$field")
  value=$(get "$id.$field")
  if [ -n "$mainv" ] && [ -z "$value" ]; then
   uci -c "$W" set "csqtt.$id.$field=$mainv"
   check=$(get "$id.$field")
   if [ "$check" != "$mainv" ]; then
    echo "ERROR: verification failed ($id.$field); unchanged" >&2
    exit 3
   fi
   tun_moved=$((tun_moved+1))
  fi
 done
done
# Удаление из main = снятие наследования (допустимо только после проверенного
# копирования выше; перед записью создаётся резервная копия).
for field in $TUN_FIELDS; do uci -c "$W" -q delete "csqtt.main.$field" || :; done

uci -c "$W" commit csqtt
uci -c "$W" export csqtt >/dev/null
printf 'Profiles prepared: %s; tunnel settings moved: %s; secret values hidden\n' "$count" "$tun_moved"
[ "$APPLY" = 1 ] || { echo 'Dry run; unchanged'; exit 0; }
backup="$FILE.bak.profile-v3.$(date -u +%Y%m%dT%H%M%SZ).$$"
cp -p "$FILE" "$backup"
chmod 600 "$backup"
TMP=$(mktemp "$FILE.tmp.XXXXXX")
cat "$W/csqtt" > "$TMP"
chmod 600 "$TMP"
mv -f "$TMP" "$FILE"
TMP=
echo 'Profile schema 3 applied; backup saved; service unchanged'