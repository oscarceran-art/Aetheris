// Document attachments — turn a file the user picked in the composer into text
// the model can read.
//
// Everything happens in the browser: text formats are read directly, Word
// (.docx) goes through mammoth and PDFs through pdf.js. Nothing is uploaded,
// and the parser packages are imported lazily so they don't weigh down startup.
//
// The extracted text travels with the message (see AgentSpace.withContext) and
// is capped so one big file can't blow up the prompt.

export const DOC_CHARS = 12000; // per document
export const DOC_TOTAL_CHARS = 36000; // across all documents on one message
export const DOC_MAX_FILES = 8;
export const DOC_MAX_BYTES = 20 * 1024 * 1024; // 20 MB, before parsing
const MAX_PDF_PAGES = 250;

// Plain-text formats we can hand to the model as-is.
const TEXT_EXT = new Set([
  "txt", "text", "md", "markdown", "mdx", "csv", "tsv", "json", "jsonl", "ndjson",
  "yaml", "yml", "toml", "ini", "cfg", "conf", "xml", "html", "htm", "css", "scss",
  "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "h", "cpp", "hpp",
  "cs", "php", "sh", "bash", "zsh", "sql", "log", "srt", "vtt",
]);

const extOf = (name) => (String(name).split(".").pop() || "").toLowerCase();

const normalize = (text) =>
  String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const fail = (msg) => {
  throw new Error(msg);
};

const readAsText = async (file) => {
  const raw = await file.text();
  // A .txt-ish extension isn't proof: reject obvious binaries early.
  if (raw.slice(0, 2000).includes("\u0000")) fail(`“${file.name}” looks like a binary file, not text.`);
  return raw;
};

const readDocx = async (file) => {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value || "";
};

const readPptx = async (file) => {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/i)[1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/i)[1], 10);
      return na - nb;
    });

  if (!slideFiles.length) fail(`“${file.name}” has no slides to read.`);

  const parser = new DOMParser();
  const texts = [];
  for (const path of slideFiles) {
    const xml = await zip.file(path).async("text");
    const doc = parser.parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) continue;
    const nodes = doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "t");
    if (!nodes.length) {
      // Fallback for any namespace
      const all = doc.getElementsByTagName("a:t");
      for (let i = 0; i < all.length; i++) {
        const t = all[i].textContent;
        if (t && t.trim()) texts.push(t);
      }
    } else {
      for (let i = 0; i < nodes.length; i++) {
        const t = nodes[i].textContent;
        if (t && t.trim()) texts.push(t);
      }
    }
    // Group by slide roughly by adding blank line
  }

  // Better: extract per slide
  const slides = [];
  for (let s = 0; s < slideFiles.length; s++) {
    const path = slideFiles[s];
    const xml = await zip.file(path).async("text");
    const doc = parser.parseFromString(xml, "application/xml");
    const parts = [];
    // Try drawingml namespace
    let nodes = doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "t");
    if (!nodes || nodes.length === 0) nodes = doc.getElementsByTagName("a:t");
    for (let i = 0; i < nodes.length; i++) {
      const t = nodes[i].textContent;
      if (t && t.trim()) parts.push(t.trim());
    }
    if (parts.length) slides.push(`Slide ${s + 1}:\n${parts.join("\n")}`);
  }

  if (!slides.length) fail(`“${file.name}” has no readable text.`);
  return slides.join("\n\n");
};

const readPdf = async (file) => {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const pdf = await task.promise;
  try {
    const pages = [];
    let chars = 0;
    const total = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let n = 1; n <= total; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let line = "";
      const lines = [];
      for (const item of content.items) {
        if (typeof item?.str !== "string") continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line.trim()) lines.push(line);
      const text = lines.join("\n").trim();
      if (text) {
        pages.push(text);
        chars += text.length;
      }
      page.cleanup?.();
      // Enough text for the cap — no need to render the rest of a 500-page book.
      if (chars > DOC_CHARS * 2) break;
    }
    return pages.join("\n\n");
  } finally {
    await pdf.destroy().catch(() => {});
  }
};

export const docLabel = (doc) => (doc?.kind ? doc.kind.toUpperCase() : "DOC");

// True when a message carries document context (used for prompt assembly).
export const hasDocs = (msg) => !!msg?.docs?.length;

// Read one File into { id, name, kind, bytes, text, chars, truncated }.
export const readDoc = async (file) => {
  if (!file) fail("No file was selected.");
  if (file.size > DOC_MAX_BYTES) {
    fail(`“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${DOC_MAX_BYTES / 1024 / 1024} MB.`);
  }

  const ext = extOf(file.name);
  let text = "";
  let kind = ext || "text";

  if (ext === "docx") {
    kind = "docx";
    text = await readDocx(file);
  } else if (ext === "pptx") {
    kind = "pptx";
    text = await readPptx(file);
  } else if (ext === "pdf") {
    kind = "pdf";
    text = await readPdf(file);
  } else if (TEXT_EXT.has(ext) || String(file.type || "").startsWith("text/")) {
    kind = ext || "text";
    text = await readAsText(file);
  } else if (ext === "doc") {
    fail("Legacy Word files (.doc) aren't supported — open it and save as .docx or PDF, then attach that.");
  } else if (ext === "ppt" || ext === "pps" || ext === "potx") {
    fail("Legacy PowerPoint files (.ppt/.pps) aren't supported — save as .pptx and attach that.");
  } else {
    fail(`“${file.name}” can't be read. Attach text, Markdown, CSV, JSON, PDF, Word (.docx) or PowerPoint (.pptx) files.`);
  }

  text = normalize(text);
  if (!text) fail(`“${file.name}” has no readable text.`);
  if (kind === "pdf" && text.replace(/\s/g, "").length < 20) {
    fail(`“${file.name}” looks scanned — there's no text layer to read. Try a text-based PDF.`);
  }

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    kind,
    bytes: file.size,
    text: text.slice(0, DOC_CHARS),
    chars: text.length,
    truncated: text.length > DOC_CHARS,
  };
};

// Compact form stored on the message (drops bytes and keeps what the model needs).
export const docForMessage = (d) => ({
  id: d.id,
  name: d.name,
  kind: d.kind,
  chars: d.chars,
  text: d.text,
  ...(d.truncated ? { truncated: true } : {}),
});

export const docSummary = (d) => `${d.name} (${d.kind || "doc"}, ${d.chars.toLocaleString()} chars)`;
