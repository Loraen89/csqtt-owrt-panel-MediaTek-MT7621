use portable_atomic::AtomicI64;
// SPDX-FileCopyrightText: 2026 amurcanov
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

use crate::{
    client_perf::{self, Stage as PerfStage},
    events::Events,
};
use std::sync::{
    Arc,
    atomic::{AtomicI32, Ordering},
};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct Stats {
    pub total_bytes_up: AtomicI64,
    pub total_bytes_down: AtomicI64,
    pub active_connections: AtomicI32,
}

impl Stats {
    pub async fn run(self: Arc<Self>, events: Events, cancel: CancellationToken) {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3));
        interval.tick().await;
        let started_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        loop {
            tokio::select! {
                _ = cancel.cancelled() => return,
                _ = interval.tick() => {
                    client_perf::measure(PerfStage::StatsEmit, || {
                        let active = self.active_connections.load(Ordering::Relaxed);
                        let up = self.total_bytes_up.load(Ordering::Relaxed);
                        let down = self.total_bytes_down.load(Ordering::Relaxed);
                        let total_mb = (up + down) as f64 / (1024.0 * 1024.0);
                        crate::log_error!("[СТАТИСТИКА] Активных: {active} | Трафик: {total_mb:.2} МБ");

                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        let uptime = now.saturating_sub(started_at);
                        write_status_json(active, up, down, uptime, started_at, now);

                        events.stats(active, up, down);
                    });
                }
            }
        }
    }
}

fn write_status_json(active: i32, up: i64, down: i64, uptime: u64, started_at: u64, now: u64) {
    let status = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "daemon_state": "running",
        "started_at": started_at,
        "generated_at": now,
        "uptime_secs": uptime,
        "workers": {
            "configured": 0,
            "active": active
        },
        "connectivity": {
            "process_running": true,
            "tun_present": true,
            "session_established": active > 0,
            "transfer_observed": (up > 0 || down > 0),
            "access_verified": false,
            "stage": if active > 0 { "connected" } else { "connecting" },
            "access_state": if active > 0 { "ok" } else { "waiting" },
            "session_age_secs": uptime
        },
        "rx_bytes": down,
        "tx_bytes": up,
        "reconnects": 0
    });

    let _ = std::fs::create_dir_all("/var/run/csqtt");
    let tmp = "/var/run/csqtt/status.json.tmp";
    if let Ok(content) = serde_json::to_string_pretty(&status) {
        if std::fs::write(tmp, content).is_ok() {
            let _ = std::fs::rename(tmp, "/var/run/csqtt/status.json");
        }
    }
}
