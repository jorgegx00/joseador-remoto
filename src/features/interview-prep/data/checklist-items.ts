export interface ChecklistItem {
  id: string;
  labelKey: string;
  tipKey?: string;
}

export interface ChecklistSection {
  id: "pre_interview" | "video_call_setup" | "during_interview" | "closing" | "post_interview";
  labelKey: string;
  items: ChecklistItem[];
}

export const checklistSections: ChecklistSection[] = [
  {
    id: "pre_interview",
    labelKey: "checklist.pre_interview",
    items: [
      {
        id: "research_company",
        labelKey: "checklist.items_v2.research_company",
        tipKey: "checklist.tips.research_company",
      },
      {
        id: "review_job_description",
        labelKey: "checklist.items_v2.review_job_description",
        tipKey: "checklist.tips.review_job_description",
      },
      {
        id: "prepare_metrics",
        labelKey: "checklist.items_v2.prepare_metrics",
        tipKey: "checklist.tips.prepare_metrics",
      },
      {
        id: "practice_star",
        labelKey: "checklist.items_v2.practice_star",
        tipKey: "checklist.tips.practice_star",
      },
      {
        id: "review_pitch",
        labelKey: "checklist.items_v2.review_pitch",
        tipKey: "checklist.tips.review_pitch",
      },
      {
        id: "update_portfolio",
        labelKey: "checklist.items_v2.update_portfolio",
        tipKey: "checklist.tips.update_portfolio",
      },
      {
        id: "prepare_questions",
        labelKey: "checklist.items_v2.prepare_questions",
        tipKey: "checklist.tips.prepare_questions",
      },
      {
        id: "rest_well",
        labelKey: "checklist.items_v2.rest_well",
        tipKey: "checklist.tips.rest_well",
      },
    ],
  },
  {
    id: "video_call_setup",
    labelKey: "checklist.video_call_setup",
    items: [
      {
        id: "camera_eye_level",
        labelKey: "checklist.items_v2.camera_eye_level",
        tipKey: "checklist.tips.camera_eye_level",
      },
      {
        id: "quiet_background",
        labelKey: "checklist.items_v2.quiet_background",
        tipKey: "checklist.tips.quiet_background",
      },
      {
        id: "good_lighting",
        labelKey: "checklist.items_v2.good_lighting",
        tipKey: "checklist.tips.good_lighting",
      },
      {
        id: "headphones_tested",
        labelKey: "checklist.items_v2.headphones_tested",
        tipKey: "checklist.tips.headphones_tested",
      },
      {
        id: "test_internet",
        labelKey: "checklist.items_v2.test_internet",
        tipKey: "checklist.tips.test_internet",
      },
      {
        id: "test_audio_video",
        labelKey: "checklist.items_v2.test_audio_video",
        tipKey: "checklist.tips.test_audio_video",
      },
      {
        id: "dress_professionally",
        labelKey: "checklist.items_v2.dress_professionally",
        tipKey: "checklist.tips.dress_professionally",
      },
    ],
  },
  {
    id: "during_interview",
    labelKey: "checklist.during_interview",
    items: [
      {
        id: "active_listening",
        labelKey: "checklist.items_v2.active_listening",
        tipKey: "checklist.tips.active_listening",
      },
      {
        id: "eye_contact_camera",
        labelKey: "checklist.items_v2.eye_contact_camera",
        tipKey: "checklist.tips.eye_contact_camera",
      },
      {
        id: "smile_nod",
        labelKey: "checklist.items_v2.smile_nod",
        tipKey: "checklist.tips.smile_nod",
      },
      {
        id: "good_posture",
        labelKey: "checklist.items_v2.good_posture",
        tipKey: "checklist.tips.good_posture",
      },
      {
        id: "dont_cross_arms",
        labelKey: "checklist.items_v2.dont_cross_arms",
        tipKey: "checklist.tips.dont_cross_arms",
      },
      {
        id: "phone_silent",
        labelKey: "checklist.items_v2.phone_silent",
        tipKey: "checklist.tips.phone_silent",
      },
      {
        id: "take_notes",
        labelKey: "checklist.items_v2.take_notes",
        tipKey: "checklist.tips.take_notes",
      },
      {
        id: "be_concise",
        labelKey: "checklist.items_v2.be_concise",
        tipKey: "checklist.tips.be_concise",
      },
    ],
  },
  {
    id: "closing",
    labelKey: "checklist.closing",
    items: [
      {
        id: "thank_interviewer",
        labelKey: "checklist.items_v2.thank_interviewer",
        tipKey: "checklist.tips.thank_interviewer",
      },
      {
        id: "reinforce_interest",
        labelKey: "checklist.items_v2.reinforce_interest",
        tipKey: "checklist.tips.reinforce_interest",
      },
      {
        id: "ask_next_steps",
        labelKey: "checklist.items_v2.ask_next_steps",
        tipKey: "checklist.tips.ask_next_steps",
      },
      {
        id: "ask_anything_else",
        labelKey: "checklist.items_v2.ask_anything_else",
        tipKey: "checklist.tips.ask_anything_else",
      },
    ],
  },
  {
    id: "post_interview",
    labelKey: "checklist.post_interview",
    items: [
      {
        id: "send_thank_you",
        labelKey: "checklist.items_v2.send_thank_you",
        tipKey: "checklist.tips.send_thank_you",
      },
      {
        id: "record_feedback",
        labelKey: "checklist.items_v2.record_feedback",
        tipKey: "checklist.tips.record_feedback",
      },
      {
        id: "note_questions_asked",
        labelKey: "checklist.items_v2.note_questions_asked",
        tipKey: "checklist.tips.note_questions_asked",
      },
      {
        id: "reflect_performance",
        labelKey: "checklist.items_v2.reflect_performance",
        tipKey: "checklist.tips.reflect_performance",
      },
      {
        id: "follow_up",
        labelKey: "checklist.items_v2.follow_up",
        tipKey: "checklist.tips.follow_up",
      },
    ],
  },
];

export const TOTAL_CHECKLIST_ITEMS = checklistSections.reduce(
  (acc, section) => acc + section.items.length,
  0,
);
