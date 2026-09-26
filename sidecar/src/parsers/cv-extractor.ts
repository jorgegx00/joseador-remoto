/**
 * Heuristic CV/Resume data extractor.
 * Extracts structured information from raw text of a CV/resume.
 * Supports both English and Spanish CVs.
 */

import type { CvLine, ParsedCvResult } from "../types.js";

// ─── SECTION HEADER DEFINITIONS ───────────────────────────────────────────────

type SectionCategory =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "certifications"
  | "projects"
  | "languages"
  | "contact";

const SECTION_HEADERS: ReadonlyMap<string, SectionCategory> = new Map([
  // English — Summary / Profile
  ["summary", "summary"],
  ["profile", "summary"],
  ["about", "summary"],
  ["about me", "summary"],
  ["objective", "summary"],
  ["professional summary", "summary"],
  ["career summary", "summary"],
  ["professional profile", "summary"],
  ["career objective", "summary"],
  ["executive summary", "summary"],
  ["personal statement", "summary"],
  // Spanish — Resumen / Perfil
  ["resumen", "summary"],
  ["perfil", "summary"],
  ["acerca de", "summary"],
  ["acerca de mi", "summary"],
  ["acerca de mí", "summary"],
  ["objetivo", "summary"],
  ["resumen profesional", "summary"],
  ["perfil profesional", "summary"],
  ["objetivo profesional", "summary"],

  // English — Experience
  ["experience", "experience"],
  ["work experience", "experience"],
  ["professional experience", "experience"],
  ["employment", "experience"],
  ["employment history", "experience"],
  ["work history", "experience"],
  ["career history", "experience"],
  ["relevant experience", "experience"],
  // Spanish — Experiencia
  ["experiencia", "experience"],
  ["experiencia laboral", "experience"],
  ["experiencia profesional", "experience"],
  ["historial laboral", "experience"],
  ["empleo", "experience"],
  ["trayectoria profesional", "experience"],

  // English — Education
  ["education", "education"],
  ["academic", "education"],
  ["academic background", "education"],
  ["academic history", "education"],
  ["qualifications", "education"],
  // Spanish — Educacion
  ["educación", "education"],
  ["educacion", "education"],
  ["formación académica", "education"],
  ["formacion academica", "education"],
  ["formación", "education"],
  ["formacion", "education"],
  ["estudios", "education"],

  // English — Skills
  ["skills", "skills"],
  ["technical skills", "skills"],
  ["core competencies", "skills"],
  ["competencies", "skills"],
  ["key skills", "skills"],
  ["areas of expertise", "skills"],
  ["technologies", "skills"],
  ["tech stack", "skills"],
  ["tools & technologies", "skills"],
  ["tools and technologies", "skills"],
  ["programming languages", "skills"],
  // Spanish — Habilidades
  ["habilidades", "skills"],
  ["habilidades técnicas", "skills"],
  ["habilidades tecnicas", "skills"],
  ["competencias", "skills"],
  ["aptitudes", "skills"],
  ["conocimientos", "skills"],
  ["tecnologías", "skills"],
  ["tecnologias", "skills"],
  ["herramientas", "skills"],

  // English — Certifications
  ["certifications", "certifications"],
  ["certificates", "certifications"],
  ["licenses", "certifications"],
  ["licenses & certifications", "certifications"],
  ["professional certifications", "certifications"],
  // Spanish — Certificaciones
  ["certificaciones", "certifications"],
  ["certificados", "certifications"],
  ["licencias", "certifications"],
  ["licencias y certificaciones", "certifications"],

  // English — Projects
  ["projects", "projects"],
  ["personal projects", "projects"],
  ["side projects", "projects"],
  ["portfolio", "projects"],
  ["selected projects", "projects"],
  ["key projects", "projects"],
  ["open source", "projects"],
  // Spanish — Proyectos
  ["proyectos", "projects"],
  ["proyectos personales", "projects"],
  ["portafolio", "projects"],

  // English — Languages
  ["languages", "languages"],
  ["language skills", "languages"],
  // Spanish — Idiomas
  ["idiomas", "languages"],

  // English — Contact
  ["contact", "contact"],
  ["contact information", "contact"],
  ["contact info", "contact"],
  ["personal information", "contact"],
  ["personal info", "contact"],
  // Spanish — Contacto
  ["contacto", "contact"],
  ["información de contacto", "contact"],
  ["informacion de contacto", "contact"],
  ["datos personales", "contact"],
  ["datos de contacto", "contact"],
]);

// ─── KNOWN TECH TERMS ─────────────────────────────────────────────────────────

