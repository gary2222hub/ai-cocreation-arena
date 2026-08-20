export type PromptBlock =
  | { type: "paragraph" | "label"; text: string }
  | { type: "ordered" | "unordered"; items: string[] };

export function parsePrompt(prompt: string): PromptBlock[] {
  const blocks: PromptBlock[] = [];
  const lines = prompt.split(/\r?\n/).map((line) => line.trim());

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line) {
      index += 1;
      continue;
    }
    if (/^\d+[.、]\s*/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.、]\s*/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+[.、]\s*/, ""));
        index += 1;
      }
      blocks.push({ type: "ordered", items });
      continue;
    }
    if (/^[-•]\s*/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-•]\s*/.test(lines[index])) {
        items.push(lines[index].replace(/^[-•]\s*/, ""));
        index += 1;
      }
      blocks.push({ type: "unordered", items });
      continue;
    }
    const isLabel = /[：:]$/.test(line);
    blocks.push({ type: isLabel ? "label" : "paragraph", text: line });
    if (isLabel && /请完成|要求|内容|包括/.test(line)) {
      const items: string[] = [];
      const rawItems: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && !/[：:]$/.test(lines[cursor])) {
        if (lines[cursor]) {
          rawItems.push(lines[cursor]);
          items.push(lines[cursor].replace(/^\d+[.、]\s*|^[-•]\s*/, ""));
        }
        cursor += 1;
      }
      if (items.length >= 2) {
        blocks.push({
          type: rawItems.every((item) => /^\d+[.、]\s*/.test(item)) ? "ordered" : "unordered",
          items,
        });
        index = cursor;
        continue;
      }
    }
    index += 1;
  }
  return blocks;
}
