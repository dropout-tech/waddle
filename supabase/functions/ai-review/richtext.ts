// Text extraction from Tiptap / ProseMirror JSON (sticky note content, focus
// board metadata.document). Design 6.4. WHITELIST: only `text` nodes produce
// characters, only the listed containers are walked, and every other node
// type (image, drawings, anything added later) is dropped with its subtree.
// `marks` are never read (so link hrefs never appear); `attrs` are read only
// for taskItem.checked. Pure: no I/O, no Deno APIs.

const CONTAINERS = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "details",
  "detailsSummary",
  "detailsContent",
  "codeBlock",
]);
const LINE_END = new Set(["paragraph", "heading", "listItem", "taskItem", "detailsSummary", "codeBlock"]);
const MAX_DEPTH = 20;

type Node = { type?: unknown; text?: unknown; attrs?: unknown; content?: unknown };

export function extractText(doc: unknown, limit = 4000): string {
  let out = "";
  const full = () => out.length >= limit;
  const walk = (node: unknown, depth: number) => {
    if (full() || depth > MAX_DEPTH || !node || typeof node !== "object" || Array.isArray(node)) return;
    const n = node as Node;
    if (n.type === "text") {
      if (typeof n.text === "string") out += n.text;
      return;
    }
    if (n.type === "hardBreak") {
      out += "\n";
      return;
    }
    if (typeof n.type !== "string" || !CONTAINERS.has(n.type)) return; // unknown → dropped with subtree
    if (n.type === "taskItem") {
      const attrs = n.attrs && typeof n.attrs === "object" ? (n.attrs as Record<string, unknown>) : {};
      out += attrs.checked === true ? "[x] " : "[ ] ";
    }
    if (Array.isArray(n.content)) for (const child of n.content) walk(child, depth + 1);
    if (LINE_END.has(n.type) && !out.endsWith("\n")) out += "\n";
  };
  walk(doc, 0);
  return out.slice(0, limit).trim();
}
