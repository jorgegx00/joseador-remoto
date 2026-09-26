import { z } from "zod";

// ---------------------------------------------------------------------------
// CV-Job Match Analysis
// ---------------------------------------------------------------------------
export const matchAnalysisSchema = z.object({
  overall_match: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Overall match percentage between the candidate and the job posting, from 0 (no match) to 100 (perfect match)"
    ),
  skills_match: z
    .array(
      z.object({
        skill: z
          .string()
          .describe(
            "The name of the skill from the job requirements"
          ),
        found: z
          .boolean()
          .describe(
            "Whether the candidate has this skill based on their CV"
          ),
        evidence: z
          .string()
          .describe(
            'Shortest exact quote from the CV that shows the skill (e.g. "Spring Boot"), or "" when not found'
          ),
        importance: z
          .enum(["critical", "important", "nice_to_have"])
          .describe(
            "How important this skill is for the role: critical means essential, important means strongly desired, nice_to_have means bonus"
          ),
      })
    )
    .describe(
      "Detailed breakdown of each required skill and whether the candidate possesses it"
    ),
  experience_match: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "How relevant the candidate's work experience is to the role, from 0 to 100"
    ),
  seniority_fit: z
    .enum(["under_qualified", "good_fit", "over_qualified"])
    .describe(
      "Whether the candidate's seniority level matches the role requirements"
    ),
  gaps: z
    .array(z.string())
    .describe(
      "Specific skills, experiences, or qualifications the candidate is missing for this role"
    ),
  strengths: z
    .array(z.string())
    .describe(
      "Areas where the candidate strongly matches or exceeds the job requirements"
    ),
  recommendation: z
    .string()
    .describe(
      "A concise 2-3 sentence recommendation summarizing the match and suggesting next steps"
    ),
});

// ---------------------------------------------------------------------------
// CV Narrative Report
// ---------------------------------------------------------------------------
export const narrativeReportSchema = z.object({
  summary_score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "Score from 0-10 for the quality and effectiveness of the CV's professional summary section"
    ),
  summary_feedback: z
    .string()
    .describe(
      "Detailed feedback on the professional summary: what works, what does not, and specific improvements with examples"
    ),
  achievement_score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "Score from 0-10 for how well achievements are quantified with metrics, numbers, and measurable impact"
    ),
  achievement_feedback: z
    .string()
    .describe(
      "Detailed feedback on achievement quantification: which bullets are strong, which lack metrics, and examples of how to improve them"
    ),
  star_format_score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "Score from 0-10 for how well experience bullets follow the STAR format (Situation, Task, Action, Result)"
    ),
  star_feedback: z
    .string()
    .describe(
      "Detailed feedback on STAR format usage: which bullets are well-structured and which need restructuring with examples"
    ),
  tech_per_role_score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "Score from 0-10 for how well technologies are tied to specific roles rather than listed generically"
    ),
  tech_feedback: z
    .string()
    .describe(
      "Detailed feedback on technology contextualization: whether tech skills are shown in context of actual work"
    ),
  personalization_score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "Score from 0-10 for how well the CV is tailored rather than generic, showing unique value proposition"
    ),
  personalization_feedback: z
    .string()
    .describe(
      "Detailed feedback on personalization: whether the CV tells a coherent career story and stands out from generic resumes"
    ),
  overall_impression: z
    .string()
    .describe(
      "A comprehensive 3-5 sentence overall impression of the CV, covering its strongest aspects and the most impactful changes the candidate could make"
    ),
  top_improvements: z
    .array(
      z.object({
        area: z
          .string()
          .describe(
            "The area of the CV that needs improvement (e.g. Professional Summary, Work Experience bullets, Skills section)"
          ),
        current: z
          .string()
          .describe(
            "What the CV currently says or does in this area, quoted or paraphrased"
          ),
        suggested: z
          .string()
          .describe(
            "The specific improved version or concrete suggestion for how to fix it"
          ),
      })
    )
    .describe(
      "The top 3-5 most impactful improvements ranked by potential effect on the CV's effectiveness"
    ),
});

