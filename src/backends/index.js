import { runClaude } from "./claude.js";
import { runCodex } from "./codex.js";

const backends = {
  "claude-code": runClaude,
  codex: runCodex,
};

export async function runAgent(agent, prompt, images, onProgress) {
  const run = backends[agent.backend];
  if (!run) {
    throw new Error(
      `Unknown backend "${agent.backend}". Known: ${Object.keys(backends).join(", ")}`
    );
  }
  return run(agent, prompt, images, onProgress);
}
