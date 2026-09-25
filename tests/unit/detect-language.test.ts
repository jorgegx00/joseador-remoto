import { describe, it, expect } from "vitest";
import { detectLanguage } from "@/lib/cv/detect-language";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { sampleParsedCv } from "../fixtures/sample-cv";

describe("detectLanguage", () => {
  it("detects English CV text", () => {
    expect(detectLanguage(formatCvAsMarkdown(sampleParsedCv))).toBe("en");
    expect(detectLanguage("Built the platform for the team and led the migration to AWS.")).toBe("en");
  });

  it("detects Spanish CV text", () => {
    expect(
      detectLanguage(
        "## Experiencia\n\nLideré el equipo de desarrollo y diseñé la arquitectura de los servicios para la empresa.",
      ),
    ).toBe("es");
    expect(detectLanguage("¿Qué hice? Migración de la plataforma con más de 5 años de experiencia.")).toBe("es");
  });

  it("returns null with too little signal", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("React, Node.js, AWS")).toBeNull();
    expect(detectLanguage("Juan Perez")).toBeNull();
  });

  it("is not fooled by English tech terms in a Spanish CV", () => {
    expect(
      detectLanguage("Desarrollé microservicios con Node.js, React y AWS para la empresa y el equipo de producto."),
    ).toBe("es");
  });
});
