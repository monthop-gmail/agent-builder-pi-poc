import path from "node:path";
import os from "node:os";
import type {
  AgentHandle,
  AgentResult,
  AgentRuntime,
  CompiledAgent,
  McpServerRef,
  ResolvedTool,
} from "../builder/types.js";

/**
 * PiRuntime: the only file in this PoC that knows about Pi.
 * Maps CompiledAgent -> Pi AgentSession:
 *   system prompt -> DefaultResourceLoader systemPromptOverride
 *   tools         -> defineTool custom tools (+ tools allowlist, no Pi built-ins)
 *   mcp servers   -> MCP client per server, each server tool wrapped as a Pi tool
 *   model         -> pi-ai catalog lookup (falls back to Pi's default model)
 */

interface McpConnection {
  ref: McpServerRef;
  client: McpClientLike;
  tools: McpToolLike[];
  close(): Promise<void>;
}

interface McpClientLike {
  callTool(args: { name: string; arguments: Record<string, unknown> }): Promise<McpCallResult>;
}

interface McpToolLike {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface McpCallResult {
  content?: { type: string; text?: string }[];
}

interface PiSessionLike {
  subscribe(handler: (event: unknown) => void): void;
  prompt(input: string): Promise<void>;
  readonly messages: Array<{ role?: string; errorMessage?: string }>;
  dispose(): Promise<void>;
}

interface PiCreateAgentSessionOptions {
  cwd?: string;
  model?: unknown;
  modelRuntime?: unknown;
  sessionManager?: unknown;
  resourceLoader?: unknown;
  tools?: string[];
  customTools?: unknown[];
}

interface PiSdk {
  createAgentSession(options: PiCreateAgentSessionOptions): Promise<{ session: PiSessionLike }>;
  defineTool(tool: Record<string, unknown>): Record<string, unknown>;
  DefaultResourceLoader: new (options: {
    cwd?: string;
    agentDir?: string;
    systemPromptOverride: () => string;
  }) => {
    reload(): Promise<void>;
  };
  SessionManager: { inMemory(): unknown };
  ModelRuntime: { create(): Promise<unknown> };
}

export class PiRuntime implements AgentRuntime {
  readonly id = "pi";

  async createAgent(config: CompiledAgent): Promise<AgentHandle> {
    const sdk = await loadPiSdk();
    const connections = await connectMcpServers(config.mcpServers);

    const manifestTools: Record<string, unknown>[] = config.tools.map((tool) =>
      sdk.defineTool({
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        execute: async (_toolCallId: string, params: Record<string, unknown>) => {
          const result = await tool.execute(params ?? {});
          return { content: [{ type: "text", text: result.text }], details: {} };
        },
      }),
    );

    const mcpTools: Record<string, unknown>[] = [];
    for (const conn of connections) {
      for (const mcpTool of conn.tools) {
        const wrappedTool: ResolvedTool = {
          name: sanitizeToolName(`${conn.ref.name}_${mcpTool.name}`),
          description: mcpTool.description ?? `Tool '${mcpTool.name}' from MCP server '${conn.ref.name}'`,
          parameters: mcpTool.inputSchema,
          execute: async (args) => {
            const result = await conn.client.callTool({ name: mcpTool.name, arguments: args });
            const text = (result.content ?? [])
              .filter((part) => part.type === "text")
              .map((part) => part.text ?? "")
              .join("\n");
            return { text: text || "(empty MCP tool result)" };
          },
        };
        mcpTools.push(
          sdk.defineTool({
            name: wrappedTool.name,
            label: wrappedTool.name,
            description: wrappedTool.description,
            parameters: wrappedTool.parameters,
            execute: async (_toolCallId: string, params: Record<string, unknown>) => {
              const result = await wrappedTool.execute(params ?? {});
              return { content: [{ type: "text", text: result.text }], details: {} };
            },
          }),
        );
      }
    }

    const customTools = [...manifestTools, ...mcpTools];
    const toolNames = customTools.map((t) => t.name as string);

    // Pi's DefaultResourceLoader resolves cwd/agentDir eagerly and crashes
    // on Windows when either is undefined — always pass both explicitly.
    const loader = new sdk.DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: path.join(os.homedir(), ".pi", "agent"),
      systemPromptOverride: () => config.systemPrompt,
    });
    await loader.reload();

    const modelRuntime = await sdk.ModelRuntime.create();
    const model = await resolveModel(config.model).catch(() => undefined);

    const { session } = await sdk.createAgentSession({
      cwd: process.cwd(),
      model,
      modelRuntime,
      sessionManager: sdk.SessionManager.inMemory(),
      resourceLoader: loader,
      tools: toolNames, // manifest-defined tools only; no Pi built-ins leak in
      customTools,
    });

    const handle: PiAgentHandle = {
      runtimeId: this.id,
      config,
      session,
      connections,
      dispose: async () => {
        await Promise.allSettled(connections.map((c) => c.close()));
        try {
          await session.dispose();
        } catch {
          // best-effort cleanup
        }
      },
    };
    return handle;
  }

  async run(agent: AgentHandle, input: string): Promise<AgentResult> {
    const handle = agent as PiAgentHandle;
    let output = "";
    handle.session.subscribe((event: unknown) => {
      const e = event as { type?: string; assistantMessageEvent?: { type?: string; delta?: string } };
      if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_delta") {
        output += e.assistantMessageEvent.delta ?? "";
      }
    });
    await handle.session.prompt(input);
    const last = handle.session.messages[handle.session.messages.length - 1];
    if (last?.errorMessage) {
      throw new Error(`model error: ${last.errorMessage}`);
    }
    return { output: output.trim(), sessionId: handle.sessionId };
  }

  async resume(sessionId: string): Promise<AgentHandle> {
    throw new Error(`PiRuntime.resume('${sessionId}') is not part of the PoC scope (planned P4+)`);
  }
}

interface PiAgentHandle extends AgentHandle {
  session: PiSessionLike;
  connections: McpConnection[];
  config: CompiledAgent;
}

async function loadPiSdk(): Promise<PiSdk> {
  const mod = (await import("@earendil-works/pi-coding-agent")) as unknown as PiSdk;
  return mod;
}

async function resolveModel(model: { provider: string; id: string }): Promise<unknown> {
  const { getModel } = (await import("@earendil-works/pi-ai/compat")) as {
    getModel(provider: string, id: string): unknown;
  };
  const resolved = getModel(model.provider, model.id);
  if (!resolved) throw new Error(`Model not found in pi-ai catalog: ${model.provider}/${model.id}`);
  return resolved;
}

async function connectMcpServers(refs: McpServerRef[]): Promise<McpConnection[]> {
  const results: McpConnection[] = [];
  for (const ref of refs) {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    let transport: unknown;
    if (ref.transport === "http") {
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      transport = new StreamableHTTPClientTransport(new URL(ref.url as string), {
        requestInit: { headers: ref.headers ?? {} },
      });
    } else {
      const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
      transport = new StdioClientTransport({ command: ref.command as string, args: ref.args ?? [] });
    }
    const client = new Client({ name: "agent-builder-pi-poc", version: "0.1.0" });
    await client.connect(transport as never);
    const list = (await client.listTools()) as { tools: McpToolLike[] };
    results.push({
      ref,
      client: client as unknown as McpClientLike,
      tools: list.tools ?? [],
      close: async () => {
        await client.close().catch(() => {});
      },
    });
  }
  return results;
}

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
