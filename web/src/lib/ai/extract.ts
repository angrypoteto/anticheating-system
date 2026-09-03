import "server-only";

import JSZip from "jszip";

export type ExtractResult =
  | { ok: true; text: string; chars: number }
  | { ok: false; error: string };

/** Collapses the whitespace soup that PDF and Office extraction tends to produce. */
function tidy(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromPdf(buf: Buffer): Promise<string> {
  // pdf-parse v2 is a rewrite: a PDFParse class, not the v1 default function.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function fromDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value ?? "";
}

/**
 * A .pptx is a zip of slide XML; slide text lives in <a:t> nodes. There's no
 * mainstream Node parser for it, and pulling those nodes is enough for our purpose.
 */
async function fromPptx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  const out: string[] = [];
  for (const name of slides) {
    const xml = await zip.files[name].async("string");
    const parts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    );
    if (parts.length) out.push(parts.join(" "));
  }
  return out.join("\n\n");
}

const MIN_CHARS = 200;

export async function extractText(
  buf: Buffer,
  filename: string,
): Promise<ExtractResult> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  try {
    let text = "";
    if (ext === "pdf") text = await fromPdf(buf);
    else if (ext === "docx") text = await fromDocx(buf);
    else if (ext === "pptx") text = await fromPptx(buf);
    else if (ext === "txt" || ext === "md") text = buf.toString("utf8");
    else return { ok: false, error: `Unsupported file type: .${ext}` };

    const cleaned = tidy(text);
    if (cleaned.length < MIN_CHARS) {
      return {
        ok: false,
        error:
          `Only ${cleaned.length} characters of text came out. ` +
          "If this is a scanned PDF, the pages are images and would need OCR.",
      };
    }
    return { ok: true, text: cleaned, chars: cleaned.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not read that file.",
    };
  }
}
