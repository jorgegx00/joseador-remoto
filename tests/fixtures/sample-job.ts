import type { Job } from "@/types/job";
import type { ScrapedJob } from "../../sidecar/src/types.js";

export const sampleJob: Job = {
  id: "job-001",
  external_id: "ext-001",
  company_id: "company-001",
  company_name: "TechCorp",
  title: "Senior Full Stack Engineer",
  description: `
We are looking for a Senior Full Stack Engineer to join our growing team.

Requirements:
- 5+ years of experience with JavaScript and TypeScript
- Strong proficiency in React and Node.js
- Experience with cloud services (AWS preferred)
- Knowledge of PostgreSQL or similar relational databases
- Familiarity with Docker and Kubernetes
- Experience with CI/CD pipelines
- Strong problem-solving and communication skills
- Experience with GraphQL is a plus
- Knowledge of Redis caching strategies

Responsibilities:
- Design and implement scalable microservices
- Lead code reviews and mentor junior developers
- Collaborate with product teams to define technical requirements
- Maintain and improve existing systems
- Write automated tests and documentation
`,
  location: "Remote - LATAM",
  is_dr_friendly: true,
  dr_filter_reason: "LATAM/Caribbean region",
  dr_eligibility: "explicit_latam",
  source: "linkedin",
  source_url: "https://linkedin.com/jobs/123",
  apply_url: "https://linkedin.com/jobs/123/apply",
  salary_min: 80000,
  salary_max: 120000,
  salary_currency: "USD",
  employment_type: "full_time",
  seniority_level: "senior",
  skills_required: [
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "AWS",
    "PostgreSQL",
    "Docker",
    "Kubernetes",
    "GraphQL",
    "Redis",
  ],
  posted_at: Date.now() - 86400000,
  expires_at: null,
  scraped_at: Date.now(),
  created_at: Date.now(),
};

export const sampleScrapedJob: ScrapedJob = {
  external_id: "ext-scraped-001",
  title: "Senior Full Stack Engineer",
  company_name: "TechCorp",
  company_website: "https://techcorp.com",
  description:
    "We are looking for a Senior Full Stack Engineer. Requirements: JavaScript, TypeScript, React, Node.js, AWS, PostgreSQL.",
  location: "Remote - LATAM",
  source: "linkedin",
  source_url: "https://linkedin.com/jobs/456",
  apply_url: "https://linkedin.com/jobs/456/apply",
  salary_min: 80000,
  salary_max: 120000,
  salary_currency: "USD",
  employment_type: "full_time",
  seniority_level: "senior",
  skills_required: ["JavaScript", "TypeScript", "React", "Node.js", "AWS"],
  posted_at: Date.now() - 86400000,
  is_dr_friendly: true,
  dr_filter_reason: "LATAM/Caribbean region",
};
