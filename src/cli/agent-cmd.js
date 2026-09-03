import fs from "node:fs";
import * as p from "@clack/prompts";
import { header, pc } from "./ui.js";
import { askProfile } from "./setup.js";

function loadRaw() {
  try {
    return JSON.parse(fs.readFileSync("jarvis.config.json", "utf8"));
  } catch {
    return null;
  }
}

function saveRaw(config) {
  fs.writeFileSync("jarvis.config.json", JSON.stringify(config, null, 2) + "\n");
}

export async function runAgentCmd(sub, extra) {
  p.intro(header());
  const config = loadRaw();
  if (!config) {
    p.log.error("No jarvis.config.json found — run `jarvis setup` first.");
    p.outro("");
    process.exit(1);
  }

  sub = sub ?? "list";

  if (sub === "list") {
    const names = Object.keys(config.agents);
    if (!names.length) {
      p.log.warn("No agent profiles configured.");
    }
    for (const n of names) {
      const a = config.agents[n];
      console.log(
        `  ${pc.cyan("◆")} ${pc.bold(n)}  ${pc.dim(
          `${a.backend} · ${a.approval ?? "approve-edits"} · ${a.projectDir}` +
            (a.groups?.length ? ` · groups: ${a.groups.join(", ")}` : "")
        )}`
      );
    }
    p.outro(`${names.length} profile(s)`);
    return;
  }

  if (sub === "add") {
    const { name, profile } = await askProfile(Object.keys(config.agents));
    config.agents[name] = profile;
    saveRaw(config);
    p.outro(`Profile "${name}" added → jarvis.config.json`);
    return;
  }

  if (sub === "remove") {
    const names = Object.keys(config.agents);
    if (!names.length) {
      p.log.warn("Nothing to remove.");
      p.outro("");
      return;
    }
    const target = await p.select({
      message: "Remove which profile?",
      options: names.map((n) => ({ value: n, label: n })),
    });
    if (p.isCancel(target)) p.cancel("Cancelled.");
    const sure = await p.confirm({
      message: `Delete "${target}"? This cannot be undone.`,
      initialValue: false,
    });
    if (p.isCancel(sure) || !sure) {
      p.outro("Kept.");
      return;
    }
    delete config.agents[target];
    saveRaw(config);
    p.outro(`Profile "${target}" removed.`);
    return;
  }

  p.log.error(`Unknown agent subcommand: ${sub} (use list | add | remove)`);
  p.outro("");
  process.exit(1);
}
