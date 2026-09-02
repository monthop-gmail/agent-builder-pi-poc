import type { AgentResult, AgentRuntime, CompiledAgent } from "../builder/types.js";

/**
 * Executor: picks the runtime by id and runs the compiled agent.
 * This is the seam that makes "swap runtimes without touching the
 * manifest" a real property: nothing above this line imports a runtime.
 */

const runtimeLoaders: Record<string, () => Promise<AgentRuntime>> = {
  mock: async () => {
    const { MockRuntime } = await import("./mock-adapter.js");
    return new MockRuntime();
  },
  pi: async () => {
    const { PiRuntime } = await import("./pi-adapter.js");
    return new PiRuntime();
  },
};

export function listRuntimeIds(): string[] {
  return Object.keys(runtimeLoaders).sort();
}

export async function getRuntime(type: string): Promise<AgentRuntime> {
  const load = runtimeLoaders[type];
  if (!load) {
    throw new Error(`No runtime registered for '${type}' (known: ${listRuntimeIds().join(", ")})`);
  }
  return load();
}

export async function execute(
  compiled: CompiledAgent,
  input: string,
  runtimeOverride?: string,
): Promise<AgentResult> {
  const runtime = await getRuntime(runtimeOverride ?? compiled.runtime.type);
  const agent = await runtime.createAgent(compiled);
  try {
    return await runtime.run(agent, input);
  } finally {
    await agent.dispose().catch(() => {});
  }
}
