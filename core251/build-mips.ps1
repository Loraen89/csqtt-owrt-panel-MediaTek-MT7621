param(
    [ValidateRange(1, 8)][int]$Jobs = 2,
    [string]$ToolingPath = '',
    # First build on a fresh tooling directory needs network access so Cargo
    # can cache the build-std crates (rustc-demangle, compiler_builtins, ...).
    # Repeat builds work fully offline from the warmed cache.
    [switch]$Online
)

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$projectRoot = Split-Path -Parent $base
if ([string]::IsNullOrWhiteSpace($ToolingPath)) {
    $ToolingPath = Join-Path $projectRoot '.tooling'
}
if (-not (Test-Path -LiteralPath $ToolingPath)) {
    throw "Tooling directory does not exist: $ToolingPath"
}
$tooling = (Resolve-Path -LiteralPath $ToolingPath).Path
$env:CSQTT_TOOLING = $tooling
$core = Join-Path $base 'source\core'

$env:RUSTUP_HOME = Join-Path $tooling 'rustup'
$env:CARGO_HOME = Join-Path $tooling 'cargo'
$env:RUSTUP_TOOLCHAIN = '1.97.1-x86_64-pc-windows-gnu'
$env:RUSTC_BOOTSTRAP = '1'
$hostBin = Join-Path $env:RUSTUP_HOME 'toolchains\1.97.1-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin'
$env:PATH = "$env:CARGO_HOME\bin;$(Join-Path $tooling 'cmake-3.31.10-windows-x86_64\bin');$tooling;$hostBin;$(Join-Path $hostBin 'self-contained');$env:PATH"

$required = @(
    'rustup\toolchains\1.97.1-x86_64-pc-windows-gnu\bin\rustc.exe',
    'cargo\bin\cargo.exe',
    'zig-ar.cmd',
    'zig-ranlib.cmd',
    'host-build.toml',
    'zig-fast\zig-x86_64-windows-0.15.2\zig.exe',
    'mips-runtime\lib\libc.a',
    'mips-runtime\lib\crt1.o',
    'mips-runtime\lib\gcc\mipsel-openwrt-linux-musl\14.3.0\libgcc_eh.a'
)
foreach ($item in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $tooling $item))) {
        throw "Missing build dependency: $item"
    }
}

$lld = Join-Path $hostBin 'rust-lld.exe'
Copy-Item -LiteralPath $lld -Destination (Join-Path $hostBin 'ld.lld.exe') -Force
$localTools = Join-Path $base 'tools'
New-Item -ItemType Directory -Force -Path $localTools | Out-Null
$driver = Join-Path $localTools 'rustc-wrapper.exe'
& rustc (Join-Path $base 'build-driver.rs') -O -o $driver -Z unstable-options `
    -C "linker=$lld" -C linker-flavor=gnu-lld -C link-self-contained=yes `
    -C dlltool=llvm-dlltool.cmd
if ($LASTEXITCODE -ne 0) {
    throw 'Host build driver compilation failed'
}
Copy-Item -LiteralPath $driver -Destination (Join-Path $localTools 'mips-cc.exe') -Force
Copy-Item -LiteralPath $driver -Destination (Join-Path $localTools 'mips-cxx.exe') -Force

$env:RUSTC_WRAPPER = $driver
$env:CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_MUSL_LINKER = Join-Path $localTools 'mips-cc.exe'
$env:CC_mipsel_unknown_linux_musl = $env:CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_MUSL_LINKER
$env:CXX_mipsel_unknown_linux_musl = Join-Path $localTools 'mips-cxx.exe'
$env:AR_mipsel_unknown_linux_musl = Join-Path $tooling 'zig-ar.cmd'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $hostBin 'rust-lld.exe'
$env:CFLAGS_mipsel_unknown_linux_musl = '-msoft-float -march=mips32r2 -fno-sanitize=all'
$env:CARGO_TARGET_MIPSEL_UNKNOWN_LINUX_MUSL_RUSTFLAGS = '-C target-cpu=mips32r2 -C target-feature=+soft-float -C link-self-contained=no -C panic=abort'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS = '-Z unstable-options -C linker-flavor=gnu-lld -C link-self-contained=yes -C dlltool=llvm-dlltool.cmd'
$env:CMAKE_GENERATOR = 'Ninja'
$env:CMAKE_TOOLCHAIN_FILE = Join-Path $base 'mips-toolchain.cmake'
$env:AWS_LC_SYS_CMAKE_BUILDER = '1'
$env:AWS_LC_SYS_SMALL = '1'
$env:CARGO_PROFILE_RELEASE_PANIC = 'abort'
$env:CARGO_PROFILE_RELEASE_OPT_LEVEL = 's'
$env:CARGO_PROFILE_RELEASE_LTO = 'thin'
# CMake/Ninja invoke the C compiler through cmd.exe for aws-lc.  On Windows,
# cmd.exe corrupts Cyrillic path components before Zig sees the source path.
# Point Cargo at the 8.3 spelling of the same on-disk directory so every
# generated C/C++ path is ASCII-safe without moving build artifacts elsewhere.
$shortBase = (& cmd.exe /d /c "for %I in (`"$base`") do @echo %~sI").Trim()
if (-not $shortBase -or -not (Test-Path -LiteralPath $shortBase)) {
    throw 'Cannot resolve the ASCII-safe build path'
}
$env:CARGO_TARGET_DIR = Join-Path $shortBase 'target-final'
$env:ZIG_GLOBAL_CACHE_DIR = Join-Path $tooling 'zig-cache'
$env:ZIG_LOCAL_CACHE_DIR = Join-Path $tooling 'zig-local-cache'
Remove-Item Env:AWS_LC_SYS_NO_ASM -ErrorAction SilentlyContinue

Push-Location $core
try {
    # NOTE: @() around the if-expression is mandatory. Without it PowerShell
    # unwraps the single-element array to a plain string, and @splat then
    # enumerates the string character by character (cargo receives garbage).
    $offlineArgs = @(if ($Online) { @() } else { '--offline' })
    & cargo -Zhost-config -Ztarget-applies-to-host `
        --config (Join-Path $tooling 'host-build.toml') `
        rustc @offlineArgs --locked --bin client --release `
        --target mipsel-unknown-linux-musl -Z build-std=std,panic_abort `
        -j $Jobs -- -C target-feature=+soft-float,+crt-static
    if ($LASTEXITCODE -ne 0) {
        throw 'MIPS build failed'
    }
}
finally {
    Pop-Location
}

$built = Join-Path $env:CARGO_TARGET_DIR 'mipsel-unknown-linux-musl\release\client'
& node (Join-Path $base 'verify-elf.mjs') $built
if ($LASTEXITCODE -ne 0) {
    throw 'ELF validation failed'
}

$dist = Join-Path $base 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$output = Join-Path $dist 'csqtt-core-2.5.1-mt7621-r1-mipsel_24kc'
Copy-Item -LiteralPath $built -Destination $output -Force
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $output).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($output + '.sha256') -Encoding ascii -NoNewline -Value "$hash  $([IO.Path]::GetFileName($output))`n"

Get-Item -LiteralPath $output | Select-Object FullName, Length, LastWriteTime
"SHA256=$hash"
