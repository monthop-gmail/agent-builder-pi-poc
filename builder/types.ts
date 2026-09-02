/**
 * Core, runtime-neutral types for the Agent Builder.
 *
 * Nothing in this file may import from a runtime (Pi or otherwise).
 * Runtime-specific code lives under `runtime/` and is reached only
 * through the `AgentRuntime` interface (runtime/types.ts).
 */

/** Tool implementation resolved from a Tool Registry. Parameters are JSON Schema (typebox). */
export interface ResolvedTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<{ text: string }>;
}

/** A reusable behavior/instruction pack resolved from a Skill Registry. */
export interface ResolvedSkill {
  name: string;
  description: string;
  instructions: string;
}

/** An MCP server resolved from an MCP Registry (connection descriptor, not yet connected). */
export interface McpServerRef {
  name: string;
  transport: "stdio" | "http";
  /** stdio transport */
  command?: string;
  args?: string[];
  /** http (Streamable HTTP) transport */
  url?: string;
  headers?: Record<string, string>;
}

/** Runtime-neutral agent definition produced by the Compiler. */
export interface CompiledAgent {
  name: string;
  description: string;
  runtime: { type: string };
  model: { provider: string; id: string };
  systemPrompt: string;
  tools: ResolvedTool[];
  skills: ResolvedSkill[];
  mcpServers: McpServerRef[];
}

export interface AgentResult {
  output: string;
  sessionId?: string;
  meta?: Record<string, unknown>;
}

/**
 * The seam between Builder and any execution engine.
 * The Manifest never mentions a runtime by anything other than `spec.runtime.type`.
 */
export interface AgentRuntime {
  readonly id: string;
  createAgent(config: CompiledAgent): Promise<AgentHandle>;
  run(agent: AgentHandle, input: string): Promise<AgentResult>;
  resume(sessionId: string): Promise<AgentHandle>;
}

/** Opaque handle to a created agent. Each runtime defines its own shape. */
export interface AgentHandle {
  readonly runtimeId: string;
  readonly sessionId?: string;
  dispose(): Promise<void>;
}
