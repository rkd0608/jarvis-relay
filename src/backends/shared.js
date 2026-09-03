export function buildPrompt(prompt, images) {
  const note = images.length
    ? `\n\nTeammates attached screenshots: ${images.join(", ")}. Read those files to view them.`
    : "";
  return `A teammate sent this request from WhatsApp. Do the work in this repo.\n\n"""${prompt}"""${note}`;
}

export function splitMessage(text, size = 3500) {
  const out = [];
  let rest = String(text ?? "").trim() || "(no output)";
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.5) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}
