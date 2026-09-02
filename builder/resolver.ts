import type { McpServerRef, ResolvedSkill, ResolvedTool } from "./types.js";
import { getTool } from "../tools/registry.js";
import { getSkill } from "../skills/registry.js";
import { getMcpServerRef } from "../mcp/registry.js";

/**
 * Resolver: maps manifest references to concrete implementations by
 * asking each registry. Names in the manifest are intent; this is
 * where they become capabilities.
 */

export interface Resolution {
  tools: ResolvedTool[];
  skills: ResolvedSkill[];
  mcpServers: McpServerRef[];
}

export function resolveCapabilities(names: {
  tools?: string[];
  skills?: string[];
  mcp?: string[];
}): Resolution {
  return {
    tools: (names.tools ?? []).map(getTool),
    skills: (names.skills ?? []).map(getSkill),
    mcpServers: (names.mcp ?? []).map(getMcpServerRef),
  };
}
