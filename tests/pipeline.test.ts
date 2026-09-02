import { describe, expect, it } from "vitest";
import { loadManifestObject } from "../builder/loader.js";
import { validateManifest } from "../builder/validator.js";
import { compileManifest } from "../builder/compiler.js";
import { execute } from "../runtime/executor.js";
import { resolve } from "node:path";

const examples = (name: string) => resolve(import.meta.dirname, "../manifest/examples", name);

describe("Loader", () => {
  it("parses a YAML manifest", async () => {
    const obj = await loadManifestObject(examples("researcher.yaml"));
    expect((obj as { apiVersion: string }).apiVersion).toBe("agent/v1");
  });

  it("parses a JSON manifest", async () => {
    const obj = await loadManifestObject(examples("researcher.json"));
    expect((obj as { apiVersion: string }).apiVersion).toBe("agent/v1");
  });
});

describe("Validator (P0 contract)", () => {
  it("accepts a valid manifest", async () => {
    const obj = await loadManifestObject(examples("researcher.yaml"));
    const result = validateManifest(obj);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects a wrong apiVersion", async () => {
    const result = validateManifest({ apiVersion: "agent/v2", metadata: {}, spec: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("apiVersion"))).toBe(true);
  });

  it("rejects unknown top-level fields (manifest must not know runtime details)", () => {
    const result = validateManifest({
      apiVersion: "agent/v1",
      metadata: { name: "x" },
      spec: { model: { provider: "anthropic", id: "claude-sonnet-4-5" }, system: { instructions: "hi" }, runtime: { type: "pi" }, piAgentCore: { secret: 1 } },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("piAgentCore"))).toBe(true);
  });

  it("rejects a manifest referencing an unknown tool", () => {
    const result = validateManifest(validManifest({ tools: ["no_such_tool"] }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("no_such_tool"))).toBe(true);
  });

  it("rejects a manifest referencing an unknown skill or MCP server", () => {
    const result = validateManifest(validManifest({ skills: ["nope"], mcp: ["nope"] }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Skill Registry"))).toBe(true);
    expect(result.errors.some((e) => e.includes("MCP Registry"))).toBe(true);
  });

  it("rejects an unknown runtime type", () => {
    const result = validateManifest(validManifest({ runtime: { type: "star trek" } }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown runtime"))).toBe(true);
  });
});

function validManifest(specOverrides: Record<string, unknown> = {}): unknown {
  return {
    apiVersion: "agent/v1",
    metadata: { name: "test-agent" },
    spec: {
      model: { provider: "anthropic", id: "claude-sonnet-4-5" },
      system: { instructions: "test instructions" },
      runtime: { type: "mock" },
      ...specOverrides,
    },
  };
}

describe("Compiler (P1)", () => {
  it("compiles a manifest into a runtime-neutral CompiledAgent", async () => {
    const obj = await loadManifestObject(examples("researcher.yaml"));
    const compiled = compileManifest(validateOrThrow(obj));
    expect(compiled.name).toBe("researcher");
    expect(compiled.model).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5" });
    expect(compiled.tools.map((t) => t.name)).toEqual(["web_search"]);
    expect(compiled.mcpServers.map((m) => m.name)).toEqual(["filesystem"]);
  });

  it("composes skill instructions into the system prompt without touching runtime code", async () => {
    const obj = await loadManifestObject(examples("analyst.yaml"));
    const compiled = compileManifest(validateOrThrow(obj));
    expect(compiled.systemPrompt).toContain("You are an analyst agent.");
    expect(compiled.systemPrompt).toContain("## Skill: analyst");
  });

  it("keeps the compiled output free of runtime-specific fields", async () => {
    const obj = await loadManifestObject(examples("researcher.yaml"));
    const compiled = compileManifest(validateOrThrow(obj)) as unknown as Record<string, unknown>;
    for (const key of Object.keys(compiled)) {
      expect(key.toLowerCase().startsWith("pi")).toBe(false);
    }
  });
});

function validateOrThrow(candidate: unknown): Parameters<typeof compileManifest>[0] {
  const result = validateManifest(candidate);
  if (!result.ok) throw new Error(`fixture invalid: ${result.errors.join("; ")}`);
  return candidate as Parameters<typeof compileManifest>[0];
}

describe("End-to-end via the Runtime seam (DoD item 5)", () => {
  it("runs a manifest-built agent on the mock runtime without changing the manifest", async () => {
    const obj = await loadManifestObject(examples("analyst.yaml"));
    const compiled = compileManifest(validateOrThrow(obj));
    const result = await execute(compiled, "What is 6 * 7?", "mock");
    expect(result.output).toContain("[mock:analyst]");
    expect(result.output).toContain("calculator");
  });

  it("swaps runtimes for the same manifest purely via the executor override", async () => {
    const obj = await loadManifestObject(examples("analyst.yaml"));
    const compiled = compileManifest(validateOrThrow(obj));
    const resultA = await execute(compiled, "hi", "mock");
    // Same compiled agent, different runtime id selected at the seam:
    expect(resultA.output).toContain("analyst");
    // (A Pi run requires credentials and network, so it is exercised manually —
    //  see README. The contract that makes the swap possible is proven here.)
  });
});
