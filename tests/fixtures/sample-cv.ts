import type { ParsedCv } from "@/types/cv";

export const sampleParsedCv: ParsedCv = {
  full_name: "Juan Perez",
  email: "juan.perez@email.com",
  phone: "+1-809-555-1234",
  location: "Santo Domingo, DR",
  linkedin_url: "linkedin.com/in/juanperez",
  github_url: "github.com/juanperez",
  portfolio_url: "juanperez.dev",
  summary:
    "Experienced software developer with 5 years of expertise in building scalable web applications using modern technologies. Proven track record of leading cross-functional teams and delivering high-quality products.",
  skills: {
    technical: [
      "JavaScript",
      "TypeScript",
      "React",
      "Node.js",
      "AWS",
      "Docker",
      "PostgreSQL",
      "Git",
      "GraphQL",
      "Redis",
    ],
    soft: ["Leadership", "Communication", "Problem Solving"],
  },
  experience: [
    {
      company: "ABC Tech",
      location: "Santo Domingo, DR",
      title: "Senior Software Engineer",
      start_date: "January 2021",
      end_date: null,
      description:
        "Lead development of microservices architecture serving 1M+ users. Manage a team of 5 engineers and coordinate with product stakeholders.",
      achievements: [
        "Reduced API response time by 40% through caching optimization",
        "Migrated monolith to microservices, improving deploy frequency by 3x",
        "Mentored 3 junior developers who were promoted within 18 months",
      ],
      technologies: ["Node.js", "TypeScript", "AWS", "Docker", "Redis"],
    },
    {
      company: "XYZ Solutions",
      location: "Santo Domingo, DR",
      title: "Software Engineer",
      start_date: "June 2018",
      end_date: "December 2020",
      description:
        "Developed and maintained full-stack web applications for enterprise clients.",
      achievements: [
        "Built real-time dashboard reducing manual reporting by 80%",
        "Implemented CI/CD pipeline cutting deployment time from 2 hours to 15 minutes",
      ],
      technologies: ["React", "Node.js", "PostgreSQL", "Docker"],
    },
    {
      company: "StartupCo",
      location: "Remote",
      title: "Junior Developer",
      start_date: "January 2016",
      end_date: "May 2018",
      description:
        "Contributed to frontend development of SaaS platform. Worked closely with designers to implement responsive UI components.",
      achievements: [
        "Developed reusable component library used across 3 products",
      ],
      technologies: ["JavaScript", "React", "CSS"],
    },
  ],
  education: [
    {
      institution: "INTEC",
      location: "Santo Domingo, DR",
      degree: "Bachelor",
      field: "Computer Science",
      start_date: "2012",
      end_date: "2016",
      honors: ["Magna Cum Laude"],
    },
  ],
  certifications: ["AWS Solutions Architect Associate"],
  projects: [
    {
      name: "Open Source CLI Tool",
      description:
        "Built a CLI tool for automating deployment workflows with 500+ GitHub stars.",
      achievements: ["500+ GitHub stars", "Used by 50+ companies"],
      technologies: ["TypeScript", "Node.js"],
      url: "github.com/juanperez/cli-tool",
    },
  ],
  languages: [
    { name: "Spanish", level: "native", certification: "" },
    { name: "English", level: "fluent", certification: "TOEFL 110" },
  ],
};

export const sampleRawCvText = `Juan Perez
juan.perez@email.com | +1-809-555-1234
linkedin.com/in/juanperez | github.com/juanperez

Summary
Experienced software developer with 5 years of expertise in building scalable web applications using modern technologies. Proven track record of leading cross-functional teams and delivering high-quality products.

Experience

ABC Tech, Santo Domingo, DR
Senior Software Engineer | January 2021 - Present
- Lead development of microservices architecture serving 1M+ users
- Manage a team of 5 engineers and coordinate with product stakeholders
- Reduced API response time by 40% through caching optimization
- Migrated monolith to microservices, improving deploy frequency by 3x
- Mentored 3 junior developers who were promoted within 18 months
Technologies: Node.js, TypeScript, AWS, Docker, Redis

XYZ Solutions, Santo Domingo, DR
Software Engineer | June 2018 - December 2020
- Developed and maintained full-stack web applications for enterprise clients
- Built real-time dashboard reducing manual reporting by 80%
- Implemented CI/CD pipeline cutting deployment time from 2 hours to 15 minutes
Technologies: React, Node.js, PostgreSQL, Docker

StartupCo, Remote
Junior Developer | January 2016 - May 2018
- Contributed to frontend development of SaaS platform
- Developed reusable component library used across 3 products
Technologies: JavaScript, React, CSS

Education

INTEC, Santo Domingo, DR
Bachelor in Computer Science | 2012 - 2016
Magna Cum Laude

Skills
JavaScript, TypeScript, React, Node.js, AWS, Docker, PostgreSQL, Git, GraphQL, Redis
Leadership, Communication, Problem Solving

Certifications
AWS Solutions Architect Associate

Projects
Open Source CLI Tool - github.com/juanperez/cli-tool
Built a CLI tool for automating deployment workflows with 500+ GitHub stars

Languages
Spanish (Native), English (Fluent - TOEFL 110)
`;

export const minimalParsedCv: ParsedCv = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  linkedin_url: "",
  github_url: "",
  portfolio_url: "",
  summary: "",
  skills: { technical: [], soft: [] },
  experience: [],
  education: [],
  certifications: [],
  projects: [],
  languages: [],
};
