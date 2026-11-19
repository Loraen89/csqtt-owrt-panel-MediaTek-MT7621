@echo off
setlocal
rem Start the disposable OpenWrt guest from the user's ordinary Windows session.
rem No administrator rights, firewall changes, or production router access.
set "CSQTT_VM_DIR=C:\workspace\csqtt-mt7621-qemu\qemu-live"
if not exist "%CSQTT_VM_DIR%\live.cpio" for %%I in ("%~dp0..\qemu-live") do set "CSQTT_VM_DIR=%%~fI"
set "CSQTT_QEMU_BIN=%ProgramFiles%\qemu\qemu-system-mipselw.exe"
set "CSQTT_KERNEL=D:\csqtt-tooling\qemu-test\release\vmlinux-initramfs.elf"
set "CSQTT_URL=http://127.0.0.1:18080/cgi-bin/luci/admin/services/csqtt"
if not exist "%CSQTT_QEMU_BIN%" goto missing_qemu
if not exist "%CSQTT_KERNEL%" goto missing_kernel
if not exist "%CSQTT_VM_DIR%\live.cpio" goto missing_initrd
type nul > "%CSQTT_VM_DIR%\manual-serial.log"
echo Starting QEMU. Please allow about one minute for the guest to boot.
start "" "%CSQTT_QEMU_BIN%" -M malta -cpu 24Kc -m 256M ^
 -name "CSQTT LuCI - OpenWrt MIPS" -display gtk,show-tabs=on -monitor none ^
 -serial "file:%CSQTT_VM_DIR%\manual-serial.log" -serial vc:120Cx40C ^
 -netdev "user,id=lan,restrict=on,hostfwd=tcp:127.0.0.1:18080-10.0.2.15:80" ^
 -device pcnet,netdev=lan -no-reboot -kernel "%CSQTT_KERNEL%" ^
 -initrd "%CSQTT_VM_DIR%\live.cpio" ^
 -append "console=ttyS0,115200n8 rdinit=/sbin/init panic=1"
if errorlevel 1 goto launch_failed
for /l %%N in (1,1,120) do (
 findstr /C:"QEMU_LUCI_READY" "%CSQTT_VM_DIR%\manual-serial.log" >nul 2>&1
 if not errorlevel 1 goto ready
 timeout /t 1 /nobreak >nul
)
echo Guest readiness was not confirmed. Check the QEMU window and manual-serial.log.
pause
exit /b 1
:ready
for /l %%N in (1,1,15) do (
 "%SystemRoot%\System32\curl.exe" --silent --max-time 2 --output nul "%CSQTT_URL%"
 if not errorlevel 1 goto open_browser
 timeout /t 1 /nobreak >nul
)
echo Guest booted, but the forwarded HTTP port did not respond.
echo Inspect %CSQTT_VM_DIR%\manual-serial.log
pause
exit /b 1
:open_browser
echo LuCI login: root
echo Demo guest password: qemu-demo
echo Opening %CSQTT_URL%
start "" "%CSQTT_URL%"
exit /b 0
:missing_qemu
echo QEMU was not found: %CSQTT_QEMU_BIN%
goto failed
:missing_kernel
echo OpenWrt kernel was not found: %CSQTT_KERNEL%
goto failed
:missing_initrd
echo Guest initrd was not found: %CSQTT_VM_DIR%\live.cpio
goto failed
:launch_failed
echo QEMU could not be started. Close another CSQTT guest using port 18080.
:failed
pause
exit /b 1
