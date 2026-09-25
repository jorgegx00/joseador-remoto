/**
 * Smoke test — run with: npx tsx src/lib/ats/__test__smoke.ts
 *
 * Verifies the ATS engine produces realistic, non-zero scores.
 */

import type { ParsedCv } from "@/types/cv";
import type { Job } from "@/types/job";
import { runAtsSimulation } from "./simulator";

// ---- Sample CV ----
const sampleCv: ParsedCv = {
  full_name: "Maria Garcia",
  email: "maria.garcia@gmail.com",
  phone: "+1 555-123-4567",
  location: "Santo Domingo, Dominican Republic",
  linkedin_url: "https://linkedin.com/in/mariagarcia",
  github_url: "https://github.com/mariagarcia",
  portfolio_url: "",
  summary:
    "Senior Full-Stack Developer with 6+ years of experience building scalable web applications using React, Node.js, and PostgreSQL. Passionate about clean code, mentoring junior developers, and delivering high-quality software on time.",
  skills: {
    technical: [
      "JavaScript", "TypeScript", "React", "Node.js", "PostgreSQL",
      "Docker", "AWS", "GraphQL", "Redis", "Git",
    ],
    soft: ["Leadership", "Communication", "Problem-solving", "Teamwork"],
  },
  experience: [
    {
      company: "TechCorp Inc.",
      location: "Remote",
      title: "Senior Full-Stack Developer",
      start_date: "January 2021",
      end_date: null,
      description:
        "Lead a team of 5 developers building a SaaS platform for HR management. Architect microservices using Node.js and PostgreSQL. Implement CI/CD pipelines with GitHub Actions and Docker.",
      achievements: [
        "Reduced API response time by 40% through query optimization and Redis caching",
        "Led migration from monolith to microservices architecture serving 50K+ users",
        "Mentored 3 junior developers who were promoted within 12 months",
      ],
      technologies: ["React", "Node.js", "PostgreSQL", "Docker", "AWS", "Redis"],
    },
    {
      company: "WebDev Agency",
      location: "Santo Domingo, DR",
      title: "Full-Stack Developer",
      start_date: "March 2018",
      end_date: "December 2020",
      description:
        "Developed responsive web applications for 15+ clients using React and Express. Collaborated with designers and product managers to deliver projects on schedule.",
      achievements: [
        "Built an e-commerce platform handling $2M+ in annual transactions",
        "Implemented automated testing reducing bug reports by 60%",
      ],
      technologies: ["React", "Express", "MongoDB", "AWS S3", "Jest"],
    },
  ],
  education: [
    {
      institution: "Universidad Autonoma de Santo Domingo",
      location: "Santo Domingo, DR",
      degree: "Bachelor of Science",
      field: "Computer Science",
      start_date: "2014",
      end_date: "2018",
      honors: ["Magna Cum Laude"],
    },
  ],
  certifications: ["AWS Certified Solutions Architect - Associate"],
  projects: [
    {
      name: "Open Source Task Manager",
      description: "A Kanban-style task manager built with React and Node.js",
      achievements: ["500+ GitHub stars", "Featured in JavaScript Weekly"],
      technologies: ["React", "Node.js", "PostgreSQL"],
      url: "https://github.com/mariagarcia/taskmanager",
    },
  ],
  languages: [
    { name: "Spanish", level: "native", certification: "" },
    { name: "English", level: "fluent", certification: "TOEFL 105" },
  ],
};

const sampleRawText = `MARIA GARCIA
maria.garcia@gmail.com | +1 555-123-4567 | Santo Domingo, Dominican Republic
LinkedIn: linkedin.com/in/mariagarcia | GitHub: github.com/mariagarcia

SUMMARY
Senior Full-Stack Developer with 6+ years of experience building scalable web applications using React, Node.js, and PostgreSQL. Passionate about clean code, mentoring junior developers, and delivering high-quality software on time.

EXPERIENCE

Senior Full-Stack Developer
TechCorp Inc. | Remote | January 2021 - Present
- Lead a team of 5 developers building a SaaS platform for HR management
- Architect microservices using Node.js and PostgreSQL
- Implement CI/CD pipelines with GitHub Actions and Docker
- Reduced API response time by 40% through query optimization and Redis caching
- Led migration from monolith to microservices architecture serving 50K+ users
- Mentored 3 junior developers who were promoted within 12 months

Full-Stack Developer
WebDev Agency | Santo Domingo, DR | March 2018 - December 2020
- Developed responsive web applications for 15+ clients using React and Express
- Collaborated with designers and product managers to deliver projects on schedule
- Built an e-commerce platform handling $2M+ in annual transactions
- Implemented automated testing reducing bug reports by 60%

EDUCATION

Bachelor of Science in Computer Science
Universidad Autonoma de Santo Domingo | 2014 - 2018
- Magna Cum Laude

SKILLS
Technical: JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS, GraphQL, Redis, Git
Soft Skills: Leadership, Communication, Problem-solving, Teamwork

CERTIFICATIONS
- AWS Certified Solutions Architect - Associate

PROJECTS
- Open Source Task Manager: A Kanban-style task manager built with React and Node.js (500+ GitHub stars)

LANGUAGES
- Spanish (Native)
- English (Fluent, TOEFL 105)
`;

