import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

/**
 * Loader: raw file -> plain object.
 * Accepts .yaml / .yml / .json. No interpretation happens here —
 * validation is the Validator's job.
 */
export async function loadManifestObject(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(`Cannot read manifest file '${path}': ${(err as Error).message}`);
  }

  if (path.endsWith(".json")) {
    return JSON.parse(raw);
  }
  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    return parseYaml(raw);
  }
  // Unknown extension: try YAML (a superset of JSON).
  return parseYaml(raw);
}
