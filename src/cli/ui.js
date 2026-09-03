import pc from "picocolors";

export const BANNER = pc.cyan(`
     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗
     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝
     ██║███████║██████╔╝██║   ██║██║███████╗
██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║
╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║
 ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝
`);

export const TAGLINE = pc.dim("  WhatsApp ⇄ Claude Code / Codex relay");

export function header() {
  return `\n${BANNER}${TAGLINE}\n`;
}

export function kv(key, value, ok = true) {
  const mark = ok ? pc.green("✔") : pc.red("✖");
  return `  ${mark} ${pc.bold(key)}  ${pc.dim(value)}`;
}

export function line(icon, text) {
  return `  ${icon} ${text}`;
}

export const icons = {
  ok: pc.green("✔"),
  warn: pc.yellow("◆"),
  fail: pc.red("✖"),
  info: pc.cyan("◆"),
  arrow: pc.dim("→"),
};

export { pc };
