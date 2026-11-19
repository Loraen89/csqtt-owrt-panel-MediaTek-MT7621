"""Import checksum-pinned upstream packages without executing their contents.

This is a staging import, not an installer or a hardware-validation claim.
"""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile
import urllib.request


def ar_members(data):
    if data[:8] != b"!<arch>\n":
        raise ValueError("Expected IPK ar container")
    offset = 8
    result = {}
    while offset < len(data):
        header = data[offset:offset + 60]
        if len(header) != 60 or header[58:] != b"`\n":
            raise ValueError("Invalid ar header")
        name = header[:16].decode("ascii").strip().rstrip("/")
        size = int(header[48:58].strip())
        offset += 60
        if size < 0 or offset + size > len(data) or name in result:
            raise ValueError("Truncated or duplicate ar member")
        result[name] = data[offset:offset + size]
        offset += size + size % 2
    if result.get("debian-binary") != b"2.0\n":
        raise ValueError("Unsupported IPK format")
    return result


def unpack(data, target):
    """Write regular files/directories only; reject escaping paths and links."""
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
        for member in archive.getmembers():
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts:
                raise ValueError(f"Unsafe archive path: {member.name}")
            if member.isdir():
                (target / name).mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                destination = target / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source:
                    destination.write_bytes(source.read())
                destination.chmod(member.mode & 0o777)
            else:
                raise ValueError(f"Unsupported archive member: {member.name}")


def import_package(data, asset, destination):
    if len(data) != asset["size"] or hashlib.sha256(data).hexdigest() != asset["sha256"]:
        raise ValueError(f"Size/SHA256 mismatch: {asset['name']}")
    members = ar_members(data)
    for prefix, directory in [("control.tar", "control"), ("data.tar", "root")]:
        selected = [name for name in members if name.startswith(prefix + ".") or name == prefix]
        if len(selected) != 1:
            raise ValueError(f"Expected exactly one {prefix}")
        unpack(members[selected[0]], destination / directory)
    return {**asset, "files": sorted(str(p.relative_to(destination)) for p in destination.rglob("*") if p.is_file())}


def main():
    project = Path(__file__).resolve().parents[1]
    lock = json.loads((project / "tools/upstream-mt7621.json").read_text())
    destination = project / "upstream/starkugz-v2.5.3"
    if destination.exists():
        raise ValueError("Staging directory already exists; refusing to mix imports")
    records = []
    for asset in lock["assets"]:
        url = f"https://github.com/{lock['repository']}/releases/download/{lock['tag']}/{asset['name']}"
        request = urllib.request.Request(url, headers={"User-Agent": "MT7621-upstream-import"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read(asset["size"] + 1)
        record = import_package(data, asset, destination / asset["component"])
        records.append({**record, "url": url})
        print(f"Verified {asset['component']}: {len(record['files'])} files")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "IMPORT.json").write_text(json.dumps({**lock, "assets": records}, indent=2) + "\n")


if __name__ == "__main__":
    main()