const TECH_TERMS: ReadonlySet<string> = new Set([
  // Programming Languages
  "javascript", "typescript", "python", "java", "c#", "c++", "c",
  "go", "golang", "rust", "ruby", "php", "swift", "kotlin", "dart",
  "scala", "r", "matlab", "perl", "haskell", "elixir", "erlang",
  "clojure", "f#", "objective-c", "assembly", "lua", "groovy",
  "visual basic", "vb.net", "cobol", "fortran", "lisp", "scheme",
  "prolog", "shell", "bash", "powershell", "sql", "plsql", "pl/sql",
  "t-sql", "nosql", "html", "css", "sass", "scss", "less",
  "xml", "json", "yaml", "toml", "markdown", "latex",
  "solidity", "move", "zig", "nim", "julia", "crystal",
  "coffeescript", "actionscript", "delphi", "pascal",

  // Frontend Frameworks & Libraries
  "react", "reactjs", "react.js", "react native",
  "angular", "angularjs", "angular.js",
  "vue", "vuejs", "vue.js", "vue 3", "vue 2",
  "svelte", "sveltekit",
  "next.js", "nextjs", "next",
  "nuxt", "nuxtjs", "nuxt.js",
  "remix", "gatsby", "astro",
  "jquery", "backbone.js", "ember.js", "ember",
  "lit", "alpine.js", "alpinejs", "htmx",
  "preact", "solid.js", "solidjs", "qwik",
  "tailwind", "tailwindcss", "tailwind css",
  "bootstrap", "material ui", "mui", "chakra ui",
  "ant design", "antd", "styled-components",
  "emotion", "bulma", "foundation",
  "storybook", "shadcn", "radix",
  "webpack", "vite", "rollup", "parcel", "esbuild",
  "babel", "swc", "turbopack",
  "pnpm", "npm", "yarn", "bun",
  "redux", "zustand", "mobx", "recoil", "jotai",
  "react query", "tanstack query", "swr",
  "react hook form", "formik",
  "react router", "wouter",
  "three.js", "d3.js", "d3", "chart.js",
  "framer motion", "gsap", "lottie",
  "pwa", "web components", "service worker",

  // Backend Frameworks
  "node.js", "nodejs", "node",
  "express", "express.js", "expressjs",
  "fastify", "koa", "hapi", "nestjs", "nest.js",
  "django", "flask", "fastapi",
  "spring", "spring boot", "spring framework",
  ".net", "asp.net", "asp.net core",
  "rails", "ruby on rails", "sinatra",
  "laravel", "symfony", "codeigniter",
  "gin", "echo", "fiber",
  "actix", "rocket", "warp", "axum",
  "phoenix", "ecto",
  "deno", "bun",
  "graphql", "rest", "restful", "rest api", "rest apis",
  "grpc", "websocket", "websockets", "socket.io",
  "oauth", "oauth2", "jwt", "openid",
  "swagger", "openapi",
  "microservices", "serverless",
  "api gateway",

  // Databases
  "postgresql", "postgres",
  "mysql", "mariadb",
  "mongodb", "mongo",
  "redis", "memcached",
  "sqlite", "sqlite3",
  "dynamodb", "cassandra", "couchdb",
  "firebase", "firestore", "realtime database",
  "elasticsearch", "elastic", "opensearch",
  "neo4j", "arangodb", "orientdb",
  "cockroachdb", "tidb", "vitess",
  "supabase", "planetscale", "neon",
  "prisma", "drizzle", "typeorm", "sequelize",
  "mongoose", "knex", "objection.js",
  "sqlalchemy", "hibernate",
  "oracle", "oracle db", "sql server",
  "mssql", "db2", "informix",

  // Cloud & DevOps
  "aws", "amazon web services",
  "azure", "microsoft azure",
  "gcp", "google cloud", "google cloud platform",
  "docker", "kubernetes", "k8s",
  "terraform", "ansible", "puppet", "chef",
  "vagrant", "packer",
  "aws lambda", "lambda",
  "s3", "ec2", "ecs", "eks", "fargate",
  "cloudformation", "cdk", "sam",
  "azure devops", "azure functions",
  "google cloud functions", "cloud run",
  "heroku", "vercel", "netlify", "railway",
  "digitalocean", "linode", "vultr",
  "cloudflare", "cloudflare workers",
  "nginx", "apache", "caddy", "traefik",
  "load balancer", "reverse proxy",
  "ci/cd", "continuous integration", "continuous delivery",
  "jenkins", "circleci", "circle ci",
  "github actions", "gitlab ci", "gitlab ci/cd",
  "travis ci", "travisci",
  "argocd", "argo cd", "flux",
  "helm", "kustomize", "istio", "linkerd",
  "prometheus", "grafana", "datadog",
  "new relic", "splunk", "elk", "elk stack",
  "logstash", "kibana", "fluentd",
  "sentry", "bugsnag", "raygun",
  "pulumi", "crossplane",

  // Version Control
  "git", "github", "gitlab", "bitbucket",
  "svn", "subversion", "mercurial",
  "git flow", "trunk-based development",

  // Testing
  "tdd", "bdd", "ddd",
  "jest", "mocha", "chai", "jasmine",
  "cypress", "playwright", "selenium",
  "puppeteer", "webdriver",
  "pytest", "unittest", "nose",
  "junit", "testng", "mockito",
  "rspec", "minitest",
  "vitest", "testing library",
  "react testing library", "enzyme",
  "supertest", "nock", "msw",
  "k6", "jmeter", "gatling", "locust",
  "postman", "insomnia",
  "storybook", "chromatic",
  "codecov", "coveralls", "sonarqube",
  "eslint", "prettier", "stylelint",
  "husky", "lint-staged",

  // Mobile
  "ios", "android",
  "react native", "flutter",
  "xamarin", "maui", ".net maui",
  "ionic", "cordova", "capacitor",
  "swiftui", "uikit", "jetpack compose",
  "kotlin multiplatform", "kmp",
  "expo", "eas",

  // Design & UI
  "figma", "sketch", "adobe xd",
  "photoshop", "illustrator", "indesign",
  "invision", "zeplin", "abstract",
  "wireframing", "prototyping",
  "responsive design", "mobile-first",
  "accessibility", "a11y", "wcag",
  "ux", "ui", "ux design", "ui design",
  "user research", "usability testing",

  // Data & ML & AI
  "machine learning", "deep learning",
  "artificial intelligence", "ai", "ml",
  "tensorflow", "pytorch", "keras",
  "scikit-learn", "sklearn",
  "pandas", "numpy", "scipy",
  "opencv", "nlp", "natural language processing",
  "computer vision", "cv",
  "llm", "large language model",
  "gpt", "openai", "chatgpt",
  "langchain", "llamaindex",
  "hugging face", "transformers",
  "data science", "data engineering",
  "data analysis", "data visualization",
  "tableau", "power bi", "looker",
  "apache spark", "spark", "hadoop",
  "kafka", "apache kafka", "rabbitmq",
  "airflow", "apache airflow", "luigi",
  "dbt", "snowflake", "bigquery", "redshift",
  "etl", "elt", "data pipeline",
  "mlops", "mlflow", "kubeflow",

  // Security
  "cybersecurity", "information security",
  "penetration testing", "pentest",
  "owasp", "security audit",
  "encryption", "ssl", "tls", "https",
  "firewall", "vpn", "ids", "ips",
  "siem", "soc",
  "vulnerability assessment",
  "compliance", "gdpr", "hipaa", "pci dss",
  "iam", "rbac", "zero trust",

  // Architecture & Patterns
  "microservices", "monolith",
  "event-driven", "cqrs", "event sourcing",
  "domain-driven design", "ddd",
  "clean architecture", "hexagonal architecture",
  "solid", "design patterns",
  "pub/sub", "message queue", "message broker",
  "api design", "system design",

  // Operating Systems & Tools
  "linux", "ubuntu", "debian", "centos",
  "fedora", "red hat", "rhel",
  "macos", "windows", "wsl",
  "vim", "neovim", "emacs",
  "vs code", "vscode", "visual studio code",
  "intellij", "webstorm", "pycharm",
  "eclipse", "netbeans", "xcode",
  "android studio",
  "terminal", "command line", "cli",

  // Project Management & Methodology
  "scrum", "agile", "kanban",
  "jira", "confluence", "notion",
  "trello", "asana", "monday.com",
  "slack", "teams", "discord",
  "lean", "six sigma", "waterfall",
  "safe", "scaled agile",

  // Blockchain & Web3
  "blockchain", "ethereum", "solana",
  "web3", "smart contracts", "defi",
  "nft", "dao", "ipfs",
  "hardhat", "truffle", "foundry",
  "metamask", "ethers.js", "web3.js",

  // IoT & Embedded
  "iot", "internet of things",
  "raspberry pi", "arduino",
  "embedded systems", "rtos",
  "mqtt", "zigbee", "bluetooth",

  // Other Tech
  "regex", "regular expressions",
  "webscraping", "web scraping",
  "automation", "rpa",
  "saas", "paas", "iaas",
  "cdn", "dns", "tcp/ip", "http",
  "oauth2", "saml", "sso",
  "caching", "rate limiting",
  "load testing", "stress testing",
  "performance optimization",
  "seo", "analytics", "google analytics",
  "a/b testing", "feature flags",
  "internationalization", "i18n",
  "localization", "l10n",

  // Desktop
  "electron", "tauri",
  "qt", "gtk", "wxwidgets",
  "wpf", "winforms",
]);

// ─── REGEX PATTERNS ───────────────────────────────────────────────────────────

const EMAIL_REGEX = /[\w.+\-]+@[\w\-]+\.[\w.\-]+/g;

const PHONE_REGEX =
  /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g;

const LINKEDIN_REGEX =
  /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-%.]+\/?/gi;

const GITHUB_REGEX =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-%.]+\/?/gi;

const URL_REGEX =
  /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;

// Date range patterns — supports multiple formats
// "Month Year - Month Year", "Month Year - Present", "Year - Year", "MM/YYYY - MM/YYYY"
const MONTH_EN = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const MONTH_ES = "(?:Ene(?:ro)?|Feb(?:rero)?|Mar(?:zo)?|Abr(?:il)?|May(?:o)?|Jun(?:io)?|Jul(?:io)?|Ago(?:sto)?|Sep(?:t(?:iembre)?)?|Oct(?:ubre)?|Nov(?:iembre)?|Dic(?:iembre)?)";
const MONTH_ANY = `(?:${MONTH_EN}|${MONTH_ES})`;

// Pattern: "Jan 2020 - Dec 2023", "January 2020 - Present", "Enero 2020 - Presente"
const DATE_RANGE_MONTH_YEAR = new RegExp(
  `(${MONTH_ANY}\\.?\\s*\\d{4})\\s*[-–—]\\s*(${MONTH_ANY}\\.?\\s*\\d{4}|[Pp]resent(?:e)?|[Aa]ctual(?:mente)?|[Cc]urrent(?:ly)?)`,
  "i"
);

// Pattern: "2020 - 2023", "2020 - Present"
const DATE_RANGE_YEAR_ONLY = /(\d{4})\s*[-–—]\s*(\d{4}|[Pp]resent(?:e)?|[Aa]ctual(?:mente)?|[Cc]urrent(?:ly)?)/;

// Pattern: "01/2020 - 06/2023", "01-2020 - 06-2023"
const DATE_RANGE_NUMERIC = /(\d{1,2}[/\-]\d{4})\s*[-–—]\s*(\d{1,2}[/\-]\d{4}|[Pp]resent(?:e)?|[Aa]ctual(?:mente)?|[Cc]urrent(?:ly)?)/;

// ─── ROLE KEYWORDS ────────────────────────────────────────────────────────────

