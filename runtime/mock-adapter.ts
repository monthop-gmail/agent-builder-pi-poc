import type { AgentHandle, AgentResult, AgentRuntime, CompiledAgent } from "../builder/types.js";

/**
 * MockRuntime: proves the Builder pipeline end-to-end without any
 * model credentials or network. Used by tests and `agent-builder run
 * --runtime mock`. It is a real AgentRuntime implementation, which is
 * what lets us verify DoD item 5 (swap runtimes without touching the
 * manifest).
 */

interface MockHandle extends AgentHandle {
  config: CompiledAgent;
}

export class MockRuntime implements AgentRuntime {
  readonly id = "mock";

  async createAgent(config: CompiledAgent): Promise<AgentHandle> {
    const handle: MockHandle = {
      runtimeId: this.id,
      sessionId: `mock-${config.name}-${Date.now()}`,
      config,
      dispose: async () => {},
    };
    return handle;
  }

  async run(agent: AgentHandle, input: string): Promise<AgentResult> {
    const handle = agent as MockHandle;
    const config = handle.config;
    const lines = [
      `[mock:${config.name}] received: ${input}`,
      `model: ${config.model.provider}/${config.model.id}`,
      `system prompt: ${config.systemPrompt.split("\n").length} lines (skills: ${config.skills.map((s) => s.name).join(", ") || "none"})`,
      `tools injected: ${config.tools.map((t) => t.name).join(", ") || "none"}`,
      `mcp servers injected: ${config.mcpServers.map((m) => m.name).join(", ") || "none"}`,
    ];
    return { output: lines.join("\n"), sessionId: handle.sessionId };
  }

  async resume(sessionId: string): Promise<AgentHandle> {
    throw new Error(`MockRuntime.resume('${sessionId}') is not part of the PoC scope`);
  }
}