// ---------------------------------------------------------------------------
// STAR Stories
// ---------------------------------------------------------------------------
export const starStorySchema = z.object({
  stories: z
    .array(
      z.object({
        title: z
          .string()
          .describe(
            "A compelling, concise title for this STAR story that highlights the key achievement"
          ),
        situation: z
          .string()
          .describe(
            "The context and background: what was happening, what team/company/project, what challenges existed. 2-3 sentences."
          ),
        task: z
          .string()
          .describe(
            "Your specific responsibility or goal in this situation. What were you asked to do or what did you identify needed doing. 1-2 sentences."
          ),
        action: z
          .string()
          .describe(
            "The specific actions you took to address the task. Be detailed about your individual contributions, technologies used, and approach. 3-5 sentences."
          ),
        result: z
          .string()
          .describe(
            "The measurable outcomes and impact of your actions. Include specific numbers, percentages, revenue impact, time saved, or other quantifiable results. 2-3 sentences."
          ),
        skills_demonstrated: z
          .array(z.string())
          .describe(
            "List of 3-5 technical and soft skills demonstrated in this story"
          ),
      })
    )
    .describe(
      "2-3 STAR stories derived from this work experience, each highlighting a different achievement or skill set"
    ),
});

// ---------------------------------------------------------------------------
// Strengths and Weaknesses
// ---------------------------------------------------------------------------
export const strengthsWeaknessesSchema = z.object({
  strengths: z
    .array(
      z.object({
        strength: z
          .string()
          .describe(
            "A specific professional strength relevant to the target role"
          ),
        example: z
          .string()
          .describe(
            "A concrete example from the candidate's CV that demonstrates this strength, referencing specific projects or achievements"
          ),
        relevance: z
          .string()
          .describe(
            "Why this strength matters for the target role and how to present it effectively in an interview"
          ),
      })
    )
    .describe(
      "4-5 key strengths derived from the candidate's CV that are most relevant to the target job"
    ),
  weaknesses: z
    .array(
      z.object({
        weakness: z
          .string()
          .describe(
            "A genuine professional weakness or gap that could come up in an interview"
          ),
        strategy: z
          .enum(["past_overcame", "current_improving"])
          .describe(
            "The response strategy: past_overcame means the candidate has already addressed this, current_improving means they are actively working on it"
          ),
        response: z
          .string()
          .describe(
            "A well-crafted interview response that honestly acknowledges the weakness while showing self-awareness and growth. 2-3 sentences."
          ),
      })
    )
    .describe(
      "3-4 realistic weaknesses with prepared responses using either the overcame-in-the-past or actively-improving strategy"
    ),
});

// ---------------------------------------------------------------------------
// Company-Specific Interview Questions
// ---------------------------------------------------------------------------
export const companyQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        category: z
          .string()
          .describe(
            "The category of this question: Technical, Behavioral, Culture Fit, Role-Specific, or Company Knowledge"
          ),
        question: z
          .string()
          .describe(
            "The interview question the candidate should prepare for"
          ),
        rationale: z
          .string()
          .describe(
            "Why this question is likely to be asked, based on the company's values, culture, tech stack, or role requirements"
          ),
      })
    )
    .describe(
      "8-12 interview questions tailored to this specific company and role, covering technical skills, behavioral fit, and company culture"
    ),
});

// ---------------------------------------------------------------------------
// Personal Pitch
// ---------------------------------------------------------------------------
export const pitchSchema = z.object({
  pitch: z
    .string()
    .describe(
      "A polished personal pitch / elevator pitch for the candidate. Should be 30-60 seconds when spoken aloud (roughly 75-150 words). Must highlight the candidate's unique value proposition, key achievements, and what they bring to a new role."
    ),
  key_points: z
    .array(z.string())
    .describe(
      "3-5 key talking points embedded in the pitch that the candidate should emphasize"
    ),
  tips: z
    .array(z.string())
    .describe(
      "2-3 delivery tips for how to present this pitch naturally and confidently"
    ),
});

