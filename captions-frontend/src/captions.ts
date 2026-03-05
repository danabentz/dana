export function splitIntoCaptionLines(text: string, maxLines = 2, maxCharsPerLine = 42): string[] {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return [];
  }

  const words = cleaned.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine || !current) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(-maxLines);
}
