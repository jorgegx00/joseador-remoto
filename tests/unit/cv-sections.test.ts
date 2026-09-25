import { describe, it, expect } from "vitest";
import { alignCv, composeCv, parseCvSections, type AlignedRow } from "@/lib/cv/cv-sections";
import { normalizeCvMarkdown } from "@/lib/cv/markdown-blocks";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { sampleParsedCv } from "../fixtures/sample-cv";

const ORIGINAL = `# Juan Perez

juan@example.com | +1-809-555-1234

## Skills

**Technical Skills:** JavaScript, React, Node.js

## Experience

### Senior Software Engineer at ABC Tech

*January 2021 - Present* | Santo Domingo

- Reduced API response time by 40%

### Software Engineer at XYZ Solutions

*June 2018 - December 2020* | Santo Domingo

- Built real-time dashboard

## Education

### Bachelor in Computer Science

*INTEC* | 2012 - 2016

## Volunteer

Taught coding to kids.
`;

const byId = (rows: AlignedRow[], id: string) => rows.find((r) => r.id === id);

describe("parseCvSections", () => {
  it("assigns header, section and subsection ids", () => {
    const doc = parseCvSections(ORIGINAL, "o");
    expect(doc.preamble).toBe("");
    expect(doc.nodes.map((n) => n.id)).toEqual([
      "o:h",
      "o:s1",
      "o:s2",
      "o:s2.1",
      "o:s2.2",
      "o:s3",
      "o:s3.1",
      "o:s4",
    ]);
    const header = doc.nodes[0];
    expect(header.kind).toBe("header");
    expect(header.headingLine).toBe("# Juan Perez");
    expect(header.body).toBe("juan@example.com | +1-809-555-1234");

    const exp = doc.nodes.find((n) => n.id === "o:s2")!;
    expect(exp.sectionType).toBe("experience");
    expect(exp.body).toBe("");

    const role = doc.nodes.find((n) => n.id === "o:s2.1")!;
    expect(role).toMatchObject({
      kind: "subsection",
      level: 3,
      heading: "Senior Software Engineer at ABC Tech",
      parentId: "o:s2",
      sectionType: "experience",
    });
    expect(role.body.startsWith("*January 2021 - Present*")).toBe(true);
    expect(doc.nodes.find((n) => n.id === "o:s4")!.sectionType).toBeNull();
  });

  it("treats #### as a subsection and ### before any ## as an orphan", () => {
    const doc = parseCvSections("# Name\n\n### Orphan\n\ntext\n\n## Projects\n\n#### Deep\n\nbody", "p");
    expect(doc.nodes.map((n) => [n.id, n.kind, n.parentId])).toEqual([
      ["p:h", "header", null],
      ["p:x1", "subsection", null],
      ["p:s1", "section", null],
      ["p:s1.1", "subsection", "p:s1"],
    ]);
    expect(doc.nodes[3].headingLine).toBe("#### Deep");
  });

  it("keeps text before the first heading as preamble", () => {
    const doc = parseCvSections("Intro line\n\n# Name\n\ncontact", "o");
    expect(doc.preamble).toBe("Intro line");
    expect(doc.nodes[0].id).toBe("o:h");
  });

  it("returns one headingless section when there are no headings", () => {
    const doc = parseCvSections("Just some text\nwith lines", "o");
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]).toMatchObject({ kind: "section", heading: "", headingLine: "", id: "o:s1" });
    expect(doc.nodes[0].body).toBe("Just some text\nwith lines");
    expect(parseCvSections("   ", "o").nodes).toEqual([]);
  });
});

