import type { CheckerResult } from "./types";
import type { AtsIssue } from "@/types/ats";

// ---------------------------------------------------------------------------
// Format compatibility checker — detects elements that break ATS parsing
// ---------------------------------------------------------------------------

export function checkFormat(rawText: string, fileType: string): CheckerResult {
  const issues: AtsIssue[] = [];
  let score = 100;
  const lines = rawText.split("\n");
  const details: Record<string, unknown> = { fileType, lineCount: lines.length };

  // ---- 1. Table detection ----
  const tabHeavyLines = lines.filter((l) => (l.match(/\t/g) ?? []).length >= 3);
  const pipeHeavyLines = lines.filter((l) => (l.match(/\|/g) ?? []).length >= 3);

  if (tabHeavyLines.length >= 3) {
    issues.push({
      check: "format_compatibility",
      severity: "critical",
      message: `Detected ${tabHeavyLines.length} lines with table-like tab formatting. ATS systems often scramble table content.`,
      fix: "Replace tables with plain-text lists or bullet points.",
    });
    score -= 20;
    details.tabTableLines = tabHeavyLines.length;
  }

  if (pipeHeavyLines.length >= 3) {
    issues.push({
      check: "format_compatibility",
      severity: "critical",
      message: `Detected ${pipeHeavyLines.length} lines with pipe-delimited table formatting.`,
      fix: "Remove pipe-grid tables and use simple bullet-point lists instead.",
    });
    score -= 15;
    details.pipeTableLines = pipeHeavyLines.length;
  }

  // ---- 2. Multi-column detection ----
  // Look for alternating short-long patterns or lines that are very short
  // followed by normal lines (suggesting a 2-column layout)
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length >= 10) {
    const lengths = nonEmptyLines.map((l) => l.trim().length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    let shortLongAlternations = 0;
    for (let i = 1; i < lengths.length; i++) {
      const prev = lengths[i - 1];
      const curr = lengths[i];
      // Short line followed by long line (or vice versa) with big difference
      if (
        (prev < avgLen * 0.3 && curr > avgLen * 0.7) ||
        (curr < avgLen * 0.3 && prev > avgLen * 0.7)
      ) {
        shortLongAlternations++;
      }
    }

    const alternationRatio = shortLongAlternations / nonEmptyLines.length;
    if (alternationRatio > 0.3) {
      issues.push({
        check: "format_compatibility",
        severity: "warning",
        message: "Text layout suggests a multi-column format. ATS parsers read left-to-right, top-to-bottom and may mix up column content.",
        fix: "Use a single-column resume layout for maximum ATS compatibility.",
      });
      score -= 12;
      details.multiColumnSuspected = true;
    }
  }

  // ---- 3. Image / embedded content indicators ----
  const imagePatterns = [
    /\[image\]/i,
    /\[logo\]/i,
    /\[photo\]/i,
    /\[picture\]/i,
    /\[graphic\]/i,
    /\[icon\]/i,
    /data:image\/[a-z]+;base64/i,
    /\.(?:png|jpg|jpeg|gif|svg|bmp|webp)\b/i,
  ];

  let imageIndicators = 0;
  for (const line of lines) {
    for (const pat of imagePatterns) {
      if (pat.test(line)) {
        imageIndicators++;
        break;
      }
    }
  }

  if (imageIndicators > 0) {
    issues.push({
      check: "format_compatibility",
      severity: "warning",
      message: `Found ${imageIndicators} image/graphic indicator(s). ATS systems cannot read images.`,
      fix: "Remove images, logos, and photos. Replace graphical skill bars with text descriptions.",
    });
    score -= Math.min(15, imageIndicators * 5);
    details.imageIndicators = imageIndicators;
  }

  // ---- 4. Excessive special characters / decorators ----
  const decoratorPattern = /[★☆●◆◇▪▫►▶◀◁♦♣♠♥✓✗✘✔✕✖✦✧✩✪✫✬✭✮✯❖⬥⬦⬧⬨⬩⬪⬫⬬⬭]/g;
  let decoratorCount = 0;
  for (const line of lines) {
    const matches = line.match(decoratorPattern);
    if (matches) decoratorCount += matches.length;
  }

  // Standard bullets (•, -, *) are fine; exotic ones are not
  if (decoratorCount > 10) {
    issues.push({
      check: "format_compatibility",
      severity: "warning",
      message: `Found ${decoratorCount} special Unicode decorators/symbols. Some ATS systems may not render these correctly.`,
      fix: "Replace fancy symbols with standard bullets (• or -) or plain text.",
    });
    score -= Math.min(10, Math.floor(decoratorCount / 3));
    details.decoratorCount = decoratorCount;
  }

  // ---- 5. File type preference ----
  const ft = fileType.toLowerCase();
  if (ft === "docx" || ft === "doc") {
    // Preferred format — no penalty
    details.fileTypeScore = "preferred";
  } else if (ft === "pdf") {
    // Acceptable but some ATS struggle
    issues.push({
      check: "format_compatibility",
      severity: "info",
      message: "PDF format detected. Most modern ATS systems handle PDFs well, but .docx is generally safer.",
      fix: "Consider also having a .docx version of your resume for maximum compatibility.",
    });
    score -= 3;
    details.fileTypeScore = "acceptable";
  } else {
    issues.push({
      check: "format_compatibility",
      severity: "critical",
      message: `File type "${fileType}" is not commonly supported by ATS systems.`,
      fix: "Convert your resume to .docx or .pdf format.",
    });
    score -= 20;
    details.fileTypeScore = "unsupported";
  }

  // ---- 6. Very long lines (merged cells / run-on text) ----
  const longLines = lines.filter((l) => l.trim().length > 200);
  if (longLines.length > 3) {
    issues.push({
      check: "format_compatibility",
      severity: "warning",
      message: `${longLines.length} lines exceed 200 characters. This may indicate merged table cells or poorly extracted text.`,
      fix: "Break long text blocks into shorter paragraphs or bullet points.",
    });
    score -= Math.min(10, longLines.length * 2);
    details.longLineCount = longLines.length;
  }

  // ---- 7. Headers/footers (page numbers, repeated text) ----
  if (lines.length > 30) {
    const firstFive = lines.slice(0, 5).map((l) => l.trim().toLowerCase());
    const lastFive = lines.slice(-5).map((l) => l.trim().toLowerCase());
    const pageNumberPattern = /^(page\s+\d+|p\.\s*\d+|\d+\s*\/\s*\d+|\d+\s+of\s+\d+)$/i;
    const hasPageNumbers = [...firstFive, ...lastFive].some((l) =>
      pageNumberPattern.test(l),
    );
    if (hasPageNumbers) {
      issues.push({
        check: "format_compatibility",
        severity: "info",
        message: "Page numbers detected. ATS systems may parse them as regular text.",
        fix: "Remove manual page numbers; ATS systems process the document as a single flow.",
      });
      score -= 2;
      details.hasPageNumbers = true;
    }
  }

  // ---- 8. Empty/sparse content ----
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 10) {
    issues.push({
      check: "format_compatibility",
      severity: "warning",
      message: `Only ${nonEmpty.length} non-empty lines detected. The text extraction may be incomplete.`,
      fix: "Ensure your CV text is properly extracted. If using a PDF, try converting to .docx.",
    });
    score -= 10;
    details.nonEmptyLines = nonEmpty.length;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    details,
  };
}
