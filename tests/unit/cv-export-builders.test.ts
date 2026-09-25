/**
 * CV export builders: pdfmake document definition, docx Document, and the end-to-end
 * renderCvDocument service (pdfmake's browser build also runs under Node, so the real
 * PDF bytes are produced here).
 */

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { Packer } from "docx";
import type { Content, ContentText } from "pdfmake/interfaces";
import { parseMarkdownBlocks } from "../../src/lib/cv/markdown-blocks";
import { buildPdfDocDefinition } from "../../src/lib/cv/export/pdf-definition";
import { buildDocxDocument } from "../../src/lib/cv/export/docx-document";
import type { CvExportMeta } from "../../src/lib/cv/export/types";
import { renderCvDocument } from "../../src/services/cv-export";

const CV_MD = `# José Pérez
Santo Domingo, República Dominicana | [jose@example.com](jose@example.com) | [LinkedIn](https://linkedin.com/in/jose) | [bad](javascript:alert(1))
+1 809 555 0100

## Experiencia

### Ingeniero de Software — Acme
*2021 - Presente*
- Lideré la migración a **TypeScript** con _pruebas_ automatizadas
  - Sub-logro con más detalle
- Diseñé APIs REST

## Educación

Licenciatura en Informática, PUCMM

---

1. Primero
2. Segundo
`;

const META: CvExportMeta = {
  title: "José Pérez - CV",
  author: "José Pérez",
  subject: "Software Engineer",
  keywords: ["TypeScript", "React"],
};

/** Collects every link and text fragment from a pdfmake content tree. */
function walk(content: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(content)) {
    for (const c of content) walk(c, visit);
    return;
  }
  if (!content || typeof content !== "object") return;
  const node = content as Record<string, unknown>;
  visit(node);
  for (const key of ["text", "stack", "ul", "ol"]) {
    if (key in node) walk(node[key], visit);
  }
}

function allText(content: unknown): string {
  const parts: string[] = [];
  const collect = (c: unknown) => {
    if (typeof c === "string") parts.push(c);
    else if (Array.isArray(c)) c.forEach(collect);
    else if (c && typeof c === "object") {
      const node = c as Record<string, unknown>;
      for (const key of ["text", "stack", "ul", "ol"]) if (key in node) collect(node[key]);
    }
  };
  collect(content);
  return parts.join("");
}

describe("buildPdfDocDefinition", () => {
  const def = buildPdfDocDefinition(parseMarkdownBlocks(CV_MD), META);
  const content = def.content as Content[];

  it("defaults to LETTER, sets margins, default style and metadata", () => {
    expect(def.pageSize).toBe("LETTER");
    expect(def.pageMargins).toEqual([48, 44, 48, 44]);
    expect(def.defaultStyle).toMatchObject({ font: "Roboto", fontSize: 10 });
    expect(def.info).toMatchObject({
      title: "José Pérez - CV",
      author: "José Pérez",
      subject: "Software Engineer",
      keywords: "TypeScript, React",
    });
    expect(typeof def.pageBreakBefore).toBe("function");
    expect(buildPdfDocDefinition([], META, { pageSize: "A4" }).pageSize).toBe("A4");
  });

  it("defines the heading styles", () => {
    expect(def.styles?.name).toMatchObject({ fontSize: 18, bold: true });
    expect(def.styles?.section).toMatchObject({ fontSize: 11.5, bold: true });
    expect(def.styles?.subheading).toMatchObject({ fontSize: 10.5, bold: true });
  });

  it("maps h1 -> name, h2 -> uppercase section + rule (unbreakable), h3 -> subheading", () => {
    const name = content[0] as ContentText;
    expect(name.style).toBe("name");
    expect(name.headlineLevel).toBe(1);
    expect(allText(name)).toBe("José Pérez");

    const section = content.find(
      (c) => typeof c === "object" && c !== null && "stack" in c,
    ) as { stack: Content[]; unbreakable?: boolean; headlineLevel?: number };
    expect(section.unbreakable).toBe(true);
    expect(section.headlineLevel).toBe(2);
    expect(allText(section.stack[0])).toBe("EXPERIENCIA");
    expect(section.stack[1]).toHaveProperty("canvas");

    const sub = content.find(
      (c) => typeof c === "object" && c !== null && (c as ContentText).style === "subheading",
    );
    expect(allText(sub)).toBe("Ingeniero de Software — Acme");
  });

  it("keeps accented text, hard line breaks, bold/italic runs and nested lists", () => {
    const text = allText(content);
    expect(text).toContain("EDUCACIÓN");
    expect(text).toContain("Licenciatura en Informática, PUCMM");
    expect(text).toContain("Santo Domingo, República Dominicana");

    const contact = content[1] as ContentText;
    expect(contact.style).toBe("paragraph");
    expect(allText(contact)).toMatch(/\| bad\)?\n\+1 809 555 0100$/);

    const nodes: Record<string, unknown>[] = [];
    walk(content, (n) => nodes.push(n));
    expect(nodes.some((n) => n.text === "TypeScript" && n.bold === true)).toBe(true);
    expect(nodes.some((n) => n.text === "pruebas" && n.italics === true)).toBe(true);

    const ul = content.find((c) => typeof c === "object" && c !== null && "ul" in c) as {
      ul: Content[];
    };
    expect(ul.ul).toHaveLength(3); // item, nested list, item
    expect(ul.ul[1]).toHaveProperty("ul");

    const ol = content.find((c) => typeof c === "object" && c !== null && "ol" in c) as {
      ol: Content[];
    };
    expect(ol.ol).toHaveLength(2);
  });

  it("emits links only for safe hrefs", () => {
    const links: string[] = [];
    walk(content, (n) => {
      if (typeof n.link === "string") links.push(n.link);
    });
    expect(links).toContain("https://linkedin.com/in/jose");
    expect(links).toContain("mailto:jose@example.com");
    expect(links.some((l) => l.startsWith("javascript:"))).toBe(false);
    expect(allText(content)).toContain("bad");
  });
});

describe("buildDocxDocument", () => {
  it("packs to a .docx zip with real heading styles and accented text", async () => {
    const doc = buildDocxDocument(parseMarkdownBlocks(CV_MD), META);
    const bytes = new Uint8Array(await Packer.toArrayBuffer(doc));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Educación");
    expect(xml).toContain("José Pérez");
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\s*\/>/);
    expect(xml).toMatch(/<w:pStyle w:val="Title"\s*\/>/);
    expect(xml).toMatch(/<w:pStyle w:val="Heading2"\s*\/>/);
    expect(xml).toContain("<w:br/>");
    expect(xml).toContain("<w:hyperlink");
    expect(xml).not.toContain("javascript:");
    // Letter page size (twips).
    expect(xml).toMatch(/<w:pgSz w:w="12240" w:h="15840"/);

    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain("https://linkedin.com/in/jose");

    const core = await zip.file("docProps/core.xml")!.async("string");
    expect(core).toContain("José Pérez");
    expect(core).toContain("TypeScript, React");
  });
});

describe("renderCvDocument", () => {
  it("returns the markdown bytes for md", async () => {
    const bytes = await renderCvDocument(CV_MD, "md", META);
    expect(new TextDecoder().decode(bytes)).toBe(CV_MD);
  });

  it("renders a real PDF", async () => {
    const bytes = await renderCvDocument(CV_MD, "pdf", META);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);
  }, 30_000);

  it("renders a DOCX", async () => {
    const bytes = await renderCvDocument(CV_MD, "docx", META);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
});
