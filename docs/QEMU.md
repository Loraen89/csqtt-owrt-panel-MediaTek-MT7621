# QEMU validation after packaging

Hardware status for 2.0-r13: this exact version has not been tested on a physical
router. The [2026-11-18 report](QEMU-REPORT-2026-11-18.md) describes the previous
local QEMU run with r12 packages, not a new QEMU run of the r13 packages.

Run from PowerShell:

```powershell
.\tools\test-qemu.ps1 -SecondsPerCore 60
```

This rebuilds APK/IPK packages using existing compiled MIPS cores, verifies their
hashes and package structure, and then runs two independent cold boots of OpenWrt
25.12.6 on QEMU Malta, with the labels Xiaomi3Gv1 and NetisN6v1. The universal
packages are identical for both labels. This is repeated MIPS userspace validation,
not emulation of either router board. MT7621 flash, bootloader, Wi-Fi and switch
are not tested. IPK installation on OpenWrt 24.10 is not tested by this fixture.

Each guest has 256 MiB RAM, a 24Kc CPU, no NIC, synthetic credentials and a default
route over loopback. Nothing connects to a real VK account or server. The checks
cover offline installation without ignoring dependencies, compiled-core hashes,
versions, both self-tests (HKDF, concurrent atomics and native TUN lifecycle),
service-script syntax, RPC registration and regressions, the LuCI login endpoint,
TUN MTU, stable process IDs and RSS samples, procd recovery after SIGKILL, service
stop and TUN cleanup. Each core runs for the requested duration before the forced
recovery check. Real tunnel traffic, login after the LuCI authentication screen,
VK Flood control and its automatic recovery need separate integration tests.

The first compatibility run exposed a shared-default problem: `unified` is
supported by 2.5.x, while 2.1.9 accepts only `audio` or `video`. The init script
now maps `unified` to `audio` only for 2.1.9 and records that choice in syslog.
Explicit `audio`/`video` choices and newer cores keep their original behavior.

Required existing fixture directory (`-Fixtures`): `vmlinux-initramfs.elf`,
`rootfs-rel.cpio`, `apks/*.apk` with matching kernel/TUN and OpenSSL/curl
dependencies, and `../serve/libatomic1-14.3.0-r5.apk`. QEMU can be selected using
`-Qemu`. No download or system installation is performed.

Results are written under `qemu-results`: complete serial logs, the guest script,
per-profile temporary initrds and a JSON manifest with hashes and individual
failures. A failure, missing completion marker, timeout or abnormal QEMU exit
fails the runner. Nothing is published by these scripts.
