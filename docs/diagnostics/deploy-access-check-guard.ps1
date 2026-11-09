[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Router,
    [string]$User = 'root',
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$KnownHosts,
    [int]$TimeoutSeconds = 300,
    [int]$PollSeconds = 15,
    [int]$RequiredSuccesses = 3,
    [switch]$RebootAfterRollback
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$sourceRoot = Join-Path $repoRoot 'luci-app-csqtt\package'
$knownHostsPath = (Resolve-Path -LiteralPath $KnownHosts).Path
$asciiKnownHosts = Join-Path $env:TEMP 'csqtt-mt7621-known-hosts'
Copy-Item -LiteralPath $knownHostsPath -Destination $asciiKnownHosts -Force

$sshOptions = @(
    '-F', 'NUL',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-o', 'ConnectionAttempts=1',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', "UserKnownHostsFile=$($asciiKnownHosts.Replace('\', '/'))"
)
$routerSpec = "$User@$Router"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteBackup = "/root/csqtt-access-check-backup-$stamp"
$localBackup = Join-Path $repoRoot "deploy-backups\$stamp"
New-Item -ItemType Directory -Path $localBackup -Force | Out-Null

$files = @(
    [pscustomobject]@{
        Source = Join-Path $sourceRoot 'root\usr\share\rpcd\ucode\csqtt'
        Temp = '/tmp/csqtt-access-check.ucode'
        Target = '/usr/share/rpcd/ucode/csqtt'
        Backup = 'csqtt.ucode'
    },
    [pscustomobject]@{
        Source = Join-Path $sourceRoot 'htdocs\luci-static\resources\view\csqtt\status.js'
        Temp = '/tmp/csqtt-access-check-status.js'
        Target = '/www/luci-static/resources/view/csqtt/status.js'
        Backup = 'status.js'
    },
    [pscustomobject]@{
        Source = Join-Path $sourceRoot 'htdocs\luci-static\resources\view\csqtt\i18n.ru.json'
        Temp = '/tmp/csqtt-access-check-i18n.ru.json'
        Target = '/www/luci-static/resources/view/csqtt/i18n.ru.json'
        Backup = 'i18n.ru.json'
    },
    [pscustomobject]@{
        Source = Join-Path $sourceRoot 'root\usr\share\luci\menu.d\luci-app-csqtt.json'
        Temp = '/tmp/csqtt-access-check-menu.json'
        Target = '/usr/share/luci/menu.d/luci-app-csqtt.json'
        Backup = 'menu.json'
    }
)

function Invoke-Router {
    param([Parameter(Mandatory)] [string]$Command, [switch]$AllowFailure)
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & ssh.exe @sshOptions $routerSpec $Command 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0 -and -not $AllowFailure) {
        throw "Router command failed ($code): $($output -join [Environment]::NewLine)"
    }
    [pscustomobject]@{ ExitCode = $code; Output = ($output -join [Environment]::NewLine) }
}

function Copy-ToRouter {
    param([string]$Source, [string]$Target)
    & scp.exe -O @sshOptions $Source "${routerSpec}:$Target"
    if ($LASTEXITCODE -ne 0) { throw "SCP upload failed: $Source" }
}

function Copy-FromRouter {
    param([string]$Source, [string]$Target)
    & scp.exe -O @sshOptions "${routerSpec}:$Source" $Target
    if ($LASTEXITCODE -ne 0) { throw "SCP backup failed: $Source" }
}

function Invoke-Rollback {
    Write-Warning "Verification failed. Restoring $remoteBackup."
    $rebootCommand = if ($RebootAfterRollback) { 'sync; reboot' } else { 'sync' }
    $command = @"
set -e
cp -p '$remoteBackup/csqtt.ucode' '/usr/share/rpcd/ucode/csqtt'
cp -p '$remoteBackup/status.js' '/www/luci-static/resources/view/csqtt/status.js'
cp -p '$remoteBackup/i18n.ru.json' '/www/luci-static/resources/view/csqtt/i18n.ru.json'
cp -p '$remoteBackup/menu.json' '/usr/share/luci/menu.d/luci-app-csqtt.json'
cp -p '$remoteBackup/csqtt.config' '/etc/config/csqtt'
rm -f /var/run/csqtt/access-check.json /tmp/luci-indexcache
/etc/init.d/rpcd restart
$rebootCommand
"@
    $null = Invoke-Router -Command $command -AllowFailure
}

foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file.Source -PathType Leaf)) {
        throw "Source file is missing: $($file.Source)"
    }
}

