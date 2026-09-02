import type { ResolvedTool } from "../builder/types.js";

/**
 * Tool Registry: maps a manifest tool name to an executable capability.
 * PoC ships a few built-ins; production would merge registries from
 * ecosystem sources (L5) instead of hardcoding.
 */

function safeCalculator(expr: string): string {
  // Reject anything outside a pure arithmetic expression before eval-ing.
  if (!/^[0-9+\-*/%().\s]+$/.test(expr.replace(/\*\*/g, ""))) {
    throw new Error(`calculator: expression contains disallowed characters: '${expr}'`);
  }
  const value = Function(`"use strict"; return (${expr});`)() as unknown;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`calculator: expression did not evaluate to a finite number: '${expr}'`);
  }
  return String(value);
}

const calculator: ResolvedTool = {
  name: "calculator",
  description: "Evaluate a pure arithmetic expression (digits, + - * / % parentheses, **).",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Arithmetic expression, e.g. (2 + 3) * 7" },
    },
    required: ["expression"],
    additionalProperties: false,
  },
  async execute(args) {
    const expr = String(args.expression ?? "");
    return { text: `${expr} = ${safeCalculator(expr)}` };
  },
};

const currentTime: ResolvedTool = {
  name: "current_time",
  description: "Return the current UTC time in ISO 8601 format.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async execute() {
    return { text: new Date().toISOString() };
  },
};

const webSearch: ResolvedTool = {
  name: "web_search",
  description: "Search the web (DuckDuckGo Instant Answer API) and return a short summary.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args) {
    const query = String(args.query ?? "");
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`web_search: HTTP ${res.status}`);
    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: { Text?: string; FirstURL?: string }[];
    };
    const lines: string[] = [];
    if (data.AbstractText) lines.push(`${data.AbstractText} (${data.AbstractURL ?? ""})`);
    for (const t of (data.RelatedTopics ?? []).slice(0, 5)) {
      if (t.Text) lines.push(`- ${t.Text}`);
    }
    return { text: lines.length ? lines.join("\n") : `No results for '${query}'.` };
  },
};

const TOOLS: Record<string, ResolvedTool> = {
  calculator,
  current_time: currentTime,
  web_search: webSearch,
};

export function listToolNames(): string[] {
  return Object.keys(TOOLS).sort();
}

export function hasTool(name: string): boolean {
  return Object.hasOwn(TOOLS, name);
}

export function getTool(name: string): ResolvedTool {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Tool not found in registry: '${name}'`);
  return tool;
}
