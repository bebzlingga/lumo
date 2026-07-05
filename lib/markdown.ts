export type TextSelection = { start: number; end: number };

export type MarkdownResult = { text: string; selection: TextSelection };

// Wrap the current selection with an inline marker (e.g. ** for bold). When
// nothing is selected, the markers are inserted with the cursor placed between
// them so the user can type right away.
export function wrapInline(text: string, selection: TextSelection, marker: string): MarkdownResult {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const selected = text.slice(start, end);
  const nextText = `${text.slice(0, start)}${marker}${selected}${marker}${text.slice(end)}`;

  if (!selected) {
    const caret = start + marker.length;
    return { text: nextText, selection: { start: caret, end: caret } };
  }

  return { text: nextText, selection: { start: start + marker.length, end: end + marker.length } };
}

// Add a prefix (e.g. "# ", "- ", "> ") to the start of the line the cursor is on.
export function prefixLine(text: string, selection: TextSelection, prefix: string): MarkdownResult {
  const caret = Math.max(0, Math.min(selection.start, text.length));
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const nextText = `${text.slice(0, lineStart)}${prefix}${text.slice(lineStart)}`;
  const offset = prefix.length;

  return { text: nextText, selection: { start: selection.start + offset, end: selection.end + offset } };
}

// The full line of text that the cursor currently sits on.
export function lineAtCursor(text: string, selection: TextSelection): string {
  const caret = Math.max(0, Math.min(selection.start, text.length));
  const start = text.lastIndexOf("\n", caret - 1) + 1;
  const newline = text.indexOf("\n", caret);
  const end = newline === -1 ? text.length : newline;
  return text.slice(start, end);
}

// Collapse markdown to readable plain text for list previews.
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // inline / fenced code
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s*[-*+]\s+/gm, "") // bullet lists
    .replace(/^\s*\d+\.\s+/gm, "") // ordered lists
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/~~(.*?)~~/g, "$1") // strikethrough
    .replace(/\s*\n\s*/g, " ") // newlines → spaces
    .trim();
}