describe("composeCv", () => {
  it("round-trips parse → compose to the normalized input", () => {
    const doc = parseCvSections(ORIGINAL, "o");
    const out = composeCv(doc.nodes.map((n) => ({ headingLine: n.headingLine, body: n.body })), doc.preamble);
    expect(out).toBe(normalizeCvMarkdown(ORIGINAL));
  });

  it("is idempotent on formatCvAsMarkdown output", () => {
    const md = formatCvAsMarkdown(sampleParsedCv);
    const once = composeCv(parseCvSections(md, "o").nodes);
    const twice = composeCv(parseCvSections(once, "o").nodes);
    expect(twice).toBe(once);
    expect(once).toContain("### Senior Software Engineer at ABC Tech\n\n*January 2021 - Present*");
  });

  it("skips empty parts, emits heading-only parts and ends with a newline", () => {
    expect(
      composeCv(
        [
          { headingLine: "## A", body: "x" },
          { headingLine: null, body: null },
          { headingLine: "## B", body: null },
          { headingLine: null, body: "loose text" },
        ],
        "pre",
      ),
    ).toBe("pre\n\n## A\n\nx\n\n## B\n\nloose text\n");
    expect(composeCv([])).toBe("");
  });
});

describe("alignCv", () => {
  it("aligns identical documents one-to-one with original ids", () => {
    const rows = alignCv(ORIGINAL, ORIGINAL);
    expect(rows.map((r) => r.id)).toEqual(parseCvSections(ORIGINAL, "o").nodes.map((n) => n.id));
    for (const r of rows) {
      expect(r.original).toBe(r.proposed);
      expect(r.originalHeading).toBe(r.proposedHeading);
    }
    expect(byId(rows, "o:s2.1")!.parentId).toBe("o:s2");
  });

  it("aligns Spanish sections and roles with the English original", () => {
    const proposed = `# Juan Perez

juan@example.com | +1-809-555-1234

## Resumen Profesional

Ingeniero con experiencia en React.

## Habilidades

**Habilidades Técnicas:** JavaScript, React, Node.js, TypeScript

## Experiencia

### Ingeniero de Software en XYZ Solutions

*Junio 2018 - Diciembre 2020* | Santo Domingo

- Construí un dashboard en tiempo real

### Ingeniero de Software Senior en ABC Tech

*Enero 2021 - Actualidad* | Santo Domingo

- Reduje el tiempo de respuesta de la API en un 40%

## Educación

### Licenciatura en Ciencias de la Computación

*INTEC* | 2012 - 2016
`;
    const rows = alignCv(ORIGINAL, proposed);

    // New summary: original side absent, stable proposal-only id.
    const summary = rows.find((r) => r.proposedHeading === "## Resumen Profesional")!;
    expect(summary.original).toBeNull();
    expect(summary.id).toBe("p:resumen profesional#1");
    expect(summary.sectionType).toBe("summary");

    expect(byId(rows, "o:s1")!.proposedHeading).toBe("## Habilidades");
    expect(byId(rows, "o:s2")!.proposedHeading).toBe("## Experiencia");
    expect(byId(rows, "o:s3")!.proposedHeading).toBe("## Educación");

    // Roles swapped + translated: matched by company / date line, not by position.
    expect(byId(rows, "o:s2.1")!.proposedHeading).toBe("### Ingeniero de Software Senior en ABC Tech");
    expect(byId(rows, "o:s2.2")!.proposedHeading).toBe("### Ingeniero de Software en XYZ Solutions");
    expect(byId(rows, "o:s3.1")!.proposedHeading).toBe("### Licenciatura en Ciencias de la Computación");

    // Dropped section: proposed side absent, kept right after its original predecessor block.
    const volunteer = byId(rows, "o:s4")!;
    expect(volunteer.proposed).toBeNull();
    expect(volunteer.original).toBe("Taught coding to kids.");
    expect(rows[rows.length - 1].id).toBe("o:s4");

    // Proposal order; subsections carry their section row id.
    expect(rows.map((r) => r.id)).toEqual([
      "o:h",
      "p:resumen profesional#1",
      "o:s1",
      "o:s2",
      "o:s2.2",
      "o:s2.1",
      "o:s3",
      "o:s3.1",
      "o:s4",
    ]);
    expect(byId(rows, "o:s2.2")!.parentId).toBe("o:s2");
  });

  it("matches translated role titles by date line when company names differ", () => {
    const original = `## Experience

### Backend Lead at Northwind

*March 2019 - Present*

- Led the platform team

### Developer at Contoso

*January 2015 - February 2019*

- Wrote services
`;
    const proposed = `## Experiencia

### Desarrollador en Empresa Contosa

*Enero 2015 - Febrero 2019*

- Escribí servicios

### Líder Backend en Vientonorte

*Marzo 2019 - Actualidad*

- Lideré el equipo de plataforma
`;
    const rows = alignCv(original, proposed);
    expect(byId(rows, "o:s1.1")!.proposedHeading).toBe("### Líder Backend en Vientonorte");
    expect(byId(rows, "o:s1.2")!.proposedHeading).toBe("### Desarrollador en Empresa Contosa");
  });

  it("handles duplicate identical headings without id collisions", () => {
    const original = `## Experience

### Engineer at Acme

*2020 - 2021*

First stint

### Engineer at Acme

*2016 - 2018*

Second stint
`;
    const proposed = `## Experience

### Engineer at Acme

*2020 - 2021*

First stint, improved

### Engineer at Acme

*2016 - 2018*

Second stint, improved

### Engineer at Acme

*2014 - 2015*

Invented stint
`;
    const rows = alignCv(original, proposed);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(byId(rows, "o:s1.1")!.proposed).toBe("*2020 - 2021*\n\nFirst stint, improved");
    expect(byId(rows, "o:s1.2")!.proposed).toBe("*2016 - 2018*\n\nSecond stint, improved");
    const added = byId(rows, "p:engineer at acme#1")!;
    expect(added.original).toBeNull();
    expect(added.parentId).toBe("o:s1");
  });

  it("produces stable proposal-only ids across equivalent proposals", () => {
    const proposed = `## Summary\n\nA\n\n## Key Achievements\n\n- X\n`;
    const a = alignCv("## Skills\n\nJS\n", proposed).map((r) => r.id);
    const b = alignCv("## Skills\n\nJS\n", proposed.replace("- X", "- Y")).map((r) => r.id);
    expect(a).toEqual(b);
    expect(a).toContain("p:key achievements#1");
  });

  it("keeps an original-only subsection inside its parent block", () => {
    const original = `## Projects\n\n### Alpha\n\nA\n\n### Beta\n\nB\n\n### Gamma\n\nC\n\n## Languages\n\n- Spanish\n`;
    const proposed = `## Projects\n\n### Alpha\n\nA+\n\n### Gamma\n\nC+\n\n## Languages\n\n- Spanish\n`;
    const rows = alignCv(original, proposed);
    expect(rows.map((r) => r.id)).toEqual(["o:s1", "o:s1.1", "o:s1.2", "o:s1.3", "o:s2"]);
    expect(byId(rows, "o:s1.2")!.proposed).toBeNull();
    expect(byId(rows, "o:s1.2")!.parentId).toBe("o:s1");
  });

  it("pairs translated unknown sections by position but not across a dropped section", () => {
    const rows = alignCv(
      "## Skills\n\nJS\n\n## Volunteer\n\nTaught kids\n",
      "## Habilidades\n\nJS\n\n## Voluntariado\n\nEnseñé a niños\n",
    );
    expect(byId(rows, "o:s2")!.proposedHeading).toBe("## Voluntariado");

    const rows2 = alignCv(
      "## Skills\n\nJS\n\n## Experience\n\nX\n\n## Volunteer\n\nTaught kids\n",
      "## Skills\n\nJS\n\n## Awards\n\nHackathon\n",
    );
    expect(byId(rows2, "o:s3")!.proposed).toBeNull();
    expect(byId(rows2, "p:awards#1")!.original).toBeNull();
  });

  it("represents a preamble as a headingless row", () => {
    const rows = alignCv("# Name\n\nx\n", "Here is your CV:\n\n# Name\n\nx\n");
    expect(rows[0]).toMatchObject({ id: "p:pre", original: null, proposed: "Here is your CV:", proposedHeading: null });
    expect(rows[1].id).toBe("o:h");
  });

  it("keeps an original header dropped by the proposal first", () => {
    const rows = alignCv("# Name\n\ncontact\n\n## Skills\n\nJS\n", "## Skills\n\nJS, TS\n");
    expect(rows[0]).toMatchObject({ id: "o:h", kind: "header", proposed: null });
    expect(rows[1].id).toBe("o:s1");
  });
});
