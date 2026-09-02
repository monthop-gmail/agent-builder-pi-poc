import path from "node:path";
import { createRequire } from "node:module";
import type { McpServerRef } from "../builder/types.js";

/**
 * MCP Registry: maps a manifest MCP name to an external capability
 * provider (server connection descriptor). The Pi adapter connects
 * to these servers at agent-creation time and exposes each server
 * tool as a regular tool to the model.
 *
 * Secrets (tokens) come from the environment, never from the manifest.
 */

const require = createRequire(import.meta.url);

interface McpServerDescriptor {
  name: string;
  buildRef(): McpServerRef;
}

const fsRoot = process.env.AGENT_BUILDER_FS_ROOT ?? process.cwd();

function filesystemCommand(): { command: string; args: string[] } {
  try {
    const pkgPath: string = require.resolve("@modelcontextprotocol/server-filesystem/package.json");
    const pkg = require(pkgPath) as { bin?: string | Record<string, string>; main?: string };
    const scriptDir = path.dirname(pkgPath);
    let entry: string;
    if (typeof pkg.bin === "string") {
      entry = path.join(scriptDir, pkg.bin);
    } else if (pkg.bin && typeof pkg.bin === "object") {
      const first = Object.values(pkg.bin)[0];
      if (!first) throw new Error("server-filesystem package.json has an empty bin map");
      entry = path.join(scriptDir, first);
    } else {
      entry = path.join(scriptDir, pkg.main ?? "dist/index.js");
    }
    return { command: process.execPath, args: [entry, fsRoot] };
  } catch {
    // Fallback: rely on PATH having `npx`.
    return { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", fsRoot] };
  }
}

const SERVERS: Record<string, McpServerDescriptor> = {
  filesystem: {
    name: "filesystem",
    buildRef() {
      const { command, args } = filesystemCommand();
      return { name: "filesystem", transport: "stdio", command, args };
    },
  },
  collab: {
    name: "collab",
    buildRef() {
      const url = process.env.AI_COLLAB_MCP_URL
        ?? "https://ai-collaboration-mcp.monthop-gmail.workers.dev/mcp";
      const token = process.env.AI_COLLAB_MCP_TOKEN;
      if (!token) {
        throw new Error("MCP 'collab' requires AI_COLLAB_MCP_TOKEN in the environment (.env)");
      }
      return {
        name: "collab",
        transport: "http",
        url,
        headers: { Authorization: `Bearer ${token}` },
      };
    },
  },
};

export function listMcpServerNames(): string[] {
  return Object.keys(SERVERS).sort();
}

export function hasMcpServer(name: string): boolean {
  return Object.hasOwn(SERVERS, name);
}

export function getMcpServerRef(name: string): McpServerRef {
  const server = SERVERS[name];
  if (!server) throw new Error(`MCP server not found in registry: '${name}'`);
  return server.buildRef();
}