// ---- Sample Job ----
const sampleJob: Job = {
  id: "job-001",
  external_id: "ext-001",
  company_id: "comp-001",
  company_name: "TechCorp",
  title: "Senior Full-Stack Developer",
  description: `We are looking for a Senior Full-Stack Developer to join our engineering team.

Requirements:
- 5+ years of experience with JavaScript/TypeScript
- Strong experience with React and Node.js
- Experience with PostgreSQL or similar relational databases
- Experience with Docker and containerization
- Familiarity with AWS (EC2, S3, Lambda, RDS)
- Experience with CI/CD pipelines (GitHub Actions, Jenkins)
- Knowledge of GraphQL is a plus
- Experience with Redis or similar caching solutions
- Strong problem-solving and communication skills
- Experience leading or mentoring developers

Nice to have:
- Experience with microservices architecture
- Kubernetes experience
- Experience with Agile/Scrum methodologies
`,
  location: "Remote",
  is_dr_friendly: true,
  dr_filter_reason: "",
  dr_eligibility: "global_remote",
  source: "google_jobs",
  source_url: "https://example.com/job/001",
  apply_url: "https://example.com/apply/001",
  salary_min: 80000,
  salary_max: 120000,
  salary_currency: "USD",
  employment_type: "full_time",
  seniority_level: "senior",
  skills_required: ["JavaScript", "TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS"],
  posted_at: Date.now() - 86400000,
  expires_at: null,
  scraped_at: Date.now(),
  created_at: Date.now(),
  needs_recovery: false,
  raw_payload: null,
};

// ---- Run tests ----
console.log("=== ATS Engine Smoke Test ===\n");

// Test 1: With job description
console.log("--- Test 1: Full analysis with job ---");
const report1 = runAtsSimulation(sampleCv, sampleRawText, sampleJob);
console.log(`Overall ATS Score: ${report1.ats_score}`);
console.log(`  Keyword Score:     ${report1.keyword_score}`);
console.log(`  Format Score:      ${report1.format_score}`);
console.log(`  Structure Score:   ${report1.structure_score}`);
console.log(`  Contact Score:     ${report1.contact_score}`);
console.log(`  Consistency Score: ${report1.consistency_score}`);
console.log(`  Spelling Score:    ${report1.spelling_score}`);
console.log(`  Length Score:      ${report1.length_score}`);
console.log(`\nKeyword Matches: ${report1.keyword_matches.matched.length} matched, ${report1.keyword_matches.missing.length} missing, ${report1.keyword_matches.partial.length} partial`);
console.log(`Issues: ${report1.issues.length} total`);
for (const issue of report1.issues.slice(0, 5)) {
  console.log(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
}
console.log(`\nChecks: ${report1.checks.length}`);

// Test 2: Without job description
console.log("\n--- Test 2: Analysis without job ---");
const report2 = runAtsSimulation(sampleCv, sampleRawText);
console.log(`Overall ATS Score: ${report2.ats_score}`);
console.log(`  Keyword Score:     ${report2.keyword_score}`);

// Assertions
const allScoresPositive = [
  report1.ats_score, report1.keyword_score, report1.format_score,
  report1.structure_score, report1.contact_score, report1.consistency_score,
  report1.spelling_score, report1.length_score,
].every((s) => s > 0);

const scoresRealistic = report1.ats_score >= 50 && report1.ats_score <= 100;
const hasChecks = report1.checks.length === 7;

console.log("\n=== Assertions ===");
console.log(`All scores positive: ${allScoresPositive ? "PASS" : "FAIL"}`);
console.log(`Overall score realistic (50-100): ${scoresRealistic ? "PASS" : "FAIL"}`);
console.log(`Has 7 checks: ${hasChecks ? "PASS" : "FAIL"}`);
console.log(`Has keyword matches: ${report1.keyword_matches.matched.length > 0 ? "PASS" : "FAIL"}`);

if (!allScoresPositive || !scoresRealistic || !hasChecks) {
  console.error("\nSMOKE TEST FAILED");
  throw new Error("ATS smoke test failed");
} else {
  console.log("\nSMOKE TEST PASSED");
}
