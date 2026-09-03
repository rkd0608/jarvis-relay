export function isUserAllowed(agent, sender, botNumber) {
  if (sender === botNumber) return true;
  const allowed = agent.allowedUsers ?? ["*"];
  if (allowed.includes("*")) return true;
  return allowed.includes(sender);
}

export function isTriggered(msg, config, ownLid) {
  const body = msg.body ?? "";
  const mentions = msg.mentionedIds ?? [];
  if (mentions.includes(config.botNumber)) return true;
  if (ownLid && mentions.includes(ownLid)) return true; // WhatsApp lid-format mention
  if (/^\s*!\s*jarvis\b/i.test(body)) return true;
  if (/^\s*@jarvis\b/i.test(body)) return true; // typed text, not a real mention
  if (msg.fromMe && config.selfTrigger && /^\s*jarvis[,:]/i.test(body)) {
    return true;
  }
  return false;
}

export function stripTrigger(msg, botNumber) {
  let text = msg.body ?? "";
  const number = botNumber.split("@")[0];
  text = text.replaceAll(`@${number}`, "");
  text = text.replace(/^\s*!\s*jarvis\b/i, "");
  text = text.replace(/^\s*@\s*jarvis\b/i, "");
  text = text.replace(/^\s*jarvis[,:]/i, "");
  return text.trim();
}