const ROLE_KEYWORDS: readonly string[] = [
  // English
  "developer", "engineer", "architect", "designer", "analyst",
  "manager", "director", "lead", "head", "chief", "vp",
  "coordinator", "administrator", "specialist", "consultant",
  "intern", "trainee", "associate", "senior", "junior", "staff",
  "principal", "fellow", "founder", "co-founder", "ceo", "cto", "coo", "cfo",
  "devops", "sre", "qa", "tester", "scrum master", "product owner",
  "full-stack", "fullstack", "full stack",
  "front-end", "frontend", "front end",
  "back-end", "backend", "back end",
  "data scientist", "data engineer", "data analyst",
  "machine learning", "ml engineer", "ai engineer",
  "mobile developer", "ios developer", "android developer",
  "ui/ux", "ux designer", "ui designer",
  "technical writer", "tech lead", "team lead",
  "software", "web", "cloud", "systems",
  "professor", "teacher", "instructor", "tutor",
  "researcher", "scientist",
  // Spanish
  "desarrollador", "desarrolladora", "ingeniero", "ingeniera",
  "arquitecto", "arquitecta", "diseñador", "diseñadora",
  "analista", "gerente", "director", "directora",
  "líder", "lider", "jefe", "jefa",
  "coordinador", "coordinadora", "administrador", "administradora",
  "especialista", "consultor", "consultora",
  "pasante", "practicante", "becario", "becaria",
  "investigador", "investigadora", "científico", "científica",
  "profesor", "profesora", "maestro", "maestra",
];

// ─── DEGREE KEYWORDS ──────────────────────────────────────────────────────────

const DEGREE_KEYWORDS: readonly string[] = [
  // English
  "bachelor", "bachelors", "bachelor's",
  "master", "masters", "master's",
  "phd", "ph.d", "ph.d.", "doctorate", "doctoral",
  "associate", "associate's",
  "mba", "m.b.a.",
  "bsc", "b.sc", "b.sc.", "bs", "b.s.", "b.s",
  "msc", "m.sc", "m.sc.", "ms", "m.s.", "m.s",
  "ba", "b.a.", "b.a",
  "ma", "m.a.", "m.a",
  "beng", "b.eng", "b.eng.", "meng", "m.eng", "m.eng.",
  "diploma", "certificate", "certification",
  "degree",
  // Spanish
  "licenciatura", "licenciado", "licenciada",
  "maestría", "maestria",
  "doctorado",
  "ingeniería", "ingenieria",
  "técnico", "tecnico", "técnica", "tecnica",
  "diplomado", "certificado",
  "grado", "título", "titulo",
  "postgrado", "posgrado",
  "especialización", "especializacion",
];

// ─── CERTIFICATION KEYWORDS ──────────────────────────────────────────────────

const CERT_KEYWORDS: readonly string[] = [
  "aws certified", "aws certification",
  "azure certified", "azure certification",
  "google certified", "google cloud certified",
  "cisco certified", "ccna", "ccnp", "ccie",
  "comptia", "a+", "network+", "security+",
  "pmp", "project management professional",
  "scrum master", "csm", "psm",
  "cissp", "cism", "cisa",
  "itil", "prince2",
  "oracle certified",
  "salesforce certified",
  "microsoft certified",
  "certified kubernetes", "cka", "ckad",
  "certified ethical hacker", "ceh",
  "togaf",
  "six sigma",
  "safe agilist",
  "istqb",
  "terraform associate",
  "hashicorp certified",
  "red hat certified",
  "rhce", "rhcsa",
  "certified scrum", "certified agile",
  "google analytics",
  "hubspot",
  "meta certified",
  "facebook certified",
  "certificación", "certificacion",
  "certificado",
];

// ─── LANGUAGE PROFICIENCY MAPPING ─────────────────────────────────────────────

type LanguageLevel = "native" | "fluent" | "advanced" | "intermediate" | "basic";

const PROFICIENCY_MAP: ReadonlyMap<string, LanguageLevel> = new Map([
  // English levels
  ["native", "native"],
  ["mother tongue", "native"],
  ["first language", "native"],
  ["fluent", "fluent"],
  ["proficient", "fluent"],
  ["full professional", "fluent"],
  ["advanced", "advanced"],
  ["professional working", "advanced"],
  ["upper intermediate", "advanced"],
  ["c2", "native"],
  ["c1", "fluent"],
  ["b2", "advanced"],
  ["b1", "intermediate"],
  ["a2", "basic"],
  ["a1", "basic"],
  ["intermediate", "intermediate"],
  ["limited working", "intermediate"],
  ["conversational", "intermediate"],
  ["basic", "basic"],
  ["beginner", "basic"],
  ["elementary", "basic"],

  // Spanish levels
  ["nativo", "native"],
  ["nativa", "native"],
  ["lengua materna", "native"],
  ["idioma materno", "native"],
  ["fluido", "fluent"],
  ["competente", "fluent"],
  ["avanzado", "advanced"],
  ["avanzada", "advanced"],
  ["intermedio", "intermediate"],
  ["intermedia", "intermediate"],
  ["básico", "basic"],
  ["basico", "basic"],
  ["básica", "basic"],
  ["basica", "basic"],
  ["principiante", "basic"],
  ["elemental", "basic"],
]);

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isSectionHeader(line: string): SectionCategory | null {
  // Remove leading/trailing whitespace
  let cleaned = line.trim();

  // Remove common markers: bullets, dashes, colons, asterisks, numbers
  cleaned = cleaned.replace(/^[•\-*·#=]+\s*/, "");
  cleaned = cleaned.replace(/\s*[:：]\s*$/, "");
  cleaned = cleaned.replace(/\s*[-–—]+\s*$/, "");
  cleaned = cleaned.replace(/^\d+\.\s*/, "");

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const lower = cleaned.toLowerCase();

  // Direct lookup
  const directMatch = SECTION_HEADERS.get(lower);
  if (directMatch) {
    return directMatch;
  }

  // Check if line is too long to be a header (headers are usually short)
  if (cleaned.length > 60) {
    return null;
  }

  // Check if the line is all caps or title case and matches a known header
  // when ignoring case
  for (const [header, category] of SECTION_HEADERS.entries()) {
    if (lower === header) {
      return category;
    }
  }

  return null;
}

function extractDateRange(text: string): { start: string; end: string | null } | null {
  // Try month-year pattern first (most specific)
  const monthYearMatch = DATE_RANGE_MONTH_YEAR.exec(text);
  if (monthYearMatch) {
    const endRaw = monthYearMatch[2].trim();
    const isPresent = /^(present|presente|actual|actualmente|current|currently)$/i.test(endRaw);
    return {
      start: monthYearMatch[1].trim(),
      end: isPresent ? null : endRaw,
    };
  }

  // Try numeric pattern (01/2020 - 06/2023)
  const numericMatch = DATE_RANGE_NUMERIC.exec(text);
  if (numericMatch) {
    const endRaw = numericMatch[2].trim();
    const isPresent = /^(present|presente|actual|actualmente|current|currently)$/i.test(endRaw);
    return {
      start: numericMatch[1].trim(),
      end: isPresent ? null : endRaw,
    };
  }

  // Try year-only pattern (2020 - 2023)
  const yearMatch = DATE_RANGE_YEAR_ONLY.exec(text);
  if (yearMatch) {
    const endRaw = yearMatch[2].trim();
    const isPresent = /^(present|presente|actual|actualmente|current|currently)$/i.test(endRaw);
    return {
      start: yearMatch[1].trim(),
      end: isPresent ? null : endRaw,
    };
  }

  return null;
}

function hasDateRange(text: string): boolean {
  return extractDateRange(text) !== null;
}

function containsRoleKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return ROLE_KEYWORDS.some((keyword) => {
    // Word boundary check: the keyword must not be part of a larger word
    const idx = lower.indexOf(keyword);
    if (idx === -1) return false;
    const before = idx > 0 ? lower[idx - 1] : " ";
    const after = idx + keyword.length < lower.length ? lower[idx + keyword.length] : " ";
    return /[\s,./\-(]/.test(before) || idx === 0
      ? /[\s,./\-)]/.test(after) || idx + keyword.length === lower.length
      : false;
  });
}

function containsDegreeKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return DEGREE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function isBulletLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[•\-*·▪▸►➤✓✔→➜◆◇○●■□▶»›]\s/.test(trimmed)
    || /^\d+[.)]\s/.test(trimmed);
}

