import { describe, it, expect } from "vitest";
import {
  fillIdentityFromSource,
  needsLlmParseFallback,
  parseCvMarkdown,
} from "@/lib/cv/parseCvMarkdown";
import { sampleParsedCv, minimalParsedCv, sampleRawCvText } from "../fixtures/sample-cv";
import type { ParsedCv } from "@/types/cv";

const BASE = `# Juan Perez
juan@example.com | +1 809 555 1234 | Santo Domingo, DR

## Experience

### Senior Engineer at ABC Tech
*Jan 2021 – Present* | Remote

- Built things
`;

describe("parseCvMarkdown — LLM deviations", () => {
  it("parses en/em-dash date ranges and Present/Actualidad", () => {
    const md = `# A
## Experience
### Dev at One
*Jan 2021 – Present*
### Dev at Two
*Mar 2019 — Actualidad* | Santo Domingo
### Dev at Three
Feb 2017 - Dec 2018
`;
    const { parsed } = parseCvMarkdown(md);
    expect(parsed.experience.map((e) => [e.start_date, e.end_date, e.location])).toEqual([
      ["Jan 2021", null, ""],
      ["Mar 2019", null, "Santo Domingo"],
      ["Feb 2017", "Dec 2018", ""],
    ]);
  });

  it("recovers structure from **bold** pseudo-headings without # headings", () => {
    const md = `**Juan Perez**
juan@example.com | +1 809 555 1234

**Professional Summary**

Backend engineer.

**Experience**

**Senior Engineer at ABC Tech**
*Jan 2020 – Present*
- Led the migration
**Technologies:** Node.js, AWS

**Education**

**Bachelor in Computer Science**
*INTEC* | 2012 - 2016
`;
    const result = parseCvMarkdown(md);
    const { parsed } = result;
    expect(parsed.full_name).toBe("Juan Perez");
    expect(parsed.email).toBe("juan@example.com");
    expect(parsed.summary).toBe("Backend engineer.");
    expect(parsed.experience).toHaveLength(1);
    expect(parsed.experience[0]).toMatchObject({
      title: "Senior Engineer",
      company: "ABC Tech",
      start_date: "Jan 2020",
      end_date: null,
      achievements: ["Led the migration"],
      technologies: ["Node.js", "AWS"],
    });
    expect(parsed.education[0]).toMatchObject({
      degree: "Bachelor",
      field: "Computer Science",
      institution: "INTEC",
      start_date: "2012",
      end_date: "2016",
    });
    expect(parsed.extra_sections).toBeUndefined();
    expect(result.recognizedSections).toEqual(["summary", "experience", "education"]);
  });

  it("recognizes Spanish headings", () => {
    const md = `# María López
maria@correo.com

## Perfil Profesional

Ingeniera de datos.

## Habilidades

**Habilidades técnicas:** Python, SQL
**Habilidades blandas:** Liderazgo, Comunicación

## Experiencia Laboral

### Ingeniera de Software en ABC
*Enero 2020 - Actualidad* | Santo Domingo

- Diseñé pipelines

**Tecnologías:** Python, Airflow

## Educación

### Licenciatura en Informática
*PUCMM* | 2014 - 2018

## Idiomas

- Español: Nativo
- Inglés: Avanzado (TOEFL 100)
`;
    const result = parseCvMarkdown(md);
    const { parsed } = result;
    expect(result.recognizedSections).toEqual([
      "summary",
      "skills",
      "experience",
      "education",
      "languages",
    ]);
    expect(parsed.summary).toBe("Ingeniera de datos.");
    expect(parsed.skills).toEqual({ technical: ["Python", "SQL"], soft: ["Liderazgo", "Comunicación"] });
    expect(parsed.experience[0]).toMatchObject({
      title: "Ingeniera de Software",
      company: "ABC",
      start_date: "Enero 2020",
      end_date: null,
      location: "Santo Domingo",
      technologies: ["Python", "Airflow"],
    });
    expect(parsed.education[0]).toMatchObject({
      degree: "Licenciatura",
      field: "Informática",
      institution: "PUCMM",
    });
    expect(parsed.languages).toEqual([
      { name: "Español", level: "native", certification: "" },
      { name: "Inglés", level: "advanced", certification: "TOEFL 100" },
    ]);
    expect(result.confidence).toBe("high");
  });

  it("parses the Spanish vocabulary used by the optimization prompt", () => {
    const md = `# Juan Perez

juan.perez@email.com | +1-809-555-1234 | Santo Domingo, RD
LinkedIn: linkedin.com/in/juanperez

## Resumen Profesional

Desarrollador con 5 años de experiencia.

## Habilidades

**Habilidades Técnicas:** TypeScript, React
**Habilidades Blandas:** Liderazgo

## Experiencia

### Especialista en Datos en ABC Tech
*Enero 2021 - Actualidad* | Santo Domingo, RD

- Reduje el tiempo de respuesta un 40%

**Tecnologías:** Node.js, AWS

## Proyectos

### Herramienta CLI
github.com/juanperez/cli-tool

Automatiza despliegues.

## Educación

### Licenciatura en Ciencias de la Computación
*INTEC* | Santo Domingo, RD | 2012 - 2016
Honores: Magna Cum Laude

## Certificaciones

- AWS Solutions Architect Associate

## Idiomas

- Español: nativo
- Inglés: fluido (TOEFL 110)
`;
    const result = parseCvMarkdown(md);
    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe("high");
    const { parsed } = result;
    expect(parsed.skills).toEqual({ technical: ["TypeScript", "React"], soft: ["Liderazgo"] });
    expect(parsed.experience[0]).toEqual({
      title: "Especialista en Datos",
      company: "ABC Tech",
      location: "Santo Domingo, RD",
      start_date: "Enero 2021",
      end_date: null,
      description: "",
      achievements: ["Reduje el tiempo de respuesta un 40%"],
      technologies: ["Node.js", "AWS"],
    });
    expect(parsed.projects[0]).toMatchObject({
      name: "Herramienta CLI",
      url: "github.com/juanperez/cli-tool",
      description: "Automatiza despliegues.",
    });
    expect(parsed.education[0]).toMatchObject({
      degree: "Licenciatura",
      field: "Ciencias de la Computación",
      institution: "INTEC",
      honors: ["Magna Cum Laude"],
    });
    expect(parsed.certifications).toEqual(["AWS Solutions Architect Associate"]);
    expect(parsed.languages).toEqual([
      { name: "Español", level: "native", certification: "" },
      { name: "Inglés", level: "fluent", certification: "TOEFL 110" },
    ]);
  });

  it("accepts *, • and 1. bullets", () => {
    const md = `# A
## Experience
### Dev at One
* star bullet
• dot bullet
1. numbered bullet
2) numbered paren
+ plus bullet
  continued on the next line
`;
    const { parsed } = parseCvMarkdown(md);
    expect(parsed.experience[0].achievements).toEqual([
      "star bullet",
      "dot bullet",
      "numbered bullet",
      "numbered paren",
      "plus bullet continued on the next line",
    ]);
  });

  it("unwraps ```markdown fences, CRLF and <<<CV>>> markers", () => {
    const fenced = "```markdown\n" + BASE + "```";
    const crlf = BASE.replace(/\n/g, "\r\n");
    const marked = `<<<NOTES>>>\nI improved the summary.\n<<<END NOTES>>>\n<<<CV>>>\n${BASE}<<<END CV>>>\n`;
    for (const md of [fenced, crlf, marked]) {
      const { parsed, confidence } = parseCvMarkdown(md);
      expect(parsed.full_name).toBe("Juan Perez");
      expect(parsed.phone).toBe("+1 809 555 1234");
      expect(parsed.experience[0]).toMatchObject({
        title: "Senior Engineer",
        company: "ABC Tech",
        start_date: "Jan 2021",
        end_date: null,
        location: "Remote",
        achievements: ["Built things"],
      });
      expect(parsed.summary).toBe("");
      expect(confidence).toBe("high");
    }
  });

  it("splits Title @ Company, Title — Company and Spanish 'en'", () => {
    const md = `# A
## Experience
### Backend Dev @ Globant
### Frontend Dev — Acme Corp
### Ingeniero de Software en ABC
### Staff Engineer | Stripe | 2019 - 2021
`;
    const { parsed } = parseCvMarkdown(md);
    expect(parsed.experience.map((e) => [e.title, e.company])).toEqual([
      ["Backend Dev", "Globant"],
      ["Frontend Dev", "Acme Corp"],
      ["Ingeniero de Software", "ABC"],
      ["Staff Engineer", "Stripe"],
    ]);
    expect(parsed.experience[3]).toMatchObject({ start_date: "2019", end_date: "2021" });
  });

  it("reads unbolded Technologies:/Stack: lines and keeps description text", () => {
    const md = `# A
## Experience
### Dev at One
*2020 - 2021*

Worked on the **billing** platform.

- Did X
Technologies: React, Node.js
### Dev at Two
Tech stack: Go; Kafka
`;
    const { parsed } = parseCvMarkdown(md);
    expect(parsed.experience[0].description).toBe("Worked on the **billing** platform.");
    expect(parsed.experience[0].technologies).toEqual(["React", "Node.js"]);
    expect(parsed.experience[1].technologies).toEqual(["Go", "Kafka"]);
  });

  it("parses skills given as bullets, labels and separate sections", () => {
    const md = `# A
## Skills
- **Languages:** TypeScript, Python
- React
- AWS (EC2, S3), Docker
Soft skills: Teamwork; Mentoring
## Soft Skills
- Communication
- teamwork
`;
    const { parsed } = parseCvMarkdown(md);
    expect(parsed.skills.technical).toEqual([
      "TypeScript",
      "Python",
      "React",
      "AWS (EC2, S3)",
      "Docker",
    ]);
    expect(parsed.skills.soft).toEqual(["Teamwork", "Mentoring", "Communication"]);
  });

  it("parses language variants and keeps unknown levels", () => {
    const md = `# A
## Languages
- Spanish (Native)
- English — C1
- Français: courant
- Portuguese: B2 (DELE)
German: Basic, Italian: Fluent
`;
    const result = parseCvMarkdown(md);
    expect(result.parsed.languages).toEqual([
      { name: "Spanish", level: "native", certification: "" },
      { name: "English", level: "advanced", certification: "" },
      { name: "Français", level: "intermediate", certification: "courant" },
      { name: "Portuguese", level: "intermediate", certification: "DELE" },
      { name: "German", level: "basic", certification: "" },
      { name: "Italian", level: "fluent", certification: "" },
    ]);
    expect(result.warnings.some((w) => w.includes("courant"))).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("parses the fixture's 'Spanish (Native), English (Fluent - TOEFL 110)' line", () => {
    const { parsed } = parseCvMarkdown(
      "# A\n## Languages\nSpanish (Native), English (Fluent - TOEFL 110)\n",
    );
    expect(parsed.languages).toEqual([
      { name: "Spanish", level: "native", certification: "" },
      { name: "English", level: "fluent", certification: "TOEFL 110" },
    ]);
  });

  it("keeps unknown sections verbatim in extra_sections with a warning", () => {
    const md = `${BASE}
## Volunteer

### Habitat for Humanity
- Built *houses*

## Certifications
- CKA
`;
    const result = parseCvMarkdown(md);
    expect(result.parsed.extra_sections).toEqual([
      { heading: "Volunteer", body: "### Habitat for Humanity\n- Built *houses*" },
    ]);
    expect(result.parsed.certifications).toEqual(["CKA"]);
    expect(result.parsed.experience).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("Volunteer"))).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("parses contact links in several formats", () => {
    const md = `# Juan Perez
📧 juan@example.com · 📞 (809) 555-1234 · [LinkedIn](https://linkedin.com/in/juan) · https://github.com/juan
Website: juan.dev

## Summary
Hi.
`;
    const { parsed } = parseCvMarkdown(md);
    expect(parsed).toMatchObject({
      email: "juan@example.com",
      phone: "(809) 555-1234",
      linkedin_url: "https://linkedin.com/in/juan",
      github_url: "https://github.com/juan",
      portfolio_url: "juan.dev",
      location: "",
    });
  });

  it("keeps a header headline and unlabeled summary instead of dropping them", () => {
    const md = `# Juan Perez
Senior Backend Engineer
juan@example.com | Santo Domingo, DR

Backend engineer with eight years building payment systems for fintech startups across LATAM.

## Experience
### Dev at One
`;
    const result = parseCvMarkdown(md);
    expect(result.parsed.location).toBe("Santo Domingo, DR");
    expect(result.parsed.summary).toMatch(/^Backend engineer with eight years/);
    expect(result.parsed.extra_sections).toEqual([
      { heading: "Headline", body: "Senior Backend Engineer" },
    ]);
  });

  it("parses projects with markdown links and URL labels", () => {
    const md = `# A
## Projects
### [CLI Tool](https://github.com/a/cli)
A CLI.
- 500 stars
Stack: Rust
### Web App
Link: app.example.com

Does things.
`;
    const { parsed } = parseCvMarkdown(md);
    expect(parsed.projects).toEqual([
      {
        name: "CLI Tool",
        url: "https://github.com/a/cli",
        description: "A CLI.",
        achievements: ["500 stars"],
        technologies: ["Rust"],
      },
      {
        name: "Web App",
        url: "app.example.com",
        description: "Does things.",
        achievements: [],
        technologies: [],
      },
    ]);
  });

  it("splits education/experience meta written with dashes and emphasized prefixes", () => {
    const md = `# A
## Education
### B.S. in Computer Science
**University of Central Florida** — Orlando, FL | 2013 – 2017
- GPA 3.8
## Experience
### Backend Engineer
**Spotify**, Stockholm | Jan 2020 – Present
`;
    const { parsed } = parseCvMarkdown(md);
    expect(parsed.education[0]).toEqual({
      institution: "University of Central Florida",
      location: "Orlando, FL",
      degree: "B.S.",
      field: "Computer Science",
      start_date: "2013",
      end_date: "2017",
      honors: ["GPA 3.8"],
    });
    expect(parsed.experience[0]).toMatchObject({
      title: "Backend Engineer",
      company: "Spotify",
      location: "Stockholm",
      start_date: "Jan 2020",
      end_date: null,
    });
  });

  it("promotes plain-text section names (no #) to sections", () => {
    const md = `Juan Perez
juan@example.com

EXPERIENCE

### Dev at One
*2020 - 2021*

Habilidades:
React, Node.js
`;
    const result = parseCvMarkdown(md);
    expect(result.parsed.full_name).toBe("Juan Perez");
    expect(result.parsed.experience.map((e) => e.company)).toEqual(["One"]);
    expect(result.parsed.skills.technical).toEqual(["React", "Node.js"]);
    expect(result.recognizedSections).toEqual(["experience", "skills"]);
  });

  it("gives low confidence when entries have no headings (plain-text roles)", () => {
    const result = parseCvMarkdown(`# A
## Experience
ABC Tech, Santo Domingo
Senior Engineer | 2020 - Present
- Did things
`);
    expect(result.parsed.experience).toHaveLength(1);
    expect(result.parsed.experience[0].achievements).toEqual(["Did things"]);
    expect(result.confidence).toBe("low");
  });

  it("gives low confidence when there are no headings", () => {
    const result = parseCvMarkdown(sampleRawCvText);
    expect(result.confidence).toBe("low");
    expect(needsLlmParseFallback(result)).toBe(true);
    expect(parseCvMarkdown("").confidence).toBe("low");
    expect(parseCvMarkdown("just some words\nand more").confidence).toBe("low");
  });

  it("gives low confidence when the name is missing", () => {
    const result = parseCvMarkdown("## Experience\n### Dev at One\n");
    expect(result.parsed.full_name).toBe("");
    expect(result.confidence).toBe("low");
  });
});

describe("needsLlmParseFallback", () => {
  it("is false for a clean parse", () => {
    const result = parseCvMarkdown(BASE);
    expect(needsLlmParseFallback(result)).toBe(false);
    expect(needsLlmParseFallback(result, null)).toBe(false);
  });

  it("is true when fewer roles come back than the source had", () => {
    const result = parseCvMarkdown(BASE);
    expect(result.parsed.experience).toHaveLength(1);
    expect(needsLlmParseFallback(result, sampleParsedCv)).toBe(true);
    expect(
      needsLlmParseFallback(result, { ...sampleParsedCv, experience: sampleParsedCv.experience.slice(0, 1) }),
    ).toBe(false);
  });

  it("is true for low confidence", () => {
    expect(needsLlmParseFallback(parseCvMarkdown("hello"))).toBe(true);
  });
});

describe("fillIdentityFromSource", () => {
  it("fills only empty identity fields", () => {
    const parsed: ParsedCv = {
      ...minimalParsedCv,
      full_name: "Juan P.",
      email: "",
      phone: "  ",
      summary: "",
    };
    const filled = fillIdentityFromSource(parsed, sampleParsedCv);
    expect(filled.full_name).toBe("Juan P.");
    expect(filled.email).toBe(sampleParsedCv.email);
    expect(filled.phone).toBe(sampleParsedCv.phone);
    expect(filled.location).toBe(sampleParsedCv.location);
    expect(filled.linkedin_url).toBe(sampleParsedCv.linkedin_url);
    expect(filled.github_url).toBe(sampleParsedCv.github_url);
    expect(filled.portfolio_url).toBe(sampleParsedCv.portfolio_url);
    // Non-identity fields are untouched.
    expect(filled.summary).toBe("");
    expect(filled.experience).toEqual([]);
    // Input is not mutated.
    expect(parsed.email).toBe("");
  });
});
