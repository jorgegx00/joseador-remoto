export interface DefaultQuestion {
  id: string;
  questionKey: string;
  rationaleKey: string;
}

export interface QuestionCategory {
  id: string;
  labelKey: string;
  questions: DefaultQuestion[];
}

export const defaultQuestionCategories: QuestionCategory[] = [
  {
    id: "growth_retention",
    labelKey: "questions.categories.growth_retention",
    questions: [
      {
        id: "gr_1",
        questionKey: "questions.defaults.gr_1",
        rationaleKey: "questions.defaults.gr_1_rationale",
      },
      {
        id: "gr_2",
        questionKey: "questions.defaults.gr_2",
        rationaleKey: "questions.defaults.gr_2_rationale",
      },
      {
        id: "gr_3",
        questionKey: "questions.defaults.gr_3",
        rationaleKey: "questions.defaults.gr_3_rationale",
      },
      {
        id: "gr_4",
        questionKey: "questions.defaults.gr_4",
        rationaleKey: "questions.defaults.gr_4_rationale",
      },
      {
        id: "gr_5",
        questionKey: "questions.defaults.gr_5",
        rationaleKey: "questions.defaults.gr_5_rationale",
      },
    ],
  },
  {
    id: "technical_culture",
    labelKey: "questions.categories.technical_culture",
    questions: [
      {
        id: "tc_1",
        questionKey: "questions.defaults.tc_1",
        rationaleKey: "questions.defaults.tc_1_rationale",
      },
      {
        id: "tc_2",
        questionKey: "questions.defaults.tc_2",
        rationaleKey: "questions.defaults.tc_2_rationale",
      },
      {
        id: "tc_3",
        questionKey: "questions.defaults.tc_3",
        rationaleKey: "questions.defaults.tc_3_rationale",
      },
      {
        id: "tc_4",
        questionKey: "questions.defaults.tc_4",
        rationaleKey: "questions.defaults.tc_4_rationale",
      },
      {
        id: "tc_5",
        questionKey: "questions.defaults.tc_5",
        rationaleKey: "questions.defaults.tc_5_rationale",
      },
    ],
  },
  {
    id: "onboarding",
    labelKey: "questions.categories.onboarding",
    questions: [
      {
        id: "ob_1",
        questionKey: "questions.defaults.ob_1",
        rationaleKey: "questions.defaults.ob_1_rationale",
      },
      {
        id: "ob_2",
        questionKey: "questions.defaults.ob_2",
        rationaleKey: "questions.defaults.ob_2_rationale",
      },
      {
        id: "ob_3",
        questionKey: "questions.defaults.ob_3",
        rationaleKey: "questions.defaults.ob_3_rationale",
      },
    ],
  },
  {
    id: "development",
    labelKey: "questions.categories.development",
    questions: [
      {
        id: "db_1",
        questionKey: "questions.defaults.db_1",
        rationaleKey: "questions.defaults.db_1_rationale",
      },
      {
        id: "db_2",
        questionKey: "questions.defaults.db_2",
        rationaleKey: "questions.defaults.db_2_rationale",
      },
      {
        id: "db_3",
        questionKey: "questions.defaults.db_3",
        rationaleKey: "questions.defaults.db_3_rationale",
      },
      {
        id: "db_4",
        questionKey: "questions.defaults.db_4",
        rationaleKey: "questions.defaults.db_4_rationale",
      },
    ],
  },
  {
    id: "team_management",
    labelKey: "questions.categories.team_management",
    questions: [
      {
        id: "tm_1",
        questionKey: "questions.defaults.tm_1",
        rationaleKey: "questions.defaults.tm_1_rationale",
      },
      {
        id: "tm_2",
        questionKey: "questions.defaults.tm_2",
        rationaleKey: "questions.defaults.tm_2_rationale",
      },
      {
        id: "tm_3",
        questionKey: "questions.defaults.tm_3",
        rationaleKey: "questions.defaults.tm_3_rationale",
      },
      {
        id: "tm_4",
        questionKey: "questions.defaults.tm_4",
        rationaleKey: "questions.defaults.tm_4_rationale",
      },
    ],
  },
];