$backupCommand = @"
set -e
mkdir -p '$remoteBackup'
cp -p '/usr/share/rpcd/ucode/csqtt' '$remoteBackup/csqtt.ucode'
cp -p '/www/luci-static/resources/view/csqtt/status.js' '$remoteBackup/status.js'
cp -p '/www/luci-static/resources/view/csqtt/i18n.ru.json' '$remoteBackup/i18n.ru.json'
cp -p '/usr/share/luci/menu.d/luci-app-csqtt.json' '$remoteBackup/menu.json'
cp -p '/etc/config/csqtt' '$remoteBackup/csqtt.config'
(pidof csqtt-core-2.5.0 || pidof csqtt-core-2.1.9 || pidof csqtt-core) > '$remoteBackup/csqtt.pid'
date -Iseconds > '$remoteBackup/created-at.txt'
"@
$null = Invoke-Router -Command $backupCommand

foreach ($file in $files) {
    Copy-FromRouter -Source $file.Target -Target (Join-Path $localBackup $file.Backup)
    Copy-ToRouter -Source $file.Source -Target $file.Temp
}

$installCommand = @"
set -e
ucode -c -o /tmp/csqtt-access-check.ucb /tmp/csqtt-access-check.ucode
cp -f /tmp/csqtt-access-check.ucode /usr/share/rpcd/ucode/csqtt
cp -f /tmp/csqtt-access-check-status.js /www/luci-static/resources/view/csqtt/status.js
cp -f /tmp/csqtt-access-check-i18n.ru.json /www/luci-static/resources/view/csqtt/i18n.ru.json
cp -f /tmp/csqtt-access-check-menu.json /usr/share/luci/menu.d/luci-app-csqtt.json
chmod 0644 /usr/share/rpcd/ucode/csqtt /www/luci-static/resources/view/csqtt/status.js /www/luci-static/resources/view/csqtt/i18n.ru.json /usr/share/luci/menu.d/luci-app-csqtt.json
rm -f /var/run/csqtt/access-check.json /tmp/luci-indexcache
/etc/init.d/rpcd restart
"@
try {
    $null = Invoke-Router -Command $installCommand
} catch {
    Invoke-Rollback
    throw
}

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$successes = 0
$lastProbe = ''
do {
    $probeCommand = @'
default_code=$(curl -4 -L -sS --connect-timeout 5 --max-time 12 -o /dev/null -w '%{http_code}' https://openwrt.org/ || true)
tunnel_code=$(curl -4 -L -sS --connect-timeout 5 --max-time 12 --interface csqtt0 -o /dev/null -w '%{http_code}' https://openwrt.org/ || true)
dns_ok=0; nslookup openwrt.org 127.0.0.1 >/dev/null 2>&1 && dns_ok=1
csqtt_ok=0; /etc/init.d/csqtt status >/dev/null 2>&1 && csqtt_ok=1
clash_ok=1
if test -x /etc/init.d/clash; then
    clash_ok=0; /etc/init.d/clash status >/dev/null 2>&1 && clash_ok=1
fi
tun_ok=0; ip link show csqtt0 >/dev/null 2>&1 && tun_ok=1
printf 'default=%s tunnel=%s dns=%s csqtt=%s clash=%s tun=%s\n' "$default_code" "$tunnel_code" "$dns_ok" "$csqtt_ok" "$clash_ok" "$tun_ok"
case "$default_code:$tunnel_code:$dns_ok:$csqtt_ok:$clash_ok:$tun_ok" in
    2??:2??:1:1:1:1|2??:3??:1:1:1:1|3??:2??:1:1:1:1|3??:3??:1:1:1:1) exit 0 ;;
    *) exit 1 ;;
esac
'@
    $probe = Invoke-Router -Command $probeCommand -AllowFailure
    $lastProbe = $probe.Output
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $lastProbe"
    if ($probe.ExitCode -eq 0) {
        $successes++
        if ($successes -ge $RequiredSuccesses) {
            $pidCommand = 'old_pid=$(cat ''{0}/csqtt.pid''); new_pid=$(pidof csqtt-core-2.5.0 || pidof csqtt-core-2.1.9 || pidof csqtt-core); test "$old_pid" = "$new_pid"' -f $remoteBackup
            $pidCheck = Invoke-Router -Command $pidCommand -AllowFailure
            if ($pidCheck.ExitCode -ne 0) {
                Invoke-Rollback
                throw 'CSQTT PID changed during an RPC/UI-only deployment.'
            }
            Write-Host "Deployment verified. Backup: $localBackup"
            exit 0
        }
    } else {
        $successes = 0
    }
    Start-Sleep -Seconds $PollSeconds
} while ([DateTime]::UtcNow -lt $deadline)

Write-Warning "Last failed probe: $lastProbe"
Invoke-Rollback
exit 2