// ---------------------------------------------------------------------------
// Cover Letter
// ---------------------------------------------------------------------------
export const coverLetterSchema = z.object({
  subject_line: z
    .string()
    .describe(
      "A compelling email subject line for the cover letter that stands out"
    ),
  greeting: z
    .string()
    .describe(
      "Professional greeting. Use hiring manager name if known, otherwise a warm generic greeting"
    ),
  opening_paragraph: z
    .string()
    .describe(
      "Hook paragraph: express enthusiasm for the specific role and company, mention how you found the position, and include a compelling preview of your qualifications. 2-3 sentences."
    ),
  body_paragraphs: z
    .array(z.string())
    .describe(
      "2-3 body paragraphs. Each should connect a specific CV achievement or skill to a job requirement, using concrete examples and metrics. Each paragraph: 3-4 sentences."
    ),
  closing_paragraph: z
    .string()
    .describe(
      "Closing paragraph: reiterate interest, mention availability for interview, and include a confident call to action. 2-3 sentences."
    ),
  sign_off: z
    .string()
    .describe(
      "Professional sign-off (e.g., 'Best regards,' or 'Sincerely,')"
    ),
});

// ---------------------------------------------------------------------------
// Company Brief
// ---------------------------------------------------------------------------
export const companyBriefSchema = z.object({
  overview: z
    .string()
    .describe(
      "A 2-3 paragraph overview of the company: what they do, their market position, size, and recent developments"
    ),
  culture_values: z
    .array(z.string())
    .describe(
      "Key cultural values and work environment characteristics, derived from reviews and public information"
    ),
  interview_process: z
    .string()
    .describe(
      "What to expect from the interview process at this company based on available information. 2-3 sentences."
    ),
  pros: z
    .array(z.string())
    .describe(
      "Top 3-5 positive aspects of working at this company based on employee reviews"
    ),
  cons: z
    .array(z.string())
    .describe(
      "Top 3-5 concerns or challenges of working at this company based on employee reviews"
    ),
  talking_points: z
    .array(z.string())
    .describe(
      "3-5 specific topics or achievements of the company that the candidate can reference in the interview to show research"
    ),
  questions_to_ask: z
    .array(z.string())
    .describe(
      "3-5 thoughtful questions the candidate can ask the interviewer that show genuine interest in the company"
    ),
});

// ---------------------------------------------------------------------------
// Study Material
// ---------------------------------------------------------------------------
export const studyMaterialSchema = z.object({
  role_overview: z
    .string()
    .describe(
      "Overview of what this role typically involves, key responsibilities, and success metrics. 2-3 paragraphs."
    ),
  technical_topics: z
    .array(
      z.object({
        topic: z
          .string()
          .describe("The technical topic or concept to study"),
        importance: z
          .enum(["must_know", "should_know", "nice_to_know"])
          .describe("How critical this topic is for the interview"),
        study_points: z
          .array(z.string())
          .describe(
            "3-5 specific points or subtopics to review within this topic"
          ),
        sample_question: z
          .string()
          .describe(
            "A sample interview question about this topic"
          ),
      })
    )
    .describe(
      "6-10 technical topics the candidate should review before the interview"
    ),
  behavioral_scenarios: z
    .array(
      z.object({
        scenario: z
          .string()
          .describe(
            "A behavioral scenario or question type commonly asked"
          ),
        preparation_tip: z
          .string()
          .describe(
            "How to prepare a strong answer for this type of question"
          ),
      })
    )
    .describe(
      "4-6 behavioral interview scenarios to prepare for"
    ),
  day_of_tips: z
    .array(z.string())
    .describe(
      "5-7 practical tips for the day of the interview: what to bring, how to dress, things to remember"
    ),
});

