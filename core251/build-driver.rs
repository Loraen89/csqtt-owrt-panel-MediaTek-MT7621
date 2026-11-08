use std::{
    env,
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
    process::{exit, Command},
};

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetShortPathNameW(long: *const u16, short: *mut u16, size: u32) -> u32;
}

fn short_path(arg: &OsStr) -> OsString {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};

    let path = Path::new(arg);
    if !path.is_absolute() {
        return arg.to_owned();
    }

    // Keep the original file name. GetShortPathNameW uppercases the DOS leaf
    // (for example test.c -> TEST.C); Clang treats an uppercase .C suffix as
    // C++, which breaks CMake's compiler probe and several C dependencies.
    if path.is_file() {
        if let (Some(parent), Some(name)) = (path.parent(), path.file_name()) {
            return PathBuf::from(short_path(parent.as_os_str()))
                .join(name)
                .into_os_string();
        }
    }

    let wide: Vec<u16> = arg.encode_wide().chain(Some(0)).collect();
    let mut out = vec![0u16; 32768];
    let n = unsafe { GetShortPathNameW(wide.as_ptr(), out.as_mut_ptr(), out.len() as u32) };
    if n > 0 && (n as usize) < out.len() {
        return OsString::from_wide(&out[..n as usize]);
    }

    // Output files may not exist yet. Shorten their existing parent and retain
    // the leaf name so Zig still receives an ASCII-safe absolute path.
    if let (Some(parent), Some(name)) = (path.parent(), path.file_name()) {
        if parent.exists() {
            return PathBuf::from(short_path(parent.as_os_str()))
                .join(name)
                .into_os_string();
        }
    }
    arg.to_owned()
}

fn response_args(text: &str) -> Vec<OsString> {
    text.lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let mut value = String::new();
            let mut chars = line.chars();
            while let Some(c) = chars.next() {
                if c == '\\' {
                    if let Some(next) = chars.next() {
                        value.push(next);
                    }
                } else {
                    value.push(c);
                }
            }
            value.into()
        })
        .collect()
}

fn main() {
    let exe = env::current_exe().expect("driver location");
    let local_tools = exe.parent().expect("driver parent");
    let shared_tools = PathBuf::from(
        option_env!("CSQTT_TOOLING")
            .expect("CSQTT_TOOLING must be set when compiling build-driver.rs"),
    )
    .canonicalize()
    .expect("shared build tooling");
    let name = exe.file_stem().unwrap().to_string_lossy();
    let mut args = env::args_os().skip(1);
    let mut command;

    if name == "rustc-wrapper" {
        command = Command::new(args.next().expect("rustc argument"));
        command.args(args).args(["-C", "dlltool=llvm-dlltool.cmd"]);
    } else {
        let zig = shared_tools.join("zig-fast/zig-x86_64-windows-0.15.2/zig.exe");
        command = Command::new(zig);
        command.args([
            if name == "mips-cxx" { "c++" } else { "cc" },
            "-target",
            "mipsel-linux-musleabi",
            "-mcpu=mips32r2",
            "-msoft-float",
            "-fuse-ld=lld",
        ]);

        // cc-rs supplies zstd sources as relative paths. Running Zig from the
        // short spelling of the same directory prevents Windows code-page
        // conversion from corrupting the Cyrillic workspace prefix.
        if let Ok(cwd) = env::current_dir() {
            command.current_dir(PathBuf::from(short_path(cwd.as_os_str())));
        }

        let mut expanded = Vec::new();
        for arg in args {
            if let Some(file) = arg.to_string_lossy().strip_prefix('@') {
                expanded.extend(response_args(
                    &std::fs::read_to_string(file).expect("Rust response file"),
                ));
            } else {
                expanded.push(arg);
            }
        }

        let linking = expanded.iter().any(|arg| arg == "-Wl,--as-needed");
        if linking {
            for dir in [
                shared_tools.join("mips-runtime/lib"),
                shared_tools.join("mips-runtime/lib/gcc/mipsel-openwrt-linux-musl/14.3.0"),
            ] {
                let dir = short_path(dir.as_os_str()).to_string_lossy().replace('\\', "/");
                command.arg(format!("-B{dir}/")).arg(format!("-L{dir}"));
            }
        }

        let mut converted = Vec::new();
        for arg in expanded {
            if arg == "--target=mipsel-unknown-linux-musl" {
                continue;
            }
            if arg == "-Wp,-U_FORTIFY_SOURCE" {
                converted.push(OsString::from("-U_FORTIFY_SOURCE"));
            } else if arg == "-lunwind" {
                converted.push(OsString::from("-lgcc_eh"));
            } else {
                converted.push(short_path(&arg));
            }
        }
        if linking {
            converted.push(OsString::from("-lgcc"));
        }

        let text = converted
            .iter()
            .map(|arg| {
                let value = arg.to_string_lossy().replace('\\', "/");
                format!("\"{}\"", value.replace('"', "\\\""))
            })
            .collect::<Vec<_>>()
            .join("\n");
        let response = local_tools.join(format!("zig-response-{}.txt", std::process::id()));
        std::fs::write(&response, text).expect("Zig response file");
        command.arg(format!(
            "@{}",
            short_path(response.as_os_str()).to_string_lossy()
        ));
    }

    match command.status() {
        Ok(status) => exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!("build driver: {error}");
            exit(1);
        }
    }
}
