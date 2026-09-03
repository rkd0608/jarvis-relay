export function isUserAllowed(agent, sender, config) {
  if (!sender) return false;
  if (sender === config.botNumber) return true;
  if (sender === config.slack?.botUserId) return true;
  const allowed = agent.allowedUsers ?? ["*"];
  if (allowed.includes("*")) return true;
  return allowed.some(
    (a) => a === sender || `wa:${a}` === sender || `slk:${a}` === sender
  );
}

export function isTriggered(msg, config, ownLid) {
  const body = msg.body ?? "";
  const mentions = msg.mentionedIds ?? [];
  if (config.botNumber && mentions.includes(config.botNumber)) return true;
  if (config.slack?.botUserId && mentions.includes(config.slack.botUserId)) {
    return true;
  }
  if (ownLid && mentions.includes(ownLid)) return true; // WhatsApp lid-format mention
  if (/^\s*!\s*jarvis\b/i.test(body)) return true;
  if (/^\s*@jarvis\b/i.test(body)) return true; // typed text, not a real mention
  if (msg.fromMe && config.selfTrigger && /^\s*jarvis[,:]/i.test(body)) {
    return true;
  }
  return false;
}

export function stripTrigger(msg, config) {
  let text = msg.body ?? "";
  if (config.botNumber) {
    const number = config.botNumber.split("@")[0];
    text = text.replaceAll(`@${number}`, "");
  }
  if (config.slack?.botUserId) {
    text = text.replaceAll(`<@${config.slack.botUserId}>`, "");
  }
  text = text.replace(/^\s*!\s*jarvis\b/i, "");
  text = text.replace(/^\s*@\s*jarvis\b/i, "");
  text = text.replace(/^\s*jarvis[,:]/i, "");
  return text.trim();
}