function isNameCandidate(line: string): boolean {
  const trimmed = line.trim();

  // Skip if empty or very long
  if (!trimmed || trimmed.length > 50 || trimmed.length < 3) {
    return false;
  }

  // Skip if it looks like a URL, email, or phone
  if (EMAIL_REGEX.test(trimmed) || PHONE_REGEX.test(trimmed) || URL_REGEX.test(trimmed)) {
    // Reset regex lastIndex
    EMAIL_REGEX.lastIndex = 0;
    PHONE_REGEX.lastIndex = 0;
    URL_REGEX.lastIndex = 0;
    return false;
  }

  // Reset regex lastIndex for global regexes
  EMAIL_REGEX.lastIndex = 0;
  PHONE_REGEX.lastIndex = 0;
  URL_REGEX.lastIndex = 0;

  // Skip if it's a section header
  if (isSectionHeader(trimmed)) {
    return false;
  }

  // Name heuristic: 2-4 words, mostly alphabetic, possibly with accented chars
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 5) {
    return false;
  }

  // Each word should start with an uppercase letter (title case) or be all uppercase
  const allAlpha = words.every((w) => /^[A-ZÀ-ÖØ-Ýa-zà-öø-ÿ'.]+$/.test(w));
  if (!allAlpha) {
    return false;
  }

  // At least one word should start with uppercase
  const hasUpperStart = words.some((w) => /^[A-ZÀ-ÖØ-Ý]/.test(w));
  return hasUpperStart;
}

function splitIntoSections(
  text: string
): { header: SectionCategory | null; title: string; content: string }[] {
  const lines = normalizeWhitespace(text).split("\n");
  const sections: { header: SectionCategory | null; title: string; content: string }[] = [];

  let currentHeader: SectionCategory | null = null;
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const category = isSectionHeader(line);
    if (category !== null) {
      // Save previous section
      if (currentLines.length > 0 || currentHeader !== null) {
        sections.push({
          header: currentHeader,
          title: currentTitle,
          content: currentLines.join("\n").trim(),
        });
      }
      currentHeader = category;
      currentTitle = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Save final section
  if (currentLines.length > 0 || currentHeader !== null) {
    sections.push({
      header: currentHeader,
      title: currentTitle,
      content: currentLines.join("\n").trim(),
    });
  }

  return sections;
}

// Soft skills are a small, recognizable vocabulary; anything else on a skills
// line (tools, products, frameworks we don't know) is far more likely technical.
const SOFT_SKILL_RE =
  /\b(?:communicat|leadership|lead(?:ing)? teams?|team ?work|teamwork|collaborat|problem[- ]solving|critical thinking|adaptab|flexib|time management|creativ|negotiat|empath|mentor|coaching|presentation|public speaking|interpersonal|organi[sz]ation|attention to detail|self[- ]motivat|proactiv|work ethic|decision[- ]making|conflict|emotional intelligence|customer service|stakeholder|comunicaci|liderazgo|trabajo en equipo|resoluci[oó]n de problemas|pensamiento cr[ií]tico|adaptabilidad|gesti[oó]n del tiempo|creatividad|negociaci|empat[ií]a|proactiv|responsab|organizaci[oó]n|colaboraci|toma de decisiones)/i;

function categorizeSKill(skill: string): "technical" | "soft" {
  const lower = skill.toLowerCase().trim();

  // Direct match
  if (TECH_TERMS.has(lower)) {
    return "technical";
  }

  // Check sub-phrase matches (e.g., "React.js" might be stored as "react.js")
  for (const term of TECH_TERMS) {
    if (lower === term || lower.replace(/[.\-/\s]/g, "") === term.replace(/[.\-/\s]/g, "")) {
      return "technical";
    }
  }

  return SOFT_SKILL_RE.test(lower) ? "soft" : "technical";
}

function splitSkills(text: string): string[] {
  // Split by common delimiters: comma, semicolon, pipe, bullet, newline
  let skills: string[];

  // If text contains actual bullet characters or newlines, split on those
  // Note: we do NOT split on hyphens within words (e.g., "Problem-solving")
  // Only split on hyphens that are used as bullet prefixes (start of line after newline)
  if (/[•*·▪]/.test(text) || text.includes("\n")) {
    // Split on newlines and bullet characters, but not on hyphens mid-word
    skills = text.split(/[•*·▪\n]/).map((s) => s.trim().replace(/^-\s+/, "")).filter(Boolean);
  } else if (text.includes("|")) {
    skills = text.split("|").map((s) => s.trim()).filter(Boolean);
  } else if (text.includes(";")) {
    skills = text.split(";").map((s) => s.trim()).filter(Boolean);
  } else {
    skills = text.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Further split any remaining comma-separated skills within each entry
  const expanded: string[] = [];
  for (const skill of skills) {
    if (skill.includes(",")) {
      expanded.push(...skill.split(",").map((s) => s.trim()).filter(Boolean));
    } else {
      expanded.push(skill);
    }
  }

  // Clean up: remove leading/trailing punctuation, extra whitespace
  return expanded
    .map((s) => s.replace(/^[\s:;,•\-*·▪]+/, "").replace(/[\s:;,•\-*·▪]+$/, "").trim())
    .filter((s) => s.length > 0 && s.length < 80); // Filter out empty or absurdly long "skills"
}

function detectLanguageLevel(text: string): LanguageLevel {
  const lower = text.toLowerCase();

  for (const [keyword, level] of PROFICIENCY_MAP.entries()) {
    if (lower.includes(keyword)) {
      return level;
    }
  }

  return "intermediate"; // Default when level is not specified
}

function parseLanguageEntry(line: string): { name: string; level: LanguageLevel; certification: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 2) {
    return null;
  }

  // Skip if it looks like a section header
  if (isSectionHeader(trimmed)) {
    return null;
  }

  const level = detectLanguageLevel(trimmed);

  // Try to extract language name: text before the level/separator
  // Patterns: "English - Fluent", "Español: Nativo", "French (B2)", "Inglés C1"
  let name = trimmed;

  // Remove proficiency indicators
  name = name.replace(/\s*[-–—:]\s*.+$/, ""); // "English - Fluent" -> "English"
  name = name.replace(/\s*\([^)]*\)\s*$/, ""); // "French (B2)" -> "French"
  name = name.replace(/\s+[A-Ca-c][12]\s*$/, ""); // "Inglés C1" -> "Inglés"

  // Remove common level words from the name
  for (const [keyword] of PROFICIENCY_MAP.entries()) {
    const re = new RegExp(`\\b${keyword}\\b`, "gi");
    name = name.replace(re, "");
  }

  name = name.replace(/[,:;\-–—()]/g, "").trim();

  if (!name || name.length < 2) {
    return null;
  }

  // Check for certification mention
  let certification = "";
  const certMatch = trimmed.match(/\b([A-Ca-c][12]|TOEFL|IELTS|DELE|DELF|DALF|HSK|JLPT|TOPIK)\b/i);
  if (certMatch) {
    certification = certMatch[1].toUpperCase();
  }

  return { name, level, certification };
}

// ─── EXPERIENCE PARSING ──────────────────────────────────────────────────────

interface RawExperienceEntry {
  company: string;
  location: string;
  title: string;
  start_date: string;
  end_date: string | null;
  description: string;
  achievements: string[];
  technologies: string[];
}

function parseExperienceSection(content: string): RawExperienceEntry[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const entries: RawExperienceEntry[] = [];

  let current: Partial<RawExperienceEntry> | null = null;
  let currentAchievements: string[] = [];
  let currentDescParts: string[] = [];
  let currentTechnologies: string[] = [];

  function flushCurrent(): void {
    if (current && (current.company || current.title)) {
      entries.push({
        company: current.company ?? "",
        location: current.location ?? "",
        title: current.title ?? "",
        start_date: current.start_date ?? "",
        end_date: current.end_date ?? null,
        description: currentDescParts.join(" ").trim(),
        achievements: [...currentAchievements],
        technologies: [...currentTechnologies],
      });
    }
    current = null;
    currentAchievements = [];
    currentDescParts = [];
    currentTechnologies = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for date range — often indicates start of new entry
    const dateRange = extractDateRange(line);

    // Check if this line has a technology stack label
    const isTechLine = /^(technologies|tech stack|tools|stack|tecnolog[ií]as|herramientas)\s*[:：]/i.test(line);
    if (isTechLine && current) {
      const techText = line.replace(/^[^:：]+[:：]\s*/, "");
      currentTechnologies.push(...splitSkills(techText));
      continue;
    }

    // Check if this line has a role keyword — might be a title
    const hasRole = containsRoleKeyword(line);
    const hasDate = dateRange !== null || hasDateRange(line);

    // Heuristic: if we see a role keyword on a non-bullet line and the current entry
    // already has a title (and optionally achievements), start a new entry
    if (hasRole && !isBulletLine(line) && !hasDate && current && current.title && (currentAchievements.length > 0 || currentTechnologies.length > 0 || currentDescParts.length > 0)) {
      flushCurrent();
      current = { title: line };
      continue;
    }

    // Heuristic: new entry starts with a date range, or a title-like line after some content
    if (hasDate && !isBulletLine(line)) {
      // If we have a date, this might be a new entry or a date within the current entry

      if (current && !current.start_date) {
        // Add date to current entry
        if (dateRange) {
          current.start_date = dateRange.start;
          current.end_date = dateRange.end ?? null;
        }
        // The rest of the line (minus the date part) might be useful
        const lineWithoutDate = line
          .replace(DATE_RANGE_MONTH_YEAR, "")
          .replace(DATE_RANGE_NUMERIC, "")
          .replace(DATE_RANGE_YEAR_ONLY, "")
          .replace(/[|,\-–—]\s*$/, "")
          .trim();

        if (lineWithoutDate && !current.title && hasRole) {
          current.title = lineWithoutDate;
        } else if (lineWithoutDate && !current.company) {
          current.company = lineWithoutDate;
        }
        continue;
      }

      if (!current || (current.start_date && current.title)) {
        // Start a new entry
        flushCurrent();
        current = {};
        if (dateRange) {
          current.start_date = dateRange.start;
          current.end_date = dateRange.end ?? null;
        }

        // Remaining text on this line might be title or company
        const lineWithoutDate = line
          .replace(DATE_RANGE_MONTH_YEAR, "")
          .replace(DATE_RANGE_NUMERIC, "")
          .replace(DATE_RANGE_YEAR_ONLY, "")
          .replace(/^[\s|,\-–—]+/, "")
          .replace(/[\s|,\-–—]+$/, "")
          .trim();

        if (lineWithoutDate) {
          if (hasRole) {
            current.title = lineWithoutDate;
          } else {
            current.company = lineWithoutDate;
          }
        }
        continue;
      }
    }

    // If we don't have a current entry yet, and the line is not a bullet,
    // it might be a company name or title
    if (!current) {
      current = {};
      if (hasRole) {
        current.title = line;
      } else {
        current.company = line;
      }
      continue;
    }

    // If this is a role-like line and we don't have a title yet
    if (hasRole && !current.title && !isBulletLine(line)) {
      current.title = line.replace(DATE_RANGE_MONTH_YEAR, "").replace(DATE_RANGE_NUMERIC, "").replace(DATE_RANGE_YEAR_ONLY, "").trim();
      if (hasDate && dateRange && !current.start_date) {
        current.start_date = dateRange.start;
        current.end_date = dateRange.end ?? null;
      }
      continue;
    }

    // If we have a title but no company, and this isn't a bullet
    if (current.title && !current.company && !isBulletLine(line) && !hasDate) {
      // Could be a company line, possibly with location
      const locationMatch = line.match(/^(.+?)(?:\s*[,|–—]\s*)(.+)$/);
      if (locationMatch) {
        current.company = locationMatch[1].trim();
        current.location = locationMatch[2].trim();
      } else {
        current.company = line;
      }
      continue;
    }

    // If we have a company but no title, and this isn't a bullet
    if (current.company && !current.title && !isBulletLine(line) && !hasDate && hasRole) {
      current.title = line;
      continue;
    }

    // Bullet points = achievements
    if (isBulletLine(line)) {
      const cleaned = line.replace(/^[•\-*·▪▸►➤✓✔→➜◆◇○●■□▶»›]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
      if (cleaned) {
        currentAchievements.push(cleaned);
      }
      continue;
    }

    // Check for location on a standalone line (e.g., "New York, NY" or "Remote")
    if (!current.location && /^[A-Z][\w\s,]+(?:,\s*[A-Z]{2})?$/.test(line) && line.length < 40) {
      current.location = line;
      continue;
    }

    // Otherwise, it's part of the description
    currentDescParts.push(line);
  }

  flushCurrent();

  return entries;
}


// ─── LAYOUT-AWARE ENTRY PARSING ──────────────────────────────────────────────
//
// With layout lines (see layout.ts) entries can be split on what the document
// shows rather than guessed from keywords: a larger vertical gap or a return to
// the left margin after indented lines starts a new entry, and the first 1-3
// short, unindented lines are the entry's header (company/title/location/dates).

const ENTRY_GAP = 1.4;
const HEADER_PART_SPLIT = /\s+[|•·]\s+|\s+[–—]\s+|\s+-\s+(?=[A-ZÀ-Ý])|\s+(?:at|en|@)\s+(?=[A-ZÀ-Ý])/;
const LOCATION_WORDS = /\b(?:remote|remoto|hybrid|h[ií]brido|on-?site|presencial)\b/i;
const COMPANY_SUFFIX = /\b(?:inc|llc|ltd|gmbh|s\.?a|s\.?r\.?l|corp|co)\.?$/i;
const INSTITUTION_WORDS = /universi|college|institut|school|liceo|colegio|academ|escuela|polit[eé]cnic/i;
const TECH_LINE = /^(technologies|tech stack|tools|stack|tecnolog[ií]as|herramientas)\s*[:：]/i;

function stripDateRange(text: string): string {
  return text
    .replace(DATE_RANGE_MONTH_YEAR, "")
    .replace(DATE_RANGE_NUMERIC, "")
    .replace(DATE_RANGE_YEAR_ONLY, "")
    .replace(/[()]/g, " ")
    .replace(/^[\s|,•·\-–—]+/, "")
    .replace(/[\s|,•·\-–—]+$/, "")
    .trim();
}

function looksLikeLocation(part: string): boolean {
  if (LOCATION_WORDS.test(part)) return true;
  return /^[A-ZÀ-Ý][\p{L} .'-]+,\s*[A-ZÀ-Ý][\p{L} .'-]+$/u.test(part) && !COMPANY_SUFFIX.test(part);
}

function isBodyLine(line: CvLine): boolean {
  return line.bullet || line.indent > 0 || isBulletLine(line.text);
}

/** Splits a section's lines into entry blocks. */
function splitEntryBlocks(lines: CvLine[]): CvLine[][] {
  const blocks: CvLine[][] = [];
  let current: CvLine[] = [];
  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    const nextHasDate = [line, lines[i + 1], lines[i + 2]].some((l) => l && !isBodyLine(l) && hasDateRange(l.text));
    const startsEntry =
      current.length > 0 &&
      !isBodyLine(line) &&
      (line.gap >= ENTRY_GAP || (prev !== undefined && isBodyLine(prev) && nextHasDate));
    if (startsEntry) {
      blocks.push(current);
      current = [];
    }
    current.push(line);
  });
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/** Leading unindented, non-sentence lines of a block (max 3) form its header. */
function blockHeader(block: CvLine[]): { header: CvLine[]; body: CvLine[] } {
  let n = 0;
  while (
    n < block.length &&
    n < 3 &&
    !isBodyLine(block[n]) &&
    block[n].text.length <= 120 &&
    (n === 0 || !/[.!?]$/.test(block[n].text.trim()))
  ) {
    n++;
  }
  // A header line ending in a period is body text unless it carries the dates.
  while (n > 1 && /[.!?]$/.test(block[n - 1].text.trim()) && !hasDateRange(block[n - 1].text)) n--;
  return { header: block.slice(0, Math.max(n, 1)), body: block.slice(Math.max(n, 1)) };
}

function headerParts(header: CvLine[]): { parts: string[]; dates: { start: string; end: string | null } | null } {
  let dates: { start: string; end: string | null } | null = null;
  const parts: string[] = [];
  for (const line of header) {
    const range = extractDateRange(line.text);
    if (range && !dates) dates = range;
    const rest = range ? stripDateRange(line.text) : line.text.trim();
    for (const part of rest.split(HEADER_PART_SPLIT)) {
      const cleaned = part.replace(/^[\s|,•·]+|[\s|,•·]+$/g, "").trim();
      if (cleaned) parts.push(cleaned);
    }
  }
  return { parts, dates };
}

function parseExperienceBlock(block: CvLine[]): RawExperienceEntry {
  const { header, body } = blockHeader(block);
  const { parts, dates } = headerParts(header);

  const location = parts.find(looksLikeLocation) ?? "";
  const rest = parts.filter((p) => p !== location);
  const titleIndex = rest.findIndex((p) => containsRoleKeyword(p));
  let title = titleIndex >= 0 ? rest[titleIndex] : "";
  let company = rest.find((_, i) => i !== titleIndex) ?? "";
  if (!title && rest.length >= 2) {
    // "Company | Location" then "Title | dates": the dated line holds the title.
    const datedLine = header.find((l) => hasDateRange(l.text));
    const datedRest = datedLine ? stripDateRange(datedLine.text).split(HEADER_PART_SPLIT)[0]?.trim() : "";
    title = datedRest && datedRest !== company ? datedRest : rest[1];
    company = rest.find((p) => p !== title) ?? "";
  }

  const achievements: string[] = [];
  const descParts: string[] = [];
  const technologies: string[] = [];
  for (const line of body) {
    const text = line.text.replace(/^[•\-*·▪▸►➤✓✔→➜◆◇○●■□▶»›]\s*/, "").trim();
    if (!text) continue;
    if (TECH_LINE.test(text)) {
      technologies.push(...splitSkills(text.replace(/^[^:：]+[:：]\s*/, "")));
    } else if (isBodyLine(line) || /[.!?]$/.test(text) || text.length < 200) {
      achievements.push(text);
    } else {
      descParts.push(text);
    }
  }

  return {
    company,
    location,
    title,
    start_date: dates?.start ?? "",
    end_date: dates?.end ?? null,
    description: descParts.join(" "),
    achievements,
    technologies,
  };
}

/**
 * Layout-based experience parsing. Returns null when the blocks don't look like
 * dated entries, so the caller can fall back to the text heuristics.
 */
function parseExperienceLines(lines: CvLine[]): RawExperienceEntry[] | null {
  const blocks = splitEntryBlocks(lines);
  if (blocks.length === 0) return null;
  const dated = blocks.filter((b) => blockHeader(b).header.some((l) => hasDateRange(l.text)));
  if (dated.length / blocks.length < 0.7) return null;
  return blocks.map(parseExperienceBlock).filter((e) => e.title || e.company);
}

function parseEducationLines(lines: CvLine[]): RawEducationEntry[] | null {
  const blocks = splitEntryBlocks(lines);
  if (blocks.length === 0) return null;
  return blocks.map((block) => {
    const { parts, dates } = headerParts(block);
    const location = parts.find(looksLikeLocation) ?? "";
    const rest = parts.filter((p) => p !== location);
    const institution = rest.find((p) => INSTITUTION_WORDS.test(p)) ?? rest[0] ?? "";
    const degreeText = rest.find((p) => p !== institution && containsDegreeKeyword(p)) ?? rest.find((p) => p !== institution) ?? "";
    const inMatch = /^(.+?)\s+(?:in|en|of|de)\s+(.+)$/i.exec(degreeText);
    return {
      institution,
      location,
      degree: inMatch ? inMatch[1].trim() : degreeText,
      field: inMatch ? inMatch[2].trim() : "",
      start_date: dates?.start ?? "",
      end_date: dates?.end ?? "",
      honors: [],
    };
  }).filter((e) => e.institution || e.degree);
}

/** Section split over layout lines (same header rules as splitIntoSections). */
function splitLinesIntoSections(lines: CvLine[]): { header: SectionCategory | null; lines: CvLine[] }[] {
  const sections: { header: SectionCategory | null; lines: CvLine[] }[] = [{ header: null, lines: [] }];
  for (const line of lines) {
    const category = line.bullet ? null : isSectionHeader(line.text);
    if (category !== null) sections.push({ header: category, lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

// ─── EDUCATION PARSING ────────────────────────────────────────────────────────

interface RawEducationEntry {
  institution: string;
  location: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
  honors: string[];
}

function parseEducationSection(content: string): RawEducationEntry[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const entries: RawEducationEntry[] = [];

  let current: Partial<RawEducationEntry> | null = null;
  let currentHonors: string[] = [];

  function flushCurrent(): void {
    if (current && (current.institution || current.degree)) {
      entries.push({
        institution: current.institution ?? "",
        location: current.location ?? "",
        degree: current.degree ?? "",
        field: current.field ?? "",
        start_date: current.start_date ?? "",
        end_date: current.end_date ?? "",
        honors: [...currentHonors],
      });
    }
    current = null;
    currentHonors = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const hasDegree = containsDegreeKeyword(trimmed);
    const dateRange = extractDateRange(trimmed);
    const hasDate = dateRange !== null;

    // Check for honors keywords
    const isHonors = /cum laude|magna|summa|honors|honores|distinción|distincion|dean'?s list|merit|sobresaliente|excelencia/i.test(trimmed);

    if (isHonors && current) {
      const cleaned = trimmed.replace(/^[•\-*·]\s*/, "").trim();
      currentHonors.push(cleaned);
      continue;
    }

    // Bullet points in education section
    if (isBulletLine(trimmed) && current) {
      const cleaned = trimmed.replace(/^[•\-*·▪▸►➤✓✔→➜◆◇○●■□▶»›]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
      if (cleaned) {
        if (/cum laude|magna|summa|honors|dean/i.test(cleaned)) {
          currentHonors.push(cleaned);
        } else if (containsDegreeKeyword(cleaned) && !current.degree) {
          current.degree = cleaned;
        }
      }
      continue;
    }

    // If the line has a degree keyword, it might start a new entry or add degree info
    if (hasDegree) {
      if (!current) {
        current = {};
      }

      if (!current.degree) {
        // Extract degree and field
        // Patterns: "Bachelor of Science in Computer Science", "Master in Data Science"
        const degreeFieldMatch = trimmed.match(
          /(.+?(?:bachelor'?s?|master'?s?|ph\.?d\.?|doctorate|licenciatura|maestr[ií]a|ingenier[ií]a|t[eé]cnico|diplomado|grado|associate'?s?|mba|m\.?b\.?a\.?|b\.?s\.?c?\.?|m\.?s\.?c?\.?|b\.?a\.?|m\.?a\.?|b\.?eng\.?|m\.?eng\.?|diploma|certificate|degree|postgrado|posgrado|especializaci[oó]n))\s*(?:(?:of|in|en|de|del)\s+)?(.+)?/i
        );

        if (degreeFieldMatch) {
          current.degree = degreeFieldMatch[1].trim();
          if (degreeFieldMatch[2]) {
            current.field = degreeFieldMatch[2]
              .replace(DATE_RANGE_MONTH_YEAR, "")
              .replace(DATE_RANGE_NUMERIC, "")
              .replace(DATE_RANGE_YEAR_ONLY, "")
              .replace(/[,|–—]\s*$/, "")
              .trim();
          }
        } else {
          current.degree = trimmed
            .replace(DATE_RANGE_MONTH_YEAR, "")
            .replace(DATE_RANGE_NUMERIC, "")
            .replace(DATE_RANGE_YEAR_ONLY, "")
            .trim();
        }

        if (hasDate && dateRange) {
          current.start_date = dateRange.start;
          current.end_date = dateRange.end ?? "";
        }
        continue;
      }
    }

    // Date line
    if (hasDate && current) {
      if (!current.start_date && dateRange) {
        current.start_date = dateRange.start;
        current.end_date = dateRange.end ?? "";
      }
      // If there's text besides the date, might be institution
      const lineWithoutDate = trimmed
        .replace(DATE_RANGE_MONTH_YEAR, "")
        .replace(DATE_RANGE_NUMERIC, "")
        .replace(DATE_RANGE_YEAR_ONLY, "")
        .replace(/^[\s|,\-–—]+/, "")
        .replace(/[\s|,\-–—]+$/, "")
        .trim();
      if (lineWithoutDate && !current.institution) {
        current.institution = lineWithoutDate;
      }
      continue;
    }

    // If no current entry, assume this is the start (institution name)
    if (!current) {
      flushCurrent();
      current = {};

      if (hasDate && dateRange) {
        current.start_date = dateRange.start;
        current.end_date = dateRange.end ?? "";
        const lineWithoutDate = trimmed
          .replace(DATE_RANGE_MONTH_YEAR, "")
          .replace(DATE_RANGE_NUMERIC, "")
          .replace(DATE_RANGE_YEAR_ONLY, "")
          .replace(/^[\s|,\-–—]+/, "")
          .replace(/[\s|,\-–—]+$/, "")
          .trim();
        if (lineWithoutDate) {
          current.institution = lineWithoutDate;
        }
      } else {
        // Check for location in the line
        const locationMatch = trimmed.match(/^(.+?)(?:\s*[,|–—]\s*)(.+)$/);
        if (locationMatch && locationMatch[2].length < 30) {
          current.institution = locationMatch[1].trim();
          current.location = locationMatch[2].trim();
        } else {
          current.institution = trimmed;
        }
      }
      continue;
    }

    // If we have a degree but no institution, this line is likely the institution
    if (current.degree && !current.institution && !isBulletLine(trimmed)) {
      const locationMatch = trimmed.match(/^(.+?)(?:\s*[,|–—]\s*)(.+)$/);
      if (locationMatch && locationMatch[2].length < 30) {
        current.institution = locationMatch[1].trim();
        current.location = locationMatch[2].trim();
      } else {
        current.institution = trimmed;
      }
      continue;
    }

    // If we have institution but this is a new non-bullet, non-date line
    if (current.institution && !isBulletLine(trimmed)) {
      // Check if it could be a location
      if (!current.location && /^[A-ZÀ-Ý][\w\sÀ-ÿ,]+$/.test(trimmed) && trimmed.length < 40) {
        current.location = trimmed;
      } else if (!current.degree && !hasDegree) {
        // Might be field of study or additional info
        if (!current.field) {
          current.field = trimmed;
        }
      }
      continue;
    }
  }

  flushCurrent();

  return entries;
}

// ─── PROJECT PARSING ──────────────────────────────────────────────────────────

interface RawProjectEntry {
  name: string;
  description: string;
  achievements: string[];
  technologies: string[];
  url: string;
}

function parseProjectsSection(content: string): RawProjectEntry[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const entries: RawProjectEntry[] = [];

  let current: Partial<RawProjectEntry> | null = null;
  let currentAchievements: string[] = [];
  let currentTechnologies: string[] = [];
  let currentDescParts: string[] = [];

  function flushCurrent(): void {
    if (current && current.name) {
      entries.push({
        name: current.name,
        description: currentDescParts.join(" ").trim() || current.description || "",
        achievements: [...currentAchievements],
        technologies: [...currentTechnologies],
        url: current.url ?? "",
      });
    }
    current = null;
    currentAchievements = [];
    currentTechnologies = [];
    currentDescParts = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for tech stack line
    const isTechLine = /^(technologies|tech stack|tools|built with|stack|tecnolog[ií]as|herramientas)\s*[:：]/i.test(trimmed);
    if (isTechLine && current) {
      const techText = trimmed.replace(/^[^:：]+[:：]\s*/, "");
      currentTechnologies.push(...splitSkills(techText));
      continue;
    }

    // Check for URL
    URL_REGEX.lastIndex = 0;
    const urlMatch = URL_REGEX.exec(trimmed);
    if (urlMatch && current) {
      current.url = urlMatch[0];
      const lineWithoutUrl = trimmed.replace(URL_REGEX, "").trim();
      URL_REGEX.lastIndex = 0;
      if (lineWithoutUrl && !isBulletLine(lineWithoutUrl)) {
        currentDescParts.push(lineWithoutUrl);
      }
      continue;
    }
    URL_REGEX.lastIndex = 0;

    // Bullet points = achievements or description items
    if (isBulletLine(trimmed)) {
      const cleaned = trimmed.replace(/^[•\-*·▪▸►➤✓✔→➜◆◇○●■□▶»›]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
      if (cleaned && current) {
        currentAchievements.push(cleaned);
      }
      continue;
    }

    // Non-bullet, non-tech line — could be project name or description
    // Heuristic: project name is usually short, possibly bold (we lose formatting in raw text)
    if (!current || (current.name && currentAchievements.length > 0)) {
      // Likely a new project
      flushCurrent();
      current = { name: trimmed };
      continue;
    }

    if (current && !currentDescParts.length && !currentAchievements.length && trimmed.length < 60) {
      // Could still be part of the name or a subtitle
      if (!current.name) {
        current.name = trimmed;
      } else {
        currentDescParts.push(trimmed);
      }
    } else {
      currentDescParts.push(trimmed);
    }
  }

  flushCurrent();
  return entries;
}

// ─── MAIN EXTRACTION FUNCTION ─────────────────────────────────────────────────

export function extractStructuredCv(rawText: string, layout?: CvLine[]): ParsedCvResult {
  const text = normalizeWhitespace(rawText);
  const lines = text.split("\n");
  const layoutSections = layout && layout.length > 0 ? splitLinesIntoSections(layout) : null;

  // ── 1. Extract email ──────────────────────────────────────────────────────
  EMAIL_REGEX.lastIndex = 0;
  const emailMatch = EMAIL_REGEX.exec(text);
  const email = emailMatch ? emailMatch[0] : "";
  EMAIL_REGEX.lastIndex = 0;

  // ── 2. Extract phone ──────────────────────────────────────────────────────
  PHONE_REGEX.lastIndex = 0;
  const phoneMatch = PHONE_REGEX.exec(text);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";
  PHONE_REGEX.lastIndex = 0;

  // ── 3. Extract LinkedIn URL ───────────────────────────────────────────────
  LINKEDIN_REGEX.lastIndex = 0;
  const linkedinMatch = LINKEDIN_REGEX.exec(text);
  const linkedinUrl = linkedinMatch ? linkedinMatch[0] : "";
  LINKEDIN_REGEX.lastIndex = 0;

  // ── 4. Extract GitHub URL ─────────────────────────────────────────────────
  GITHUB_REGEX.lastIndex = 0;
  const githubMatch = GITHUB_REGEX.exec(text);
  const githubUrl = githubMatch ? githubMatch[0] : "";
  GITHUB_REGEX.lastIndex = 0;

  // ── 5. Extract portfolio/other URLs ───────────────────────────────────────
  URL_REGEX.lastIndex = 0;
  let portfolioUrl = "";
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = URL_REGEX.exec(text)) !== null) {
    const url = urlMatch[0];
    // Skip LinkedIn, GitHub, and common non-portfolio URLs
    if (
      !url.includes("linkedin.com") &&
      !url.includes("github.com") &&
      !url.includes("mailto:") &&
      !url.includes("maps.google") &&
      !url.includes("fonts.google")
    ) {
      portfolioUrl = url;
      break;
    }
  }
  URL_REGEX.lastIndex = 0;

  // ── 6. Extract name ───────────────────────────────────────────────────────
  let fullName = "";
  if (layout && layout.length > 0) {
    // The name is the most prominent line near the top.
    const top = layout.slice(0, 5).filter((l) => isNameCandidate(l.text));
    top.sort((a, b) => b.size - a.size);
    if (top[0] && top[0].size > 1.05) fullName = top[0].text.trim();
  }
  for (const line of fullName ? [] : lines.slice(0, 10)) {
    // Look in the first 10 lines
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Reset regex lastIndex
    EMAIL_REGEX.lastIndex = 0;
    PHONE_REGEX.lastIndex = 0;
    URL_REGEX.lastIndex = 0;

    if (isNameCandidate(trimmed)) {
      fullName = trimmed;
      break;
    }
  }

  // ── 7. Split text into sections ───────────────────────────────────────────
  const sections = splitIntoSections(text);

  // ── 8. Extract location from contact section or near the top ──────────────
  let location = "";
  const contactSection = sections.find((s) => s.header === "contact");
  if (contactSection) {
    // Look for location-like text in the contact section
    const contactLines = contactSection.content.split("\n");
    for (const cl of contactLines) {
      const trimmed = cl.trim();
      EMAIL_REGEX.lastIndex = 0;
      PHONE_REGEX.lastIndex = 0;
      URL_REGEX.lastIndex = 0;
      if (
        trimmed &&
        !EMAIL_REGEX.test(trimmed) &&
        !PHONE_REGEX.test(trimmed) &&
        !URL_REGEX.test(trimmed) &&
        !isNameCandidate(trimmed) &&
        trimmed.length < 50
      ) {
        location = trimmed;
        break;
      }
      EMAIL_REGEX.lastIndex = 0;
      PHONE_REGEX.lastIndex = 0;
      URL_REGEX.lastIndex = 0;
    }
  }

  // With layout, the contact block is the text before the first section heading;
  // its " | "-separated parts often include the city.
  if (!location && layoutSections) {
    const contactParts = layoutSections[0].lines
      .flatMap((l) => l.text.split(/\s+[|•·]\s+/))
      .map((p) => p.trim())
      .filter((p) => p && p !== fullName && !/@|\d{3}|https?:|www\./i.test(p));
    location = contactParts.find(looksLikeLocation) ?? "";
  }

  // Fallback: look near the top of the document for a location-like line
  if (!location && !layoutSections) {
    for (const line of lines.slice(0, 8)) {
      const trimmed = line.trim();
      EMAIL_REGEX.lastIndex = 0;
      PHONE_REGEX.lastIndex = 0;
      URL_REGEX.lastIndex = 0;
      if (
        trimmed &&
        trimmed !== fullName &&
        !EMAIL_REGEX.test(trimmed) &&
        !PHONE_REGEX.test(trimmed) &&
        !URL_REGEX.test(trimmed) &&
        !isSectionHeader(trimmed) &&
        !isNameCandidate(trimmed) &&
        // Location heuristic: contains comma (city, state) or known location patterns
        (/,/.test(trimmed) || /\b(?:remote|remoto|city|estado|state|country|pa[ií]s)\b/i.test(trimmed)) &&
        trimmed.length < 50
      ) {
        location = trimmed;
        break;
      }
      EMAIL_REGEX.lastIndex = 0;
      PHONE_REGEX.lastIndex = 0;
      URL_REGEX.lastIndex = 0;
    }
  }

  // ── 9. Extract summary ────────────────────────────────────────────────────
  let summary = "";
  const summarySection = sections.find((s) => s.header === "summary");
  if (summarySection) {
    summary = summarySection.content.replace(/\n+/g, " ").trim();
  } else {
    // Fallback: text between name and first section header
    const preamble = sections.find((s) => s.header === null);
    if (preamble) {
      const preambleLines = preamble.content.split("\n");
      const summaryLines: string[] = [];
      for (const pl of preambleLines) {
        const trimmed = pl.trim();
        EMAIL_REGEX.lastIndex = 0;
        PHONE_REGEX.lastIndex = 0;
        URL_REGEX.lastIndex = 0;
        LINKEDIN_REGEX.lastIndex = 0;
        GITHUB_REGEX.lastIndex = 0;
        if (
          trimmed &&
          trimmed !== fullName &&
          trimmed !== location &&
          !EMAIL_REGEX.test(trimmed) &&
          !PHONE_REGEX.test(trimmed) &&
          !URL_REGEX.test(trimmed) &&
          !LINKEDIN_REGEX.test(trimmed) &&
          !GITHUB_REGEX.test(trimmed) &&
          trimmed.length > 20 // Summary lines should be somewhat substantial
        ) {
          summaryLines.push(trimmed);
        }
        EMAIL_REGEX.lastIndex = 0;
        PHONE_REGEX.lastIndex = 0;
        URL_REGEX.lastIndex = 0;
        LINKEDIN_REGEX.lastIndex = 0;
        GITHUB_REGEX.lastIndex = 0;
      }
      if (summaryLines.length > 0) {
        summary = summaryLines.join(" ").trim();
      }
    }
  }

  // ── 10. Extract experience ────────────────────────────────────────────────
  const experienceSections = sections.filter((s) => s.header === "experience");
  const experience: ParsedCvResult["experience"] = [];
  const experienceLineSections = layoutSections?.filter((s) => s.header === "experience") ?? [];
  const layoutExperience =
    experienceLineSections.length > 0 && experienceLineSections.length === experienceSections.length
      ? experienceLineSections.map((s) => parseExperienceLines(s.lines))
      : [];
  for (const [index, expSection] of experienceSections.entries()) {
    const parsed = layoutExperience[index] ?? parseExperienceSection(expSection.content);
    for (const entry of parsed) {
      experience.push({
        company: entry.company,
        location: entry.location,
        title: entry.title,
        start_date: entry.start_date,
        end_date: entry.end_date,
        description: entry.description,
        achievements: entry.achievements,
        technologies: entry.technologies,
      });
    }
  }

  // ── 11. Extract education ─────────────────────────────────────────────────
  const educationSections = sections.filter((s) => s.header === "education");
  const education: ParsedCvResult["education"] = [];
  const educationLineSections = layoutSections?.filter((s) => s.header === "education") ?? [];
  const layoutEducation =
    educationLineSections.length > 0 && educationLineSections.length === educationSections.length
      ? educationLineSections.map((s) => parseEducationLines(s.lines))
      : [];
  for (const [index, eduSection] of educationSections.entries()) {
    const parsed = layoutEducation[index] ?? parseEducationSection(eduSection.content);
    for (const entry of parsed) {
      education.push({
        institution: entry.institution,
        location: entry.location,
        degree: entry.degree,
        field: entry.field,
        start_date: entry.start_date,
        end_date: entry.end_date,
        honors: entry.honors,
      });
    }
  }

  // ── 12. Extract skills ────────────────────────────────────────────────────
  const skillSections = sections.filter((s) => s.header === "skills");
  const technicalSkills: string[] = [];
  const softSkills: string[] = [];
  const seenSkills = new Set<string>();

  for (const skillSection of skillSections) {
    const skills = splitSkills(skillSection.content);
    for (const skill of skills) {
      const lower = skill.toLowerCase().trim();
      if (seenSkills.has(lower)) continue;
      seenSkills.add(lower);

      const category = categorizeSKill(skill);
      if (category === "technical") {
        technicalSkills.push(skill.trim());
      } else {
        softSkills.push(skill.trim());
      }
    }
  }

  // Also extract technologies mentioned in experience entries
  for (const exp of experience) {
    for (const tech of exp.technologies) {
      const lower = tech.toLowerCase().trim();
      if (!seenSkills.has(lower) && categorizeSKill(tech) === "technical") {
        seenSkills.add(lower);
        technicalSkills.push(tech.trim());
      }
    }
  }

  // ── 13. Extract certifications ────────────────────────────────────────────
  const certSections = sections.filter((s) => s.header === "certifications");
  const certifications: string[] = [];

  for (const certSection of certSections) {
    const certLines = certSection.content.split("\n");
    for (const cl of certLines) {
      const trimmed = cl.trim().replace(/^[•\-*·▪]\s*/, "").trim();
      if (trimmed && trimmed.length > 2) {
        certifications.push(trimmed);
      }
    }
  }

  // Also scan entire text for certification keywords not in dedicated section
  if (certifications.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      if (CERT_KEYWORDS.some((kw) => lower.includes(kw))) {
        const cleaned = trimmed.replace(/^[•\-*·▪]\s*/, "").trim();
        if (cleaned && cleaned.length > 5 && !certifications.includes(cleaned)) {
          certifications.push(cleaned);
        }
      }
    }
  }

  // ── 14. Extract projects ──────────────────────────────────────────────────
  const projectSections = sections.filter((s) => s.header === "projects");
  const projects: ParsedCvResult["projects"] = [];

  for (const projSection of projectSections) {
    const parsed = parseProjectsSection(projSection.content);
    for (const entry of parsed) {
      projects.push({
        name: entry.name,
        description: entry.description,
        achievements: entry.achievements,
        technologies: entry.technologies,
        url: entry.url,
      });
    }
  }

  // ── 15. Extract languages ─────────────────────────────────────────────────
  const langSections = sections.filter((s) => s.header === "languages");
  const languages: ParsedCvResult["languages"] = [];

  for (const langSection of langSections) {
    const langLines = langSection.content.split("\n").flatMap((l) =>
      // "English, Spanish, German" — a plain list with no levels on the line.
      /[,|•·]/.test(l) && detectLanguageLevel(l) === "intermediate" && !/intermedi/i.test(l)
        ? l.split(/[,|•·]/)
        : [l],
    );
    for (const ll of langLines) {
      const trimmed = ll.trim().replace(/^[•\-*·▪]\s*/, "").trim();
      const parsed = parseLanguageEntry(trimmed);
      if (parsed) {
        languages.push({
          name: parsed.name,
          level: parsed.level,
          certification: parsed.certification,
        });
      }
    }
  }

  // ── 16. Build and return result ───────────────────────────────────────────
  return {
    full_name: fullName,
    email,
    phone,
    location,
    linkedin_url: linkedinUrl,
    github_url: githubUrl,
    portfolio_url: portfolioUrl,
    summary,
    skills: {
      technical: technicalSkills,
      soft: softSkills,
    },
    experience,
    education,
    certifications,
    projects,
    languages,
  };
}
