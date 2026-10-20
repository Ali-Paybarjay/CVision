import { readFile } from "node:fs/promises";
import { join } from "node:path";

const promptsDir = join(process.cwd(), "prompts");
const cache = new Map<string, string>();

/**
 * Reads prompts/<name>.md, e.g. loadPrompt("profile-extract").
 * Use {{key}} placeholders in the file and pass their values in `values`.
 */
export async function loadPrompt(name: string, values: Record<string, string> = {}): Promise<string> {
  if (!/^[a-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid prompt name: ${name}`);
  }

  let text = cache.get(name);
  if (text === undefined) {
    text = await readFile(join(promptsDir, `${name}.md`), "utf8");
    cache.set(name, text);
  }

  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) {
      throw new Error(`Prompt ${name} needs a value for {{${key}}}`);
    }
    return values[key];
  });
}

/** The brand voice rules (prompts/_voice.md), added to every request that writes text for the user. */
export function loadVoice(): Promise<string> {
  return loadPrompt("_voice");
}
