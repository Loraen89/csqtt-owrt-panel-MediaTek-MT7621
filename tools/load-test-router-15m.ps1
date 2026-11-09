param(
    [int]$PhaseSeconds = 300,
    [int]$Streams = 36,
    [int]$SampleSeconds = 15,
    [string]$KnownHosts = './router-clean-25125-20261102-known-hosts',
    [string]$Router = 'root@192.168.7.1',
    [string]$ClientAddress = '192.168.7.207'
)

$ErrorActionPreference = 'Stop'
[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture
$SshArgs = @(
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', "UserKnownHostsFile=$KnownHosts",
    $Router
)

$RussianUrls = @(
    'https://speedtest.selectel.ru/10GB',
    'https://mirror.yandex.ru/ubuntu-releases/24.04.3/ubuntu-24.04.3-live-server-amd64.iso',
    'https://mirror.timeweb.ru/ubuntu-releases/24.04.3/ubuntu-24.04.3-live-server-amd64.iso',
    'https://mirror.truenetwork.ru/ubuntu-releases/24.04.3/ubuntu-24.04.3-live-server-amd64.iso'
)
$ForeignUrls = @(
    'https://proof.ovh.net/files/1Gb.dat',
    'https://releases.ubuntu.com/24.04.3/ubuntu-24.04.3-live-server-amd64.iso',
    'https://download.thinkbroadband.com/1GB.zip',
    'https://ash-speed.hetzner.com/1GB.bin'
)

$RemoteSample = @'
st="$(ubus call csqtt status 2>/dev/null)"; set -- $(head -1 /proc/stat); cpid=$(printf "%s" "$st" | jsonfilter -e "@.pid"); cjid=0; [ -r /proc/$cpid/stat ] && cjid=$(awk '{print $14+$15}' /proc/$cpid/stat); xpid=$(pidof clash | awk '{print $1}'); xjid=0; [ -r /proc/$xpid/stat ] && xjid=$(awk '{print $14+$15}' /proc/$xpid/stat); printf "%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n" "$(date +%s)" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$(cut -d' ' -f1 /proc/loadavg)" "$(awk '/MemAvailable/{print $2}' /proc/meminfo)" "$(cat /sys/class/net/wwan0/statistics/rx_bytes)" "$(cat /sys/class/net/wwan0/statistics/tx_bytes)" "$(cat /sys/class/net/csqtt0/statistics/rx_bytes)" "$(cat /sys/class/net/csqtt0/statistics/tx_bytes)" "$cpid" "$cjid" "$xpid" "$xjid" "$(printf "%s" "$st" | jsonfilter -e '@.status.reconnects')" "$(printf "%s" "$st" | jsonfilter -e '@.status.workers.active')" "$(printf "%s" "$st" | jsonfilter -e '@.connected')"
'@

function Get-RouterSample {
    $line = (& ssh @SshArgs $RemoteSample 2>$null | Select-Object -Last 1)
    if (-not $line -or ($line -split ',').Count -ne 21) {
        throw "Invalid router sample: $line"
    }
    $f = $line -split ','
    [pscustomobject]@{
        Epoch = [double]$f[0]
        User = [double]$f[1]
        Nice = [double]$f[2]
        System = [double]$f[3]
        Idle = [double]$f[4]
        IoWait = [double]$f[5]
        Irq = [double]$f[6]
        SoftIrq = [double]$f[7]
        Load = [double]$f[8]
        MemAvailableKiB = [double]$f[9]
        WwanRx = [double]$f[10]
        WwanTx = [double]$f[11]
        CsqttRx = [double]$f[12]
        CsqttTx = [double]$f[13]
        CsqttPid = $f[14]
        CsqttJiffies = [double]$f[15]
        ClashPid = $f[16]
        ClashJiffies = [double]$f[17]
        Reconnects = [int]$f[18]
        Workers = [int]$f[19]
        Connected = $f[20]
    }
}

function Start-LoadProcesses([string[]]$Urls, [int]$Count, [string]$PhaseName) {
    $processes = @()
    for ($i = 0; $i -lt $Count; $i++) {
        $url = $Urls[$i % $Urls.Count]
        $arguments = @(
            '-4', '-L', '--interface', $ClientAddress,
            '--connect-timeout', '10', '--max-time', ([string]($PhaseSeconds + 15)),
            '--retry', '2', '--retry-delay', '1',
            '-sS', '-o', 'NUL', $url
        )
        $processes += Start-Process -FilePath 'curl.exe' -ArgumentList $arguments -PassThru -WindowStyle Hidden
    }
    Write-Host ("LOAD_START phase={0} streams={1} pids={2}" -f $PhaseName, $Count, (($processes.Id) -join ','))
    return $processes
}

function Stop-LoadProcesses($Processes) {
    foreach ($process in $Processes) {
        if ($null -ne $process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-Average($Values) {
    if (-not $Values -or $Values.Count -eq 0) { return 0 }
    return ($Values | Measure-Object -Average).Average
}

function Get-Maximum($Values) {
    if (-not $Values -or $Values.Count -eq 0) { return 0 }
    return ($Values | Measure-Object -Maximum).Maximum
}

function Run-Phase([string]$Name, [string[]]$Urls, [int]$Count) {
    $processes = @()
    $rows = @()
    $start = Get-RouterSample
    $previous = $start
    try {
        $processes = Start-LoadProcesses -Urls $Urls -Count $Count -PhaseName $Name
        $iterations = [math]::Floor($PhaseSeconds / $SampleSeconds)
        for ($i = 1; $i -le $iterations; $i++) {
            Start-Sleep -Seconds $SampleSeconds
            try {
                $current = Get-RouterSample
            }
            catch {
                Write-Output ("SAMPLE phase={0} n={1} error={2}" -f $Name, $i, $_.Exception.Message)
                continue
            }
            $elapsed = [math]::Max(1, $current.Epoch - $previous.Epoch)
            $previousTotal = $previous.User + $previous.Nice + $previous.System + $previous.Idle + $previous.IoWait + $previous.Irq + $previous.SoftIrq
            $currentTotal = $current.User + $current.Nice + $current.System + $current.Idle + $current.IoWait + $current.Irq + $current.SoftIrq
            $totalDelta = [math]::Max(1, $currentTotal - $previousTotal)
            $idleDelta = ($current.Idle + $current.IoWait) - ($previous.Idle + $previous.IoWait)
            $cpu = 100 * ($totalDelta - $idleDelta) / $totalDelta
            $csqttCpu = 400 * ($current.CsqttJiffies - $previous.CsqttJiffies) / $totalDelta
            $clashCpu = 400 * ($current.ClashJiffies - $previous.ClashJiffies) / $totalDelta
            $wwanMbps = 8 * ($current.WwanRx - $previous.WwanRx) / $elapsed / 1000000
            $csqttMbps = 8 * ($current.CsqttRx - $previous.CsqttRx) / $elapsed / 1000000
            $active = @($processes | Where-Object { -not $_.HasExited }).Count
            $row = [pscustomobject]@{
                Cpu = $cpu
                CsqttCpu = $csqttCpu
                ClashCpu = $clashCpu
                WwanMbps = $wwanMbps
                CsqttMbps = $csqttMbps
                Load = $current.Load
                MemMiB = $current.MemAvailableKiB / 1024
                Active = $active
            }
            $rows += $row
            Write-Output ("SAMPLE phase={0} n={1}/{2} cpu={3:N1}% csqtt_cpu={4:N1}% clash_cpu={5:N1}% wwan_rx={6:N2}Mbps csqtt_rx={7:N2}Mbps load={8:N2} mem={9:N1}MiB active={10} workers={11} reconnects={12} connected={13}" -f $Name, $i, $iterations, $cpu, $csqttCpu, $clashCpu, $wwanMbps, $csqttMbps, $current.Load, ($current.MemAvailableKiB / 1024), $active, $current.Workers, $current.Reconnects, $current.Connected)
            $previous = $current
        }
    }
    finally {
        Stop-LoadProcesses -Processes $processes
    }
    $finish = Get-RouterSample
    $duration = [math]::Max(1, $finish.Epoch - $start.Epoch)
    $wwanBytes = $finish.WwanRx - $start.WwanRx
    $csqttBytes = $finish.CsqttRx - $start.CsqttRx
    Write-Output ("PHASE_SUMMARY phase={0} seconds={1:N0} wwan_rx_bytes={2:N0} csqtt_rx_bytes={3:N0} avg_wwan={4:N2}Mbps max_wwan={5:N2}Mbps avg_csqtt={6:N2}Mbps max_csqtt={7:N2}Mbps avg_cpu={8:N1}% max_cpu={9:N1}% avg_csqtt_cpu={10:N1}% max_csqtt_cpu={11:N1}% avg_clash_cpu={12:N1}% max_clash_cpu={13:N1}% min_mem={14:N1}MiB max_load={15:N2} pid={16} workers={17} reconnects={18} connected={19}" -f $Name, $duration, $wwanBytes, $csqttBytes, (Get-Average $rows.WwanMbps), (Get-Maximum $rows.WwanMbps), (Get-Average $rows.CsqttMbps), (Get-Maximum $rows.CsqttMbps), (Get-Average $rows.Cpu), (Get-Maximum $rows.Cpu), (Get-Average $rows.CsqttCpu), (Get-Maximum $rows.CsqttCpu), (Get-Average $rows.ClashCpu), (Get-Maximum $rows.ClashCpu), (($rows.MemMiB | Measure-Object -Minimum).Minimum), (Get-Maximum $rows.Load), $finish.CsqttPid, $finish.Workers, $finish.Reconnects, $finish.Connected)
}

$testId = Get-Date -Format 'yyyyMMdd-HHmmss'
& ssh @SshArgs "logger -t csqtt-load-test 'START $testId streams=$Streams phase_seconds=$PhaseSeconds'"
Write-Output "TEST_START id=$testId phase_seconds=$PhaseSeconds streams=$Streams sample_seconds=$SampleSeconds"

try {
    Run-Phase -Name 'RU' -Urls $RussianUrls -Count $Streams
    Run-Phase -Name 'FOREIGN' -Urls $ForeignUrls -Count $Streams
    $mixedUrls = @()
    for ($i = 0; $i -lt [math]::Ceiling($Streams / 2); $i++) { $mixedUrls += $RussianUrls[$i % $RussianUrls.Count] }
    for ($i = 0; $i -lt [math]::Floor($Streams / 2); $i++) { $mixedUrls += $ForeignUrls[$i % $ForeignUrls.Count] }
    Run-Phase -Name 'MIXED' -Urls $mixedUrls -Count $Streams
}
finally {
    & ssh @SshArgs "logger -t csqtt-load-test 'END $testId'"
}

Write-Output 'FINAL_STATUS'
& ssh @SshArgs 'ubus call csqtt status; echo RELEVANT_LOGS; logread | awk "/csqtt-load-test.*START/{capture=1} capture" | grep -Evi "__CSQTT_EVENT__\\|STATS" | grep -Ei "csqtt-load-test|oom|out of memory|segfault|watchdog|kernel panic|netifd.*(error|fail|down)|modemmanager.*(error|fail|disconnect)|csqtt.*(disconnect|reconnect|error|fail)|procd.*(respawn|crash)" | tail -120'
Write-Output "TEST_END id=$testId"
