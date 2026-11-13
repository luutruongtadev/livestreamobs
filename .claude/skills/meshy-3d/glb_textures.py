#!/usr/bin/env python3
"""Nén texture trong file .glb: đổi cỡ mọi ảnh về tối đa SIZE px và lưu lại JPEG (giữ nguyên lưới).
Dùng: python3 -I glb_textures.py <vào.glb> <ra.glb> [size=1024] [quality=80]   (cần Pillow)"""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 80
data = open(src, 'rb').read()
magic, _ver, _total = struct.unpack('<III', data[:12])
assert magic == 0x46546C67, 'không phải GLB'
off, chunks = 12, []
while off < len(data):
    ln, typ = struct.unpack('<II', data[off:off + 8]); chunks.append((typ, data[off + 8:off + 8 + ln])); off += 8 + ln
gltf = json.loads(next(c for t, c in chunks if t == 0x4E4F534A))
binc = next((c for t, c in chunks if t == 0x004E4942), b'')
views = gltf.get('bufferViews', [])
repl = {}
for img in gltf.get('images', []):
    if 'bufferView' not in img: continue
    v = views[img['bufferView']]
    raw = binc[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    im = Image.open(io.BytesIO(raw))
    if max(im.size) > size: im.thumbnail((size, size), Image.LANCZOS)
    if im.mode not in ('RGB', 'L'): im = im.convert('RGB')
    out = io.BytesIO(); im.save(out, 'JPEG', quality=quality, optimize=True)
    repl[img['bufferView']] = out.getvalue(); img['mimeType'] = 'image/jpeg'
new = bytearray()
for i, v in enumerate(views):
    b = repl.get(i, binc[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']])
    while len(new) % 4: new.append(0)
    v['byteOffset'] = len(new); v['byteLength'] = len(b); new += b
while len(new) % 4: new.append(0)
gltf['buffers'][0]['byteLength'] = len(new)
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
body = struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(new), 0x004E4942) + bytes(new)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)
print(f'{src} → {dst}: {len(data) // 1024} KB → {(12 + len(body)) // 1024} KB')
