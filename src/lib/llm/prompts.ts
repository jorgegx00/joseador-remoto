import type { ParsedCv, Job } from "@/types";

// ---------------------------------------------------------------------------
// Helper: format a CV into a readable text block for prompts
// ---------------------------------------------------------------------------
function formatCvForPrompt(cv: ParsedCv): string {
  const lines: string[] = [];

  lines.push(`## Candidate Profile`);
  lines.push(`Name: ${cv.full_name}`);
  if (cv.email) lines.push(`Email: ${cv.email}`);
  if (cv.location) lines.push(`Location: ${cv.location}`);
  if (cv.linkedin_url) lines.push(`LinkedIn: ${cv.linkedin_url}`);
  if (cv.github_url) lines.push(`GitHub: ${cv.github_url}`);
  if (cv.portfolio_url) lines.push(`Portfolio: ${cv.portfolio_url}`);
  lines.push("");

  if (cv.summary) {
    lines.push(`## Professional Summary`);
    lines.push(cv.summary);
    lines.push("");
  }

  lines.push(`## Skills`);
  if (cv.skills.technical.length > 0) {
    lines.push(`Technical: ${cv.skills.technical.join(", ")}`);
  }
  if (cv.skills.soft.length > 0) {
    lines.push(`Soft Skills: ${cv.skills.soft.join(", ")}`);
  }
  lines.push("");

  if (cv.experience.length > 0) {
    lines.push(`## Work Experience`);
    for (const exp of cv.experience) {
      lines.push(
        `### ${exp.title} at ${exp.company}${exp.location ? ` (${exp.location})` : ""}`
      );
      lines.push(
        `${exp.start_date} - ${exp.end_date ?? "Present"}`
      );
      if (exp.description) {
        lines.push(exp.description);
      }
      if (exp.achievements.length > 0) {
        lines.push("Key Achievements:");
        for (const ach of exp.achievements) {
          lines.push(`  - ${ach}`);
        }
      }
      if (exp.technologies.length > 0) {
        lines.push(`Technologies: ${exp.technologies.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (cv.education.length > 0) {
    lines.push(`## Education`);
    for (const edu of cv.education) {
      lines.push(
        `- ${edu.degree} in ${edu.field} at ${edu.institution}${edu.location ? ` (${edu.location})` : ""}`
      );
      lines.push(`  ${edu.start_date} - ${edu.end_date}`);
      if (edu.honors.length > 0) {
        lines.push(`  Honors: ${edu.honors.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (cv.certifications.length > 0) {
    lines.push(`## Certifications`);
    for (const cert of cv.certifications) {
      lines.push(`- ${cert}`);
    }
    lines.push("");
  }

  if (cv.projects.length > 0) {
    lines.push(`## Projects`);
    for (const proj of cv.projects) {
      lines.push(`### ${proj.name}${proj.url ? ` (${proj.url})` : ""}`);
      lines.push(proj.description);
      if (proj.achievements.length > 0) {
        for (const ach of proj.achievements) {
          lines.push(`  - ${ach}`);
        }
      }
      if (proj.technologies.length > 0) {
        lines.push(`Technologies: ${proj.technologies.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (cv.languages.length > 0) {
    lines.push(`## Languages`);
    for (const lang of cv.languages) {
      lines.push(
        `- ${lang.name}: ${lang.level}${lang.certification ? ` (${lang.certification})` : ""}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helper: format a job posting into a readable text block for prompts
// ---------------------------------------------------------------------------
function formatJobForPrompt(job: Job): string {
  const lines: string[] = [];

  lines.push(`## Job Posting`);
  lines.push(`Title: ${job.title}`);
  const company = (job.company_name ?? "").trim();
  if (company && !/^(unknown company|empresa desconocida)$/i.test(company)) {
    lines.push(`Company: ${company}`);
  }
  if (job.location) lines.push(`Location: ${job.location}`);
  lines.push(`Seniority: ${job.seniority_level}`);
  lines.push(`Employment Type: ${job.employment_type.replace("_", " ")}`);
  if (job.salary_min !== null || job.salary_max !== null) {
    const salary = [
      job.salary_min !== null ? `${job.salary_min}` : "",
      job.salary_max !== null ? `${job.salary_max}` : "",
    ]
      .filter(Boolean)
      .join(" - ");
    lines.push(
      `Salary Range: ${salary}${job.salary_currency ? ` ${job.salary_currency}` : ""}`
    );
  }
  lines.push("");

  lines.push(`## Job Description`);
  lines.push(job.description);
  lines.push("");

  if (job.skills_required.length > 0) {
    lines.push(`## Required Skills`);
    lines.push(job.skills_required.join(", "));
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 1. CV-Job Match Analysis
// ---------------------------------------------------------------------------
export function buildMatchPrompt(cv: ParsedCv, job: Job): string {
  return `You are a senior technical recruiter and ATS (Applicant Tracking System) specialist with 15+ years of experience evaluating candidates for technology roles. Your task is to perform a thorough analysis of how well this candidate's CV matches the given job posting.

${formatCvForPrompt(cv)}

${formatJobForPrompt(job)}

## Analysis Instructions

Perform the following analysis steps carefully:

1. **Overall Match Score (0-100)**: Consider the holistic fit across skills, experience, seniority, and cultural indicators. A score of 70+ means the candidate is a strong contender, 50-69 means they have potential but notable gaps, below 50 means significant misalignment.

2. **Skills Matching**: For EACH skill mentioned in the job requirements, determine:
   - Whether the candidate demonstrably has this skill (from their listed skills, experience descriptions, or project work)
   - How important this skill is for the role: "critical" if the job cannot be done without it, "important" if strongly desired, "nice_to_have" if it would be a bonus
   - Look beyond exact keyword matches — consider synonyms, related technologies, and transferable skills

3. **Experience Relevance (0-100)**: Evaluate how relevant the candidate's work history is to this role. Consider:
   - Industry alignment
   - Similar responsibilities and scope
   - Technical stack overlap
   - Scale of projects and team sizes

4. **Seniority Fit**: Determine if the candidate is under_qualified, good_fit, or over_qualified based on:
   - Years of relevant experience
   - Leadership/mentorship experience vs. requirements
   - Complexity of previous roles
   - The seniority_level specified in the job posting

5. **Gaps**: Identify specific, actionable gaps — skills they lack, experience they are missing, or qualifications they do not have. Be specific rather than generic.

6. **Strengths**: Highlight where the candidate exceeds expectations or brings unique value beyond the requirements.

7. **Recommendation**: Provide a concise 2-3 sentence recommendation about whether the candidate should apply, and if so, what they should emphasize in their application.

Be honest and constructive. Do not inflate scores. A realistic assessment is more valuable than an optimistic one.`;
}

// ---------------------------------------------------------------------------
// 2. CV Narrative Report
// ---------------------------------------------------------------------------
export function buildNarrativePrompt(cv: ParsedCv, job?: Job): string {
  const jobContext = job
    ? `\n\nThe candidate is targeting the following role. Consider this context when evaluating personalization and relevance:\n\n${formatJobForPrompt(job)}`
    : `\n\nNo specific target role was provided. Evaluate the CV as a general-purpose professional document.`;

  return `You are an expert CV reviewer and career coach who has reviewed thousands of CVs across the tech industry. Your task is to perform a detailed narrative analysis of this CV, scoring it across five key dimensions and providing actionable, specific feedback.

${formatCvForPrompt(cv)}${jobContext}

## Evaluation Criteria

Score each dimension from 0 to 10, where:
- 0-3: Major issues, needs complete rewrite
- 4-5: Below average, several important improvements needed
- 6-7: Good but with clear room for improvement
- 8-9: Strong, only minor tweaks needed
- 10: Exceptional, professional-grade

### 1. Summary Quality (summary_score, summary_feedback)
Evaluate the professional summary:
- Does it clearly state who the candidate is and what they offer?
- Does it avoid vague cliches like "passionate self-starter" or "results-driven professional"?
- Does it include specific years of experience, core technologies, and a value proposition?
- Is it the right length (3-5 sentences, not too long or too short)?
- Provide specific rewrite suggestions where the summary falls short.

### 2. Achievement Quantification (achievement_score, achievement_feedback)
Evaluate how well achievements are quantified:
- Are metrics, percentages, revenue figures, or time savings included?
- Do bullets show impact rather than just listing responsibilities?
- Are there concrete numbers (e.g., "reduced load time by 40%" vs. "improved performance")?
- Identify the strongest and weakest bullets, and show how to improve the weak ones.

### 3. STAR Format (star_format_score, star_feedback)
Evaluate whether experience bullets follow or approximate the STAR format:
- Do bullets show Situation/context, Task/challenge, Action taken, and Result achieved?
- Or are they just flat descriptions of duties?
- Rewrite 1-2 weak bullets to demonstrate proper STAR format.

### 4. Technology Contextualization (tech_per_role_score, tech_feedback)
Evaluate whether technologies are tied to real work:
- Are tech skills shown in context ("Built a microservices architecture using Go and gRPC")?
- Or are they just listed without context ("Go, gRPC, Docker, Kubernetes")?
- Is the tech stack per role clearly visible?
- Suggest ways to better contextualize technology usage.

### 5. Personalization (personalization_score, personalization_feedback)
Evaluate whether the CV tells a unique story:
- Does it feel like a unique person or a generic template?
- Is there a coherent career narrative?
- Does it highlight what makes this candidate different?
- If a target role was provided, is the CV tailored to that role?

### Overall Impression
Provide a 3-5 sentence overall impression covering the CV's strongest aspects and the most impactful changes.

### Top Improvements
List 3-5 specific improvements ranked by impact. For each, quote or paraphrase what the CV currently says and provide the specific improved version.`;
}

// ---------------------------------------------------------------------------
// 3. CV Optimization ("tailor to a job") + chat refinement
//    Builders live in ./cv-optimization-prompts (system + prompt pairs).
// ---------------------------------------------------------------------------
export interface CvChatTurn {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// 4. Cover Letter Generation
// ---------------------------------------------------------------------------
export function buildCoverLetterPrompt(cv: ParsedCv, job: Job): string {
  return `You are a professional cover letter writer who creates compelling, personalized cover letters that get interviews. Your task is to write a cover letter for this candidate applying to this specific role.

${formatCvForPrompt(cv)}

${formatJobForPrompt(job)}

## Cover Letter Instructions

Write a professional cover letter that follows these guidelines:

1. **Subject Line**: Create an email subject line that is specific and attention-grabbing. Avoid generic lines like "Application for [Role]". Instead, reference a key qualification or achievement.

2. **Greeting**: Use a professional greeting. Since we do not know the hiring manager's name, use a warm but professional generic greeting like "Dear Hiring Team at [Company]".

3. **Opening Paragraph (Hook)**:
   - Lead with genuine enthusiasm for this specific company and role
   - Mention one compelling qualification that immediately establishes credibility
   - Make the reader want to continue reading
   - Do NOT start with "I am writing to apply for..." — that is boring and wastes the opening
   - 2-3 sentences

4. **Body Paragraphs (2-3 paragraphs)**:
   - Each paragraph should connect a specific achievement or skill from the CV to a requirement in the job posting
   - Use the CAR format: Challenge the candidate faced, Action they took, Result they achieved
   - Include specific metrics and numbers from the CV
   - Show understanding of the company's challenges and how the candidate can help
   - Vary sentence structure and length for readability
   - Each paragraph: 3-4 sentences

5. **Closing Paragraph**:
   - Reiterate interest and enthusiasm
   - Mention availability for an interview
   - Include a confident call to action
   - Do NOT be desperate or overly grateful — maintain professional confidence
   - 2-3 sentences

6. **Sign-off**: Professional closing (e.g., "Best regards," or "Sincerely,")

## Tone Guidelines
- Professional but warm and personable
- Confident without being arrogant
- Specific rather than generic
- The letter should feel like it could ONLY have been written by this specific candidate for this specific role
- Avoid cliches like "passionate," "synergy," "leverage," or "rockstar"
- Write in first person, active voice`;
}

// ---------------------------------------------------------------------------
// 5. Personal Pitch
// ---------------------------------------------------------------------------
export function buildPitchPrompt(
  cv: ParsedCv,
  variant: "casual" | "formal" | "technical"
): string {
  const variantInstructions = {
    casual: `
## Pitch Style: Casual / Networking Event
- Imagine you are at a tech meetup or networking event and someone asks "So, what do you do?"
- Tone: friendly, conversational, approachable
- Length: 30-45 seconds spoken (60-90 words)
- Include: your current role/focus, one notable project or achievement, what excites you about your work
- Avoid: jargon overload, sounding rehearsed, being too formal
- It should feel natural, like something you would say over coffee`,
    formal: `
## Pitch Style: Formal / Interview Setting
- Imagine you are in a job interview and asked "Tell me about yourself"
- Tone: professional, polished, structured
- Length: 45-60 seconds spoken (100-150 words)
- Structure: Who you are + Your track record + Your unique value + What you are looking for
- Include: years of experience, key domain expertise, a headline achievement with metrics, career direction
- Avoid: being stiff or robotic, listing technologies like a grocery list
- It should feel confident and well-prepared`,
    technical: `
## Pitch Style: Technical / Engineering Discussion
- Imagine you are speaking with a senior engineer or CTO who wants to understand your technical depth
- Tone: technically precise, confident, peer-to-peer
- Length: 45-60 seconds spoken (100-150 words)
- Include: your technical specialization, architecture/system design experience, scale of systems you have worked on, your engineering philosophy
- Mention specific technologies and how you have used them to solve real problems
- Avoid: buzzword salad, generic statements about "modern best practices"
- It should feel like a conversation between engineers`,
  };

  return `You are a career coach specializing in personal branding and interview preparation. Your task is to craft a compelling personal pitch (elevator pitch) for this candidate.

${formatCvForPrompt(cv)}
${variantInstructions[variant]}

## General Pitch Guidelines

1. **Open strong**: Start with a memorable hook or your core identity, not "Hi, my name is..."
2. **Show, don't tell**: Instead of saying "I'm a great problem solver," reference a specific problem you solved
3. **Include one metric**: At least one concrete number or result to demonstrate impact
4. **End with direction**: Close with what you are looking for or excited about, creating an opening for further conversation
5. **Key points**: Identify the 3-5 key talking points embedded in your pitch
6. **Delivery tips**: Provide 2-3 practical tips for delivering this pitch naturally

The pitch should feel authentic to this specific candidate's experience and personality. Do not produce a generic template.`;
}

// ---------------------------------------------------------------------------
// 6. STAR Stories
// ---------------------------------------------------------------------------
export function buildStarStoriesPrompt(
  cv: ParsedCv,
  experienceIndex: number
): string {
  const exp = cv.experience[experienceIndex];
  if (!exp) {
    return "Error: Invalid experience index provided.";
  }

  return `You are an interview preparation coach who specializes in helping candidates craft compelling STAR (Situation, Task, Action, Result) stories from their work experience. Your task is to generate 2-3 interview-ready STAR stories based on this specific work experience.

## Target Experience Entry
Title: ${exp.title}
Company: ${exp.company}
Location: ${exp.location}
Period: ${exp.start_date} - ${exp.end_date ?? "Present"}
Description: ${exp.description}
Achievements:
${exp.achievements.map((a) => `  - ${a}`).join("\n")}
Technologies Used: ${exp.technologies.join(", ")}

## Full CV Context (for understanding the candidate's overall profile)
${formatCvForPrompt(cv)}

## STAR Story Requirements

Generate 2-3 distinct STAR stories from the target experience entry. Each story should focus on a different type of achievement or skill demonstration:

### Story Structure

1. **Title**: A compelling, concise title that summarizes the achievement (e.g., "Reducing API Latency by 60% Through Architecture Redesign")

2. **Situation** (2-3 sentences):
   - Set the scene: What was happening at the company/team?
   - What was the challenge or opportunity?
   - Why did it matter? What was at stake?
   - Include enough context for the interviewer to understand the significance

3. **Task** (1-2 sentences):
   - What was YOUR specific responsibility?
   - What were you asked or expected to do?
   - Distinguish your role from the team's role

4. **Action** (3-5 sentences):
   - What specific steps did YOU take?
   - What decisions did you make and why?
   - What technologies, methodologies, or approaches did you use?
   - How did you collaborate with others or lead the effort?
   - Be detailed about YOUR individual contributions

5. **Result** (2-3 sentences):
   - What was the measurable outcome?
   - Include specific numbers: percentages, revenue impact, time saved, users affected, performance improvements
   - What did you learn? How did this impact the team or company going forward?
   - If the original achievements mention numbers, use them. If not, create reasonable and realistic estimates based on the context.

6. **Skills Demonstrated** (3-5 skills):
   - List the technical and soft skills this story demonstrates
   - These should be skills that commonly appear in job requirements

### Story Variety
- One story should highlight TECHNICAL excellence (architecture, problem-solving, innovation)
- One story should highlight IMPACT and LEADERSHIP (mentoring, driving results, cross-team collaboration)
- If creating a third story, it should highlight PROCESS IMPROVEMENT or CREATIVE PROBLEM-SOLVING

Each story should be detailed enough to fill 2-3 minutes of interview discussion and leave the interviewer impressed with the candidate's capabilities.`;
}

// ---------------------------------------------------------------------------
// 7. Strengths and Weaknesses
// ---------------------------------------------------------------------------
export function buildStrengthsWeaknessesPrompt(
  cv: ParsedCv,
  job: Job
): string {
  return `You are a senior interview coach preparing a candidate for a behavioral interview. Your task is to identify the candidate's key strengths and realistic weaknesses based on their CV, and craft prepared responses for the common "What are your strengths/weaknesses?" interview questions.

${formatCvForPrompt(cv)}

${formatJobForPrompt(job)}

## Strengths Analysis Instructions

Identify 4-5 key strengths that are:
1. **Authentic**: Clearly evidenced by the candidate's actual CV content — specific roles, achievements, or skills
2. **Relevant**: Directly applicable to the target job requirements
3. **Specific**: Not generic strengths like "hard worker" but specific capabilities like "expertise in scaling distributed systems" or "track record of mentoring junior engineers"

For each strength provide:
- **strength**: A clear, specific statement of the strength
- **example**: A concrete example from their CV that proves it — reference a specific project, role, or achievement with details
- **relevance**: Why this strength matters for the target role and a tip on how to present it in an interview (e.g., which STAR story to reference, what metrics to mention)

## Weaknesses Analysis Instructions

Identify 3-4 realistic weaknesses that:
1. **Are genuine**: Not disguised strengths like "I work too hard" — interviewers see through those
2. **Are safe**: Not dealbreakers for the role (do not pick a critical skill requirement as a weakness)
3. **Show self-awareness**: Demonstrate the candidate knows their growth areas
4. **Have a growth narrative**: Either they have already overcome this weakness or are actively improving

For each weakness provide:
- **weakness**: A genuine professional weakness or gap
- **strategy**: Either "past_overcame" (they already addressed it and can talk about the journey) or "current_improving" (they are actively working on it with specific steps)
- **response**: A 2-3 sentence interview response that:
  - Honestly acknowledges the weakness
  - Explains the specific steps taken to address it
  - Shows a positive trajectory or lesson learned
  - For "past_overcame": ends with how they now excel in that area
  - For "current_improving": ends with specific current actions (courses, practice, mentorship)

## Important Notes
- Do NOT include "perfectionism" or "working too hard" as weaknesses — these are cliches
- Weaknesses should relate to professional skills or behaviors, not personal traits
- Ensure strengths and weaknesses feel authentic and consistent with the CV content
- The prepared responses should sound natural and conversational, not scripted`;
}

// ---------------------------------------------------------------------------
// 8. Company-Specific Interview Questions
// ---------------------------------------------------------------------------
export function buildCompanyQuestionsPrompt(
  companyName: string,
  reviews: Array<{ text: string; rating?: number; source?: string }>,
  job: Job
): string {
  const reviewsText =
    reviews.length > 0
      ? `## Employee Reviews and Feedback\n${reviews
          .map(
            (r, i) =>
              `Review ${i + 1}${r.rating !== undefined ? ` (Rating: ${r.rating}/5)` : ""}${r.source ? ` [${r.source}]` : ""}:\n${r.text}`
          )
          .join("\n\n")}`
      : `## Employee Reviews\nNo employee reviews available. Base your questions on the job posting and general knowledge about the company.`;

  return `You are a career coach who specializes in company-specific interview preparation. Your task is to generate targeted interview questions that this candidate is likely to face at ${companyName}, based on the company's culture, values, tech stack, and the specific role.

${formatJobForPrompt(job)}

${reviewsText}

## Question Generation Instructions

Generate 8-12 interview questions distributed across these categories:

### 1. Technical Questions (3-4 questions)
- Based on the specific technologies and skills mentioned in the job posting
- Include at least one system design question relevant to the role's seniority level
- Include at least one question about a technology the candidate will use daily
- Frame questions as the company would ask them (practical, scenario-based rather than trivia)

### 2. Behavioral Questions (2-3 questions)
- Based on the company's values and culture indicators from reviews
- Focus on situations the candidate is likely to encounter in this role
- Use the "Tell me about a time when..." format
- Cover topics like conflict resolution, deadline pressure, cross-team collaboration, or handling failure

### 3. Culture Fit Questions (2-3 questions)
- Based on the company's work environment, collaboration style, and values
- If reviews mention specific cultural aspects (e.g., remote work, fast-paced, consensus-driven), create questions around those
- Include questions about work style preferences, team dynamics, and professional values

### 4. Role-Specific Questions (1-2 questions)
- Specific to the responsibilities and challenges of this particular role
- May include questions about prioritization, stakeholder management, or domain-specific scenarios

### 5. Company Knowledge Questions (1 question)
- A question that tests whether the candidate has researched the company
- Should be answerable with reasonable preparation but not trivially obvious

For each question, provide:
- **category**: The category from above
- **question**: The actual interview question
- **rationale**: Why this question is likely to be asked, referencing specific job requirements, company culture indicators, or review patterns. This helps the candidate understand what the interviewer is really evaluating.`;
}

// ---------------------------------------------------------------------------
// 9. Company Research Brief
// ---------------------------------------------------------------------------
export function buildCompanyBriefPrompt(
  companyName: string,
  reviews: Array<{ text: string; rating?: number; source?: string }>,
  job: Job
): string {
  const reviewsText =
    reviews.length > 0
      ? `## Available Employee Reviews\n${reviews
          .map(
            (r, i) =>
              `Review ${i + 1}${r.rating !== undefined ? ` (Rating: ${r.rating}/5)` : ""}${r.source ? ` [${r.source}]` : ""}:\n${r.text}`
          )
          .join("\n\n")}`
      : `## Employee Reviews\nNo employee reviews available. Base your brief on the job posting and general knowledge.`;

  return `You are a career research analyst preparing a comprehensive company brief for a candidate who has an interview at ${companyName}. Your goal is to help them walk into the interview well-informed and prepared to have meaningful conversations.

## Company: ${companyName}

${formatJobForPrompt(job)}

${reviewsText}

## Brief Structure Instructions

Create a thorough company brief covering:

### 1. Company Overview (overview)
Write 2-3 paragraphs covering:
- What the company does, its core products/services, and market position
- Company size, founding year if known, and growth trajectory
- Recent news, product launches, or strategic directions
- The competitive landscape and what differentiates them
- Base this on the job posting details and reviews. Do not fabricate specific financial figures unless they appear in the source material.

### 2. Culture and Values (culture_values)
List 4-6 key cultural values or work environment characteristics:
- Derive these from employee reviews and job posting language
- Be specific: instead of "good culture," say "collaborative engineering culture with strong code review practices"
- Note both positive and concerning cultural patterns

### 3. Interview Process (interview_process)
Describe what to expect:
- Typical interview stages based on the role level and company type
- Common formats (take-home assignments, whiteboard coding, behavioral rounds, system design)
- 2-3 sentences of practical advice

### 4. Pros of Working Here (pros)
List 3-5 genuine positives from employee reviews:
- Be specific and evidence-based
- Include aspects like compensation, growth opportunities, work-life balance, tech stack, team quality

### 5. Cons and Challenges (cons)
List 3-5 honest concerns from employee reviews:
- Present these as things to ask about in the interview, not reasons to avoid the company
- Include aspects like management style, growth ceiling, work-life balance issues, technical debt

### 6. Talking Points for the Interview (talking_points)
List 3-5 specific things about the company that the candidate can reference:
- Recent product launches or features
- Company mission or values they can genuinely connect with
- Industry trends the company is positioned for
- These show the interviewer that the candidate did their homework

### 7. Questions to Ask the Interviewer (questions_to_ask)
List 3-5 thoughtful questions that:
- Show genuine interest and research
- Help the candidate evaluate if the company is right for them
- Are not easily answered by a quick website visit
- Cover topics like team structure, technical challenges, growth paths, and company direction`;
}

// ---------------------------------------------------------------------------
// 10. Interview Study Material
// ---------------------------------------------------------------------------
export function buildStudyMaterialPrompt(
  companyName: string,
  role: string,
  reviews: Array<{ text: string; rating?: number; source?: string }>
): string {
  const reviewsText =
    reviews.length > 0
      ? `## Available Context from Employee Reviews\n${reviews
          .map(
            (r, i) =>
              `Review ${i + 1}${r.rating !== undefined ? ` (Rating: ${r.rating}/5)` : ""}:\n${r.text}`
          )
          .join("\n\n")}`
      : `## Context\nNo employee reviews available. Base your material on the role title and company.`;

  return `You are a technical interview preparation coach creating comprehensive study material for a candidate interviewing for the ${role} position at ${companyName}. Create a focused, actionable study guide that helps them prepare efficiently.

## Company: ${companyName}
## Target Role: ${role}

${reviewsText}

## Study Material Instructions

Create thorough interview preparation material covering:

### 1. Role Overview (role_overview)
Write 2-3 paragraphs covering:
- What a ${role} typically does day-to-day at a company like ${companyName}
- Key responsibilities and success metrics for this role
- The most important skills and knowledge areas
- How this role fits into the broader engineering/product organization
- What distinguishes a good candidate from a great one

### 2. Technical Topics to Study (technical_topics)
List 6-10 technical topics the candidate should review, each with:
- **topic**: The topic name (e.g., "System Design: Distributed Caching", "Data Structures: Trees and Graphs")
- **importance**: "must_know" (will definitely be tested), "should_know" (likely to come up), or "nice_to_know" (could differentiate you)
- **study_points**: 3-5 specific subtopics or concepts to review within this topic
- **sample_question**: A realistic interview question about this topic

Topics should be:
- Relevant to the specific role (e.g., a frontend role focuses on React/performance, a backend role on APIs/databases)
- Appropriate for the seniority level
- Based on the technologies mentioned in the role description or reviews
- Progressing from fundamental to advanced

### 3. Behavioral Scenarios to Prepare (behavioral_scenarios)
List 4-6 behavioral interview scenarios:
- **scenario**: The scenario or question type (e.g., "Describe a time you disagreed with a technical decision")
- **preparation_tip**: Specific advice on how to prepare a strong answer, including what to emphasize and what to avoid

Cover these common behavioral themes:
- Technical disagreements and resolution
- Handling ambiguity or changing requirements
- Working under pressure or tight deadlines
- Mentoring or leading others
- Dealing with failure or mistakes
- Cross-functional collaboration

### 4. Day-of Interview Tips (day_of_tips)
List 5-7 practical tips for the interview day:
- What to prepare the night before
- What to have ready for video/in-person interviews
- How to handle technical questions you don't know
- How to manage time in coding or design rounds
- Body language and communication tips
- Follow-up best practices

All material should be actionable and specific to this role and company, not generic interview advice. The candidate should be able to use this as a focused 2-3 day study plan.`;
}

// ---------------------------------------------------------------------------
// 11. CV Parsing Refinement
// ---------------------------------------------------------------------------
export function buildCvRefinementPrompt(
  rawText: string,
  heuristicResult: ParsedCv
): string {
  return `You are an expert CV parser specializing in extracting structured data from unstructured text. A heuristic parser has already made a first pass at extracting data from this CV, but it may have missed information, misclassified fields, or made errors. Your task is to produce the most accurate and complete structured representation possible.

## Raw CV Text
The following is the raw text extracted from the candidate's CV document:

---
${rawText}
---

## Heuristic Parse Result
The automated parser produced the following result. Review it carefully — some fields may be correct, some may be wrong, and some information from the raw text may have been missed entirely:

Full Name: ${heuristicResult.full_name}
Email: ${heuristicResult.email}
Phone: ${heuristicResult.phone}
Location: ${heuristicResult.location}
LinkedIn: ${heuristicResult.linkedin_url}
GitHub: ${heuristicResult.github_url}
Portfolio: ${heuristicResult.portfolio_url}
Summary: ${heuristicResult.summary}

Technical Skills: ${heuristicResult.skills.technical.join(", ") || "(none detected)"}
Soft Skills: ${heuristicResult.skills.soft.join(", ") || "(none detected)"}

Experience (${heuristicResult.experience.length} entries):
${heuristicResult.experience
    .map(
      (exp, i) =>
        `  ${i + 1}. ${exp.title} at ${exp.company} (${exp.start_date} - ${exp.end_date ?? "Present"})
     Achievements: ${exp.achievements.length} items
     Technologies: ${exp.technologies.join(", ") || "(none)"}`
    )
    .join("\n")}

Education (${heuristicResult.education.length} entries):
${heuristicResult.education
    .map(
      (edu, i) =>
        `  ${i + 1}. ${edu.degree} in ${edu.field} at ${edu.institution}`
    )
    .join("\n") || "  (none detected)"}

Certifications: ${heuristicResult.certifications.join(", ") || "(none detected)"}
Projects: ${heuristicResult.projects.length} entries
Languages: ${heuristicResult.languages.map((l) => `${l.name} (${l.level})`).join(", ") || "(none detected)"}

## Refinement Instructions

1. **Compare** the raw text against the heuristic result field by field.

2. **Correct** any errors:
   - Misspelled names or companies
   - Wrong date formats (normalize to YYYY-MM)
   - Misclassified skills (e.g., a technology listed as a soft skill)
   - Incorrectly split or merged experience entries

3. **Fill gaps**: Extract any information present in the raw text that the heuristic parser missed:
   - Skills mentioned in experience descriptions but not in the skills list
   - Technologies used in projects
   - Achievements that were parsed as description text
   - Contact information, URLs, or certifications that were missed

4. **Normalize dates**: All dates should be in YYYY-MM format. If only a year is given, use YYYY-01. If a position is current, end_date should be null.

5. **Classify skills accurately**:
   - Technical skills: programming languages, frameworks, databases, cloud platforms, tools, DevOps technologies
   - Soft skills: leadership, communication, teamwork, problem-solving, mentoring, project management

6. **Split achievement bullets**: Each achievement should be a separate entry. If the heuristic parser combined multiple achievements into one, split them. Each achievement should ideally start with an action verb.

7. **Extract technologies per role**: For each experience entry, list the specific technologies mentioned in that role's description or achievements.

8. **Preserve accuracy**: Do NOT invent information that is not in the raw text. If a field cannot be determined from the raw text, use an empty string or empty array. Do not guess.

Produce a complete, corrected ParsedCv structure with all fields populated as accurately as possible from the raw text.`;
}

// ---------------------------------------------------------------------------
// 11b. CV Parsing — Chat Refinement
// ---------------------------------------------------------------------------
export function buildCvParsingChatRefinementPrompt(
  rawText: string,
  current: ParsedCv,
  history: CvChatTurn[],
  userMessage: string,
): string {
  const transcript = history
    .map((turn) => `${turn.role === "user" ? "USER" : "ASSISTANT"}: ${turn.content}`)
    .join("\n\n");

  return `You are an expert CV parser refining a structured CV based on user feedback. The user has reviewed the parsed CV and is asking for a specific change.

## Raw CV text (source of truth for any factual claim)

---
${rawText}
---

## Current parsed CV (the structure to update)

\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

${
  transcript
    ? `## Previous chat turns\n\n${transcript}\n\n`
    : ""
}## New user instruction

${userMessage}

## What to do

Apply the user's instruction to the current parsed CV and return the COMPLETE updated ParsedCv structure.

Rules:
1. Apply only the change the user asked for. Leave every other field exactly as it was in "Current parsed CV".
2. Trust the user about facts that don't appear in the raw text — they are the candidate and know their own data. For example, if the user says "my role at Google was 2018, not 2017" or "add Spanish as a native language", apply that even if the raw text doesn't confirm it.
3. Never invent unrelated content. Don't add roles, skills, or certifications the user didn't mention.
4. Preserve date format (YYYY-MM, or YYYY-01 if only year known; null end_date for current positions).
5. Skills classification: technical = languages/frameworks/tools/platforms; soft = leadership/communication/etc.

Return the complete updated ParsedCv structure.`;
}

// ---------------------------------------------------------------------------
// DR/LATAM eligibility adjudication (ambiguous remote jobs)
// ---------------------------------------------------------------------------
export interface DrEligibilityJobInput {
  id: string;
  title: string;
  location: string;
  descriptionHead: string;
}

export function buildDrEligibilityPrompt(jobs: DrEligibilityJobInput[]): string {
  const items = jobs
    .map(
      (j, i) =>
        `Job ${i + 1}\nid: ${j.id}\ntitle: ${j.title || "(none)"}\nlocation: ${j.location || "(none)"}\ndescription: ${j.descriptionHead || "(none)"}`,
    )
    .join("\n\n---\n\n");

  return `You are screening REMOTE job postings for a software engineer based in the DOMINICAN REPUBLIC (Latin America / Caribbean).

For each job, decide whether that candidate could realistically be hired, based ONLY on geographic and work-eligibility signals in the text.

Classify each job as exactly one of:
- "explicit_latam" — explicitly welcomes Latin America, the Caribbean, or the Dominican Republic (e.g. "Remote - LATAM", "open to candidates across Latin America").
- "global_remote" — fully remote with NO geographic restriction; hires from anywhere in the world.
- "restricted" — the candidate can't be hired from the Dominican Republic: limited to the US or another non-LATAM region (US work authorization, US-based / resident / citizen, "North America only", only US / European / Asian locations); OR limited to one or more named LATAM countries/cities that do not include the Dominican Republic (e.g. "LATAM – Colombia only", "must be based in Brazil or Mexico"); OR on-site / hybrid / relocation required anywhere outside the Dominican Republic; OR explicitly excludes the Dominican Republic or the Caribbean.

CRITICAL RULES:
- A requirement to OVERLAP with a US or other time zone (EST, PST, "US business hours", "core hours") is NOT a restriction — many LATAM candidates work US hours. Never output "restricted" for time-zone or working-hours reasons alone.
- "Remote" does NOT mean worldwide. If the text says where the role, the candidate or the team is based ("a remote role based in Greece", "join our team in Athens", "remote within Germany", "must live in the EU"), and that place is not LATAM/the Caribbean/the DR, answer "restricted".
- Only answer "global_remote" when the text positively says hiring is open worldwide / from any country, or when it genuinely names no country, city or region at all. When in doubt between "global_remote" and "restricted", answer "restricted".
- A generic LATAM / Latin America / Caribbean / Americas posting with no country narrowing, no exclusion of the DR and no on-site requirement IS "explicit_latam" — the Dominican Republic is part of LATAM.
- Countries listed as examples ("LATAM, including Colombia, Mexico, etc.") or mentioned only as company offices/HQ/markets do NOT narrow eligibility.
- The Dominican Republic is also written as: DR, RD, R.D., Rep. Dom., República Dominicana, Dominicana, Quisqueya, or by its cities/areas (Santo Domingo, Distrito Nacional, Santiago de los Caballeros, Punta Cana, Bávaro, La Romana, Puerto Plata, San Pedro de Macorís, Higüey). Bare "Santiago" usually means Santiago, Chile.
- Judge only from geography and work eligibility. Ignore skills, seniority, salary, and language requirements.
- Copy each job's id verbatim into your answer.

${items}`;
}