// ---------------------------------------------------------------------------
// CV Parsing Refinement
// ---------------------------------------------------------------------------
export const cvRefinementSchema = z.object({
  full_name: z.string().describe("The candidate's full name"),
  email: z.string().describe("The candidate's email address"),
  phone: z.string().describe("The candidate's phone number"),
  location: z
    .string()
    .describe("The candidate's location (city, state/country)"),
  linkedin_url: z
    .string()
    .describe("LinkedIn profile URL, or empty string if not found"),
  github_url: z
    .string()
    .describe("GitHub profile URL, or empty string if not found"),
  portfolio_url: z
    .string()
    .describe("Portfolio/website URL, or empty string if not found"),
  summary: z
    .string()
    .describe(
      "Professional summary or objective statement extracted from the CV"
    ),
  skills: z.object({
    technical: z
      .array(z.string())
      .describe(
        "Technical/hard skills: programming languages, frameworks, tools, platforms"
      ),
    soft: z
      .array(z.string())
      .describe(
        "Soft skills: leadership, communication, problem-solving, etc."
      ),
  }),
  experience: z
    .array(
      z.object({
        company: z.string().describe("Company or organization name"),
        location: z
          .string()
          .describe("Job location or 'Remote'"),
        title: z.string().describe("Job title"),
        start_date: z
          .string()
          .describe("Start date as written in the CV (e.g. \"08/2024\", \"January 2021\")"),
        end_date: z
          .string()
          .nullable()
          .describe("End date as written in the CV, or null if current position"),
        description: z
          .string()
          .describe("Brief description of the role"),
        achievements: z
          .array(z.string())
          .describe(
            "List of specific achievements and responsibilities as bullet points"
          ),
        technologies: z
          .array(z.string())
          .describe(
            "Technologies, tools, and frameworks used in this role"
          ),
      })
    )
    .describe("Work experience entries in reverse chronological order"),
  education: z
    .array(
      z.object({
        institution: z
          .string()
          .describe("School or university name"),
        location: z.string().describe("Institution location"),
        degree: z
          .string()
          .describe(
            "Degree type: Bachelor's, Master's, PhD, Associate's, etc."
          ),
        field: z
          .string()
          .describe("Field of study or major"),
        start_date: z
          .string()
          .describe("Start date as written in the CV, or empty string"),
        end_date: z
          .string()
          .describe("End or graduation date as written in the CV, or empty string"),
        honors: z
          .array(z.string())
          .describe(
            "Honors, awards, or notable achievements during education"
          ),
      })
    )
    .describe("Education entries"),
  certifications: z
    .array(z.string())
    .describe("Professional certifications"),
  projects: z
    .array(
      z.object({
        name: z.string().describe("Project name"),
        description: z
          .string()
          .describe("What the project does and its purpose"),
        achievements: z
          .array(z.string())
          .describe("Key achievements or results from the project"),
        technologies: z
          .array(z.string())
          .describe("Technologies used in the project"),
        url: z
          .string()
          .describe("Project URL or empty string"),
      })
    )
    .describe("Personal or notable projects"),
  languages: z
    .array(
      z.object({
        name: z.string().describe("Language name"),
        level: z
          .enum(["native", "fluent", "advanced", "intermediate", "basic"])
          .describe("Proficiency level"),
        certification: z
          .string()
          .describe(
            "Language certification (e.g. TOEFL, DELE) or empty string"
          ),
      })
    )
    .describe("Spoken languages and proficiency levels"),
});

// ---------------------------------------------------------------------------
// DR/LATAM eligibility adjudication (ambiguous remote jobs)
// ---------------------------------------------------------------------------
export const drEligibilitySchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string().describe("The job id, copied verbatim from the input"),
        eligibility: z
          .enum(["explicit_latam", "global_remote", "restricted"])
          .describe(
            "explicit_latam: posting welcomes Latin America / Caribbean / Dominican Republic. global_remote: hires from anywhere in the world with no geographic restriction. restricted: limited to the US or another non-LATAM region (e.g. requires US work authorization/residency, or is region-locked)."
          ),
        reason: z
          .string()
          .describe("Short justification (max 12 words) citing the phrase that decided it"),
      })
    )
    .describe("One classification per input job, in any order"),
});
