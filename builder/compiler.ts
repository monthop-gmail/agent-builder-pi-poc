import type { AgentManifest } from "./validator.js";
import type { CompiledAgent } from "./types.js";
import { resolveCapabilities } from "./resolver.js";

/**
 * Compiler: AgentManifest -> CompiledAgent (runtime-neutral).
 * The output contains no Pi types, no vendor types — a future
 * DeepSeek/Claude/Gemini adapter consumes the same shape.
 */
export function compileManifest(manifest: AgentManifest): CompiledAgent {
  const { tools, skills, mcpServers } = resolveCapabilities({
    tools: manifest.spec.tools,
    skills: manifest.spec.skills,
    mcp: manifest.spec.mcp,
  });

  const skillBlocks = skills.map((s) => s.instructions).join("\n\n");
  const systemPrompt = skillBlocks
    ? `${manifest.spec.system.instructions}\n\n${skillBlocks}`
    : manifest.spec.system.instructions;

  return {
    name: manifest.metadata.name,
    description: manifest.metadata.description ?? "",
    runtime: { type: manifest.spec.runtime.type },
    model: { provider: manifest.spec.model.provider, id: manifest.spec.model.id },
    systemPrompt,
    tools,
    skills,
    mcpServers,
  };
}
