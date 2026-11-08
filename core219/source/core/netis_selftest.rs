use anyhow::{Result, bail, ensure};
use portable_atomic::AtomicU64;
use std::{
    sync::{Arc, atomic::Ordering},
    thread,
};

/// Offline checks only: no DNS, remote server, addresses, or routes.
pub fn run() -> Result<()> {
    let expected = hex::decode("aa77380e1203f9e02b705efd192b19020c011619af3d70b03e70c13658e373f4")?;
    ensure!(
        crate::wrap::derive_wrap_key("test-password")?.as_slice() == expected.as_slice(),
        "HKDF wire vector mismatch"
    );

    let counter = Arc::new(AtomicU64::new(1_u64 << 40));
    let mut threads = Vec::new();
    for _ in 0..4 {
        let counter = counter.clone();
        threads.push(thread::spawn(move || {
            for _ in 0..10_000 {
                counter.fetch_add(1, Ordering::SeqCst);
            }
        }));
    }
    for worker in threads {
        worker
            .join()
            .map_err(|_| anyhow::anyhow!("atomic worker panic"))?;
    }
    ensure!(
        counter.load(Ordering::SeqCst) == (1_u64 << 40) + 40_000,
        "64-bit atomic fallback mismatch"
    );

    let name = "csqttcheck";
    let sysfs = format!("/sys/class/net/{name}");
    if std::path::Path::new(&sysfs).exists() {
        bail!("test interface already exists; refusing to alter it");
    }
    let tun = crate::native_tun::create_tun_interface(name, 1300)?;
    ensure!(
        std::fs::read_to_string(format!("{sysfs}/mtu"))?.trim() == "1300",
        "TUN MTU mismatch"
    );
    drop(tun);
    ensure!(
        !std::path::Path::new(&sysfs).exists(),
        "temporary TUN did not disappear"
    );

    println!("PASS: HKDF vector, concurrent 64-bit atomics, native MIPS TUN create/MTU/cleanup");
    Ok(())
}
