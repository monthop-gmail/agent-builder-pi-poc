import { loadManifestObject } from "../builder/loader.js";
import { validateManifest } from "../builder/validator.js";
import { compileManifest } from "../builder/compiler.js";
import { execute, listRuntimeIds } from "../runtime/executor.js";
import { writeFile } from "node:fs/promises";

/**
 * CLI:
 *   agent-builder validate <manifest>
 *   agent-builder build   <manifest> [--out file]
 *   agent-builder inspect <manifest>
 *   agent-builder run     <manifest> [--input "..."] [--runtime mock|pi]
 */

const usage = `agent-builder — build agents from Agent Manifests (PoC)

Usage:
  agent-builder validate <manifest>            Check the manifest against the contract
  agent-builder build   <manifest> [--out f]   Compile to a runtime-neutral agent definition
  agent-builder inspect <manifest>             Show what the Builder resolves for the manifest
  agent-builder run     <manifest> [options]   Compile and execute the agent

Run options:
  --input "<text>"   Prompt to send (default: a smoke-test prompt)
  --runtime <id>     Override spec.runtime.type (known: ${listRuntimeIds().join(", ")})
`;

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function main(): Promise<number> {
  const [, , command, ...rest] = process.argv;
  const positional = rest.find((a) => !a.startsWith("--"));
  const manifestPath = positional;

  if (!command || command === "help" || hasFlag(rest, "--help")) {
    process.stdout.write(usage);
    return 0;
  }

  if (!manifestPath) {
    process.stderr.write(`error: missing <manifest> path\n\n${usage}`);
    return 2;
  }

  if (command === "validate") {
    const candidate = await loadManifestObject(manifestPath);
    const result = validateManifest(candidate);
    printResult(result);
    return result.ok ? 0 : 1;
  }

  if (command === "build" || command === "inspect" || command === "run") {
    const candidate = await loadManifestObject(manifestPath);
    const result = validateManifest(candidate);
    printResult(result);
    if (!result.ok) return 1;

    const compiled = compileManifest(candidate as Parameters<typeof compileManifest>[0]);

    if (command === "build") {
      const json = JSON.stringify(
        {
          name: compiled.name,
          description: compiled.description,
          runtime: compiled.runtime,
          model: compiled.model,
          systemPrompt: compiled.systemPrompt,
          tools: compiled.tools.map((t) => ({ name: t.name, description: t.description })),
          skills: compiled.skills.map((s) => s.name),
          mcpServers: compiled.mcpServers.map((m) => ({ name: m.name, transport: m.transport })),
        },
        null,
        2,
      );
      const outPath = argValue(rest, "--out");
      if (outPath) {
        await writeFile(outPath, json, "utf8");
        process.stdout.write(`\nwrote compiled agent to ${outPath}\n`);
      } else {
        process.stdout.write(`\n${json}\n`);
      }
      return 0;
    }

    if (command === "inspect") {
      printInspect(compiled);
      return 0;
    }

    // run
    const runtimeOverride = argValue(rest, "--runtime");
    const input = argValue(rest, "--input") ?? "Say hello and list one thing you can do with your tools.";
    try {
      const result = await execute(compiled, input, runtimeOverride);
      process.stdout.write(`\n--- output ---\n${result.output}\n`);
      if (result.sessionId) process.stdout.write(`\n(session: ${result.sessionId})\n`);
      return 0;
    } catch (err) {
      process.stderr.write(`\nrun failed: ${(err as Error).message}\n`);
      return 1;
    }
  }

  process.stderr.write(`error: unknown command '${command}'\n\n${usage}`);
  return 2;
}

function printResult(result: { ok: boolean; errors: string[]; warnings: string[] }): void {
  for (const err of result.errors) process.stdout.write(`  ✗ ${err}\n`);
  for (const warn of result.warnings) process.stdout.write(`  ⚠ ${warn}\n`);
  process.stdout.write(result.ok ? "  ✓ manifest is valid\n" : "  ✗ manifest is INVALID\n");
}

function printInspect(compiled: ReturnType<typeof compileManifest>): void {
  const lines = [
    ``,
    `Agent: ${compiled.name}`,
    ``,
    `Runtime: ${compiled.runtime.type}`,
    ``,
    `Model:`,
    `  ${compiled.model.provider} / ${compiled.model.id}`,
    ``,
    `Tools:`,
    ...compiled.tools.map((t) => `  ✓ ${t.name} — ${t.description}`),
    ...(compiled.tools.length === 0 ? ["  (none)"] : []),
    ``,
    `Skills:`,
    ...compiled.skills.map((s) => `  ✓ ${s.name} — ${s.description}`),
    ...(compiled.skills.length === 0 ? ["  (none)"] : []),
    ``,
    `MCP:`,
    ...compiled.mcpServers.map((m) =>
      m.transport === "http"
        ? `  ✓ ${m.name} (http: ${m.url}${m.headers?.Authorization ? ", auth: set" : ""})`
        : `  ✓ ${m.name} (stdio: ${m.command} ${m.args?.join(" ") ?? ""})`,
    ),
    ...(compiled.mcpServers.length === 0 ? ["  (none)"] : []),
    ``,
    `Status:`,
    `  READY`,
    ``,
  ];
  process.stdout.write(lines.join("\n"));
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${(err as Error).stack ?? err}\n`);
    process.exit(1);
  },
);
