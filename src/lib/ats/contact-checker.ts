import type { ParsedCv } from "@/types/cv";
import type { CheckerResult } from "./types";
import type { AtsIssue } from "@/types/ats";

// ---------------------------------------------------------------------------
// Contact information checker
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/;
const LINKEDIN_REGEX = /linkedin\.com\/in\/[\w\-]+/i;
const GITHUB_REGEX = /github\.com\/[\w\-]+/i;
const URL_REGEX = /https?:\/\/[^\s]+/gi;

export function checkContact(
  rawText: string,
  parsedCv: ParsedCv,
): CheckerResult {
  const issues: AtsIssue[] = [];
  let score = 100;
  const details: Record<string, unknown> = {};
  const lines = rawText.split("\n");
  const topLines = lines.slice(0, 15).join("\n"); // first ~15 lines

  // ---- 1. Name ----
  if (!parsedCv.full_name || parsedCv.full_name.trim().length === 0) {
    issues.push({
      check: "contact_data",
      severity: "critical",
      message: "Full name is missing or could not be detected.",
      fix: "Make sure your full name is prominently displayed at the top of your CV in a large font.",
    });
    score -= 25;
    details.hasName = false;
  } else {
    details.hasName = true;
    // Check name is near the top
    const nameLower = parsedCv.full_name.toLowerCase();
    const topLower = topLines.toLowerCase();
    if (!topLower.includes(nameLower)) {
      // Name might be split across formatting — check partial match
      const nameParts = nameLower.split(/\s+/);
      const allPartsFound = nameParts.every((p) => topLower.includes(p));
      if (!allPartsFound) {
        issues.push({
          check: "contact_data",
          severity: "info",
          message: "Your name may not be clearly visible at the top of the CV.",
          fix: "Place your full name at the very top of the document.",
        });
        score -= 3;
      }
    }
  }

  // ---- 2. Email ----
  const cvEmail = parsedCv.email?.trim() ?? "";
  const emailInText = rawText.match(EMAIL_REGEX);

  if (!cvEmail && !emailInText) {
    issues.push({
      check: "contact_data",
      severity: "critical",
      message: "No email address found.",
      fix: "Add a professional email address (preferably Gmail or your own domain) to the header.",
    });
    score -= 25;
    details.hasEmail = false;
  } else {
    details.hasEmail = true;
    const actualEmail = cvEmail || emailInText?.[0] || "";

    // Validate format
    if (actualEmail && !EMAIL_REGEX.test(actualEmail)) {
      issues.push({
        check: "contact_data",
        severity: "warning",
        message: `Email "${actualEmail}" does not appear to be valid.`,
        fix: "Check your email address for typos.",
      });
      score -= 10;
    }

    // Check if email is near the top
    const emailInTop = topLines.match(EMAIL_REGEX);
    if (!emailInTop) {
      issues.push({
        check: "contact_data",
        severity: "info",
        message: "Email address not found in the first 15 lines. Contact info should be at the top.",
        fix: "Move your email address to the CV header area.",
      });
      score -= 3;
    }

    // Flag unprofessional email providers
    const unprofessionalDomains = ["hotmail.", "aol.", "yahoo."];
    for (const domain of unprofessionalDomains) {
      if (actualEmail.toLowerCase().includes(domain)) {
        issues.push({
          check: "contact_data",
          severity: "info",
          message: `Email uses ${domain.replace(".", "")} — consider using a more professional email provider.`,
          fix: "Use Gmail, Outlook, or a custom domain email for a more professional impression.",
        });
        score -= 2;
        break;
      }
    }

    details.email = actualEmail;
  }

  // ---- 3. Phone ----
  const cvPhone = parsedCv.phone?.trim() ?? "";
  const phoneInText = rawText.match(PHONE_REGEX);

  if (!cvPhone && !phoneInText) {
    issues.push({
      check: "contact_data",
      severity: "warning",
      message: "No phone number found.",
      fix: "Add a phone number with international country code (e.g., +1 555-123-4567).",
    });
    score -= 10;
    details.hasPhone = false;
  } else {
    details.hasPhone = true;
    const actualPhone = cvPhone || phoneInText?.[0] || "";

    // Check for international format
    if (actualPhone && !actualPhone.includes("+")) {
      issues.push({
        check: "contact_data",
        severity: "info",
        message: "Phone number lacks international country code prefix.",
        fix: "Add your country code (e.g., +1 for US, +52 for Mexico, +57 for Colombia).",
      });
      score -= 3;
    }

    // Check if phone is near the top
    const phoneInTop = topLines.match(PHONE_REGEX);
    if (!phoneInTop) {
      issues.push({
        check: "contact_data",
        severity: "info",
        message: "Phone number not found in the first 15 lines.",
        fix: "Place your phone number in the CV header alongside your name and email.",
      });
      score -= 2;
    }

    details.phone = actualPhone;
  }

  // ---- 4. LinkedIn ----
  const cvLinkedin = parsedCv.linkedin_url?.trim() ?? "";
  const linkedinInText = rawText.match(LINKEDIN_REGEX);

  if (!cvLinkedin && !linkedinInText) {
    issues.push({
      check: "contact_data",
      severity: "warning",
      message: "No LinkedIn profile URL found.",
      fix: "Add your LinkedIn profile URL (linkedin.com/in/your-name). Recruiters almost always check LinkedIn.",
    });
    score -= 8;
    details.hasLinkedin = false;
  } else {
    details.hasLinkedin = true;
    const actualLinkedin = cvLinkedin || linkedinInText?.[0] || "";

    // Basic validation
    if (actualLinkedin && !LINKEDIN_REGEX.test(actualLinkedin)) {
      issues.push({
        check: "contact_data",
        severity: "warning",
        message: "LinkedIn URL does not match the expected format (linkedin.com/in/...).",
        fix: "Use the format: linkedin.com/in/your-custom-url",
      });
      score -= 5;
    }

    details.linkedin = actualLinkedin;
  }

  // ---- 5. GitHub (optional, good for tech) ----
  const cvGithub = parsedCv.github_url?.trim() ?? "";
  const githubInText = rawText.match(GITHUB_REGEX);

  if (!cvGithub && !githubInText) {
    issues.push({
      check: "contact_data",
      severity: "info",
      message: "No GitHub profile found. For tech roles, a GitHub profile can strengthen your application.",
      fix: "Add your GitHub profile URL if you have public repositories or contributions.",
    });
    // No score penalty — truly optional
    details.hasGithub = false;
  } else {
    details.hasGithub = true;
  }

  // ---- 6. Portfolio / website (bonus) ----
  const cvPortfolio = parsedCv.portfolio_url?.trim() ?? "";
  const urlsInText = rawText.match(URL_REGEX) ?? [];
  const nonLinkedinGithubUrls = urlsInText.filter(
    (u) => !LINKEDIN_REGEX.test(u) && !GITHUB_REGEX.test(u),
  );

  if (cvPortfolio || nonLinkedinGithubUrls.length > 0) {
    details.hasPortfolio = true;
  } else {
    details.hasPortfolio = false;
  }

  // ---- 7. Location ----
  if (!parsedCv.location || parsedCv.location.trim().length === 0) {
    issues.push({
      check: "contact_data",
      severity: "info",
      message: "No location/city listed. Some employers filter by location.",
      fix: "Add your city and country (or 'Remote') to help with location-based filtering.",
    });
    score -= 2;
    details.hasLocation = false;
  } else {
    details.hasLocation = true;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    details,
  };
}
