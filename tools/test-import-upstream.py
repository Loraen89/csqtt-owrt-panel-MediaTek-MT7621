import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("import_upstream", Path(__file__).with_name("import-upstream.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def tar_files(files):
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w:gz") as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    return result.getvalue()


class ImportTests(unittest.TestCase):
    def test_legacy_ipk_and_exact_file_bytes(self):
        package = tar_files({"./debian-binary": b"2.0\n", "./control.tar.gz": tar_files({"./control": b"Package: test\n"}),
                             "./data.tar.gz": tar_files({"./usr/bin/client": bytes(range(256))})})
        asset = {"name": "test.ipk", "size": len(package), "sha256": hashlib.sha256(package).hexdigest()}
        with tempfile.TemporaryDirectory() as directory:
            module.import_package(package, asset, Path(directory))
            self.assertEqual((Path(directory) / "root/usr/bin/client").read_bytes(), bytes(range(256)))

    def test_rejects_changed_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "SHA256"):
                module.import_package(b"wrong", {"name": "test", "size": 5, "sha256": "0" * 64}, Path(directory))

    def test_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                module.unpack(tar_files({"../escape": b"bad"}), Path(directory))

    def test_rejects_absolute_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                module.unpack(tar_files({"/escape": b"bad"}), Path(directory))

    def test_rejects_symlink(self):
        result = io.BytesIO()
        with tarfile.open(fileobj=result, mode="w:gz") as archive:
            member = tarfile.TarInfo("link")
            member.type = tarfile.SYMTYPE
            member.linkname = "/outside"
            archive.addfile(member)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                module.unpack(result.getvalue(), Path(directory))


if __name__ == "__main__":
    unittest.main()
