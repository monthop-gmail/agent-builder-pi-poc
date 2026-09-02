# agent-builder-pi-poc

> **📦 Historical / Reference PoC — ไม่พัฒนาต่อแล้ว**
>
> repo นี้เป็นที่ที่แนวคิด **Agent Manifest → Builder → Runtime Adapter** ถูกวางเป็นครั้งแรก
> และ commit แรกก็วาง seam นั้นไว้ครบแล้ว
>
> implementation ที่ใช้งานจริงย้ายไปที่ **[`agent-builder-dsh-poc`](https://github.com/monthop-gmail/agent-builder-dsh-poc)**
> ซึ่งดูด Pi เข้าไปเป็น `--target pi` เรียบร้อยแล้ว —
> ที่นั่นมี 5 runtime target, policy ที่บังคับได้จริง, `resume()`, และ conformance ที่รันครบทุก target
>
> **อย่าเริ่มงานใหม่ที่นี่** เก็บไว้เพื่อให้ git history และความคิดต้นฉบับยังอ่านได้

---

> สร้าง Agent จาก Agent Manifest แล้วให้ Pi เป็น runtime สำหรับ execute Agent นั้น

สถานะ: 🧊 **Frozen** — เดิมเป็น PoC (P0–P3) ที่ใช้งานได้ ไม่ใช่ production
ไม่มี UI / database / orchestration ตามข้อตกลงรอบแรก

```text
        Agent Manifest (.yaml)
                │
                ▼
        ┌───────────────┐
        │ Agent Builder │   loader → validator → resolver → compiler
        └───────┬───────┘
                │  CompiledAgent (runtime-neutral)
                ▼
         Runtime Adapter        ← สลับ runtime ได้ที่นี่ โดยไม่แก้ Manifest
                │
                ▼
         Pi Agent Runtime
          (model / tools / MCP)
```

## ทำไมโครงแบบนี้

- **Manifest ไม่รู้จัก Pi** — ห้ามมี `piAgentCore:` หรือ field เฉพาะ runtime ใด ๆ (validator บังคับด้วย `strictObject` + test ตรวจ)
- **Tool / Skill / MCP แยกกัน** — Tool = executable capability, Skill = reusable instructions, MCP = external capability provider ผ่าน server จริง
- **Runtime เป็น interface เดียว** (`runtime/executor.ts`) — วันหน้าเพิ่ม `DeepSeekRuntime` / `ClaudeRuntime` ได้โดย Manifest เดิมยังใช้ได้

## โครงสร้าง

```text
manifest/schema/agent-manifest.schema.json   JSON Schema (agent/v1)
manifest/examples/*.yaml                     researcher / coder / analyst
builder/loader.ts                            ไฟล์ → object (yaml/json)
builder/validator.ts                         ตรวจ contract + ความมีอยู่จริงใน registry
builder/resolver.ts                          ชื่อ → implementation (ผ่าน registry ทั้งสาม)
builder/compiler.ts                          Manifest → CompiledAgent
runtime/executor.ts                          เลือก runtime จาก id (จุด swap)
runtime/pi-adapter.ts                        CompiledAgent → Pi AgentSession
runtime/mock-adapter.ts                      runtime ปลอมสำหรับ test ไร้ key/เน็ต
tools/  skills/  mcp/                        registry ของแต่ละประเภท
cli/index.ts                                 validate / build / inspect / run
```

## ใช้งาน

```bash
npm install --ignore-scripts
npm run build

node dist/cli/index.js validate manifest/examples/researcher.yaml
node dist/cli/index.js inspect  manifest/examples/researcher.yaml
node dist/cli/index.js run      manifest/examples/analyst.yaml --runtime mock --input "hello"

# รันจริงบน Pi — ใส่ key ลง .env (ดู .env.example) แล้วส่งผ่าน --env-file
# provider ที่ pi-ai รองรับ เช่น anthropic (ANTHROPIC_API_KEY) หรือ zai/GLM (ZAI_API_KEY)
cp .env.example .env   # แล้วใส่ key ของคุณ
node --env-file=.env dist/cli/index.js run manifest/examples/researcher.json \
  --input "What is 12 * 12? Use your tools if needed."
```

ตัวอย่าง GLM: `manifest/examples/researcher.json` ใช้ `provider: zai` + `id: glm-4.7`
(model อื่นใน catalog: glm-4.7, glm-5-turbo, glm-5.2, glm-5.3, glm-5.3-flash ฯลฯ)

## Definition of Done

- [x] Agent Manifest สามารถ validate ได้ (schema + registry checks + tests)
- [x] Manifest สามารถ compile เป็น Agent ได้ (CompiledAgent, runtime-neutral)
- [x] Agent สามารถ run บน Pi ได้ (PiRuntime → `createAgentSession`, stream text ออกมา)
- [x] Tool / Skill / MCP สามารถ inject ได้ (Tool/Skill registry + MCP client ต่อ stdio server จริง)
- [x] เปลี่ยน Runtime Adapter โดยไม่แก้ Manifest (`--runtime mock` กับ manifest ที่ runtime.type = pi ทำงานได้ทันที)

ข้อสุดท้ายสำคัญที่สุด — และถูกพิสูจน์ด้วย test: `executor.ts` เป็นไฟล์เดียวที่รู้จักชื่อ runtime ทั้งหมด

## ขอบเขต PoC (ยังไม่ทำ)

UI, database, orchestration, multi-agent (P4), `resume()` (interface มีแล้ว รอ P4+)

## ที่เกี่ยวกับ ecosystem

- Repo นี้อยู่ชั้น **L4 (Harness & Agent)** เสนอ contract แบบ Manifest-first ให้ `agent-platform` (L3) ใช้ต่อ
- กฎ: ไม่ duplicate `llm-gateway` (L2) — ตอนนี้โมเดลเรียกผ่าน pi-ai ตรง ๆ เพราะเป็น PoC; ตอนรวม ecosystem ให้ชี้ `provider` เข้า gateway endpoint แทน
- อ้างอิง: [ecosystem-brief](https://github.com/monthop-gmail/ecosystem-brief), [Pi Agent Harness](https://github.com/earendil-works/pi)


---

## สิ่งที่ repo นี้เริ่มไว้ และถูกยกไปต่อที่ไหน

| แนวคิดที่วางไว้ที่นี่ | สถานะใน `agent-builder-dsh-poc` |
|---|---|
| Agent Manifest เป็น contract | `agent/v1alpha2` — แต่ **ไม่มี `spec.runtime`** แล้ว runtime เป็น `--target` ตอน build |
| Builder: loader → validator → resolver → compiler | เพิ่ม policy + packager · `CompiledAgent` ยัง runtime-neutral |
| Runtime adapter เป็น seam เดียว | `AgentRuntime` 5 เมธอด · 5 target: `pi` `dsh` `acp` `openai-compatible` `mock` |
| Pi runtime | `runtimes/pi/adapter.ts` |
| Tool / Skill / MCP แยกกัน | เหมือนเดิม + MCP ผ่าน `mcp-client.ts` ที่เดียวเพื่อให้ policy คุมถึง |
| สลับ runtime โดยไม่แก้ Manifest | `portability.test.ts` — build ทุก target แล้ว assert ว่า package เท่ากันทุกไบต์ |

### สามอย่างที่ถูกแก้ตอนย้าย

จดไว้เพราะเป็นบั๊กที่อ่านโค้ดเฉย ๆ แล้วมองไม่เห็น — รายละเอียดอยู่ใน
[`docs/poc-review-2026-09-02.md` §10.3](https://github.com/monthop-gmail/agent-builder-dsh-poc/blob/main/docs/poc-review-2026-09-02.md)

1. **`resolveModel().catch(() => undefined)`** — model ที่ไม่อยู่ใน catalog ของ pi-ai จะเงียบ ๆ
   ตกไปใช้ default ของ Pi แปลว่า manifest ระบุ model ตัวหนึ่งแต่รันด้วยอีกตัวโดยไม่มีใครรู้
2. **MCP tool ถูกยัดเข้าโมเดลตรง ๆ ไม่ผ่าน policy** — `forbidden` กับ approval ไม่มีผลกับมัน
3. **Pi built-in (`read`/`bash`/`edit`/`write`) หลุดเข้ามาได้** — แก้ด้วย `noTools: "all"` + allowlist

ข้อ 2 เป็นบั๊กเดียวกับที่ DSH PoC เคยเจอและแก้ไปก่อนหน้า — ตอนย้ายจึงบังคับให้ adapter
หยิบ MCP tool ผ่านทางเดียวเท่านั้น เพื่อให้ลืมไม่ได้อีก

### และหนึ่งอย่างที่ Pi ถูกเข้าใจผิด

เคยสรุปกันว่า Pi honour `humanApproval` ไม่ได้เพราะไม่มี permission system —
**ไม่จริง** Pi ไม่มี permission system ก็จริง แต่ adapter เป็นคนเขียน `execute` ของทุก tool เอง
จึงดักขออนุมัติก่อน side effect ได้ ตอนนี้ `--target pi` บังคับ approval ได้จริงและมีเทสต์ยืนยัน

สิ่งที่ repo นี้ขาดคือ **adapter ไม่ได้ทำ** ไม่ใช่ **Pi ทำไม่ได้**
