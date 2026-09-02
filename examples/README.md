# examples/

ตัวอย่าง agent manifest อยู่ที่ [`manifest/examples/`](../manifest/examples)

- `researcher.yaml` — tools + skill + MCP ครบทุกประเภท
- `coder.yaml` — tool อย่างเดียว
- `analyst.yaml` — ตั้ง runtime เป็น `mock` เพื่อรันได้โดยไม่ต้องมี API key

```bash
node dist/cli/index.js inspect ../manifest/examples/researcher.yaml
```
