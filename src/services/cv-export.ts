/**
 * Renders a CV (markdown) to file bytes: PDF (pdfmake), DOCX (docx) or the markdown itself.
 * Heavy libraries are loaded on demand so they never land in the main bundle. No Tauri
 * imports here: saving the bytes is the caller's job.
 */

import { parseMarkdownBlocks } from "@/lib/cv/markdown-blocks";
import { buildPdfDocDefinition } from "@/lib/cv/export/pdf-definition";
import type { CvExportFormat, CvExportMeta } from "@/lib/cv/export/types";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

interface PdfMakeRuntime {
  createPdf(def: TDocumentDefinitions): { getBuffer(): Promise<Uint8Array> };
  addVirtualFileSystem(vfs: Record<string, string>): void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && (typeof value === "object" || typeof value === "function")
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * CJS/UMD interop: depending on the loader (Vite 8/rolldown in the app, Node ESM in
 * vitest), the API is the module's `default` (= module.exports), `default.default`
 * (double-wrapped) or the namespace itself. `default` is preferred: pdfmake's methods
 * rely on `this` being the real instance, not a namespace mirror of its keys.
 */
function pickInterop<T>(mod: unknown, matches: (candidate: Record<string, unknown>) => boolean): T | null {
  const ns = asRecord(mod);
  const def = asRecord(ns?.default);
  for (const candidate of [def, asRecord(def?.default), ns]) {
    if (candidate && matches(candidate)) return candidate as T;
  }
  return null;
}

/** Only the font entries: namespace objects also carry `default` / `__esModule` keys. */
function fontEntries(vfs: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(vfs)) {
    if (name !== "default" && typeof data === "string") out[name] = data;
  }
  return out;
}

let pdfMakePromise: Promise<PdfMakeRuntime> | null = null;

function loadPdfMake(): Promise<PdfMakeRuntime> {
  pdfMakePromise ??= (async () => {
    const [pdfMakeModule, vfsModule] = await Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
    ]);
    const pdfMake = pickInterop<PdfMakeRuntime>(
      pdfMakeModule,
      (c) => typeof c.createPdf === "function" && typeof c.addVirtualFileSystem === "function",
    );
    const vfs = pickInterop<Record<string, unknown>>(
      vfsModule,
      (c) => typeof c["Roboto-Regular.ttf"] === "string",
    );
    if (!pdfMake) throw new Error("pdfmake failed to load (createPdf not found)");
    if (!vfs) throw new Error("pdfmake fonts failed to load (Roboto not found in vfs_fonts)");
    pdfMake.addVirtualFileSystem(fontEntries(vfs));
    return pdfMake;
  })().catch((err: unknown) => {
    pdfMakePromise = null; // allow a retry after a transient chunk-load failure
    throw err;
  });
  return pdfMakePromise;
}

function toUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  // Copy: Buffer polyfills may be views over a larger pooled ArrayBuffer.
  return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

async function renderPdf(markdown: string, meta: CvExportMeta): Promise<Uint8Array> {
  const pdfMake = await loadPdfMake();
  const definition = buildPdfDocDefinition(parseMarkdownBlocks(markdown), meta);
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return toUint8Array(buffer);
}

async function renderDocx(markdown: string, meta: CvExportMeta): Promise<Uint8Array> {
  const [{ Packer }, { buildDocxDocument }] = await Promise.all([
    import("docx"),
    import("@/lib/cv/export/docx-document"),
  ]);
  const doc = buildDocxDocument(parseMarkdownBlocks(markdown), meta);
  return toUint8Array(await Packer.toArrayBuffer(doc));
}

export async function renderCvDocument(
  markdown: string,
  format: CvExportFormat,
  meta: CvExportMeta,
): Promise<Uint8Array> {
  switch (format) {
    case "md":
      return new TextEncoder().encode(markdown);
    case "pdf":
      return renderPdf(markdown, meta);
    case "docx":
      return renderDocx(markdown, meta);
    default: {
      const unknownFormat: never = format;
      throw new Error(`Unsupported CV export format: ${String(unknownFormat)}`);
    }
  }
}
