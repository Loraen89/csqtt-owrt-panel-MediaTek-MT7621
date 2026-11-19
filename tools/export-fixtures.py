"""Export verified public staging binaries as bounded text fixtures for local CI parity."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile

project = Path(__file__).resolve().parents[1]
source = project / 'upstream/starkugz-v2.5.3/core253/root'
output = project / 'upstream/transfer'
output.mkdir(parents=True, exist_ok=True)
archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode='w:gz') as tar:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            tar.add(file, arcname=file.relative_to(source), recursive=False)
data = archive.getvalue()
encoded = base64.b64encode(data).decode('ascii')
parts = []
for index, offset in enumerate(range(0, len(encoded), 512000)):
    name = f'core253-{index:03d}.txt'
    text = encoded[offset:offset + 512000]
    (output / name).write_text(text, encoding='ascii')
    parts.append({'name': name, 'sha256': hashlib.sha256(text.encode()).hexdigest(), 'size': len(text)})
(output / 'manifest.json').write_text(json.dumps({
    'archive_size': len(data), 'archive_sha256': hashlib.sha256(data).hexdigest(),
    'parts': parts,
}, indent=2) + '\n')
print(f'Exported {len(parts)} text parts; {len(data)} compressed bytes')
