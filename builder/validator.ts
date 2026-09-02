import { z } from "zod";
import { hasTool, listToolNames } from "../tools/registry.js";
import { hasSkill } from "../skills/registry.js";
import { hasMcpServer } from "../mcp/registry.js";

/**
 * Validator: checks the manifest against the agent/v1 contract and
 * against the registries (does the tool/skill/MCP actually exist?).
 * Returns accumulated errors/warnings rather than throwing on the
 * first problem, so `agent-builder validate` can report everything.
 */

const KNOWN_RUNTIMES = ["pi", "mock"];

const manifestSchema = z.strictObject({
  apiVersion: z.literal("agent/v1"),
  metadata: z.strictObject({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, "must be lowercase kebab-case"),
    description: z.string().optional(),
  }),
  spec: z.strictObject({
    model: z.strictObject({
      provider: z.string().min(1),
      id: z.string().min(1),
    }),
    system: z.strictObject({
      instructions: z.string().min(1),
    }),
    tools: z.array(z.string().min(1)).optional(),
    skills: z.array(z.string().min(1)).optional(),
    mcp: z.array(z.string().min(1)).optional(),
    runtime: z.strictObject({
      type: z.string().min(1),
    }),
  }),
});

export type AgentManifest = z.infer<typeof manifestSchema>;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateManifest(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = manifestSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const where = issue.path.length ? issue.path.join(".") : "(root)";
      errors.push(`schema: ${where}: ${issue.message}`);
    }
    return { ok: false, errors, warnings };
  }

  const manifest = parsed.data;

  if (!KNOWN_RUNTIMES.includes(manifest.spec.runtime.type)) {
    errors.push(
      `runtime: unknown runtime '${manifest.spec.runtime.type}' (known: ${KNOWN_RUNTIMES.join(", ")})`,
    );
  }

  for (const name of manifest.spec.tools ?? []) {
    if (!hasTool(name)) {
      errors.push(`tools: '${name}' not found in Tool Registry (known: ${listToolNames().join(", ")})`);
    }
  }
  for (const name of manifest.spec.skills ?? []) {
    if (!hasSkill(name)) errors.push(`skills: '${name}' not found in Skill Registry`);
  }
  for (const name of manifest.spec.mcp ?? []) {
    if (!hasMcpServer(name)) errors.push(`mcp: '${name}' not found in MCP Registry`);
  }

  if (!manifest.spec.tools?.length && !manifest.spec.mcp?.length) {
    warnings.push("capabilities: manifest declares no tools and no MCP servers — the model can only answer from its own knowledge.");
  }

  return { ok: errors.length === 0, errors, warnings };
}
