// File: ui/framework/document-task-type-definitions.js
// --------------------------------------------------
// 1.  Task-type catalogue (unchanged)
// 2.  Validation helper: validateUniqueDataSourcesPerTask
// 3.  Public utility   : getStageIdForDataSource (calls the validator)
// --------------------------------------------------

/* 1. TASK-TYPE CATALOGUE */
export const DOC_TASK_TYPE_DEFINITIONS = [
  {
    taskType: "rfp_question_list_new_framework",
    displayLabel: "RFP Workflow",
    description:
      "5-stage RFP workflow for importing questions, analysing then using AI to answer the RFP questionnaire.",
    iconClass: "fas fa-list",
    color: "project-color-2",
    stages: [
      {
        stageId: "rfp_stage_1_upload_question_lists",
        stageName: "Upload",
        stageType: "custom_form",
        formModule: "stage-form-rfp-question-import.js"
      },
      {
        stageId: "rfp_stage_2_initial_review",
        stageName: "Strategy",
        stageType: "custom_form",
        formModule: "stage-form-rfp-initial-review.js"
      },
      {
        stageId: "rfp_stage_3_answer_questions",
        stageName: "Answer",
        stageType: "custom_form",
        formModule: "stage-form-rfp-answer-questions.js",
        dataSourceName: "questions" // <- unique tag within this taskType
      },
      {
        stageId: "rfp_stage_4_review_of_answers",
        stageName: "Review",
        stageType: "custom_form",
        formModule: "stage-form-rfp-review-of-answers.js"
      },
      {
        stageId: "rfp_stage_5_metadata",
        stageName: "Submission",
        stageType: "custom_form",
        formModule: "stage-form-rfp-metadata.js"
      }
    ]
  },
  {
    taskType: "security_questionnaire_workflow",
    displayLabel: "Security Questionnaire",
    description: "4-stage security assessment workflow for compliance questionnaires and operational audits.",
    iconClass: "fas fa-shield-alt",
    color: "project-color-4",
    stages: [
      {
        stageId: "security_stage_1_upload_questions",
        stageName: "Upload",
        stageType: "custom_form",
        formModule: "stage-form-security-question-import.js"
      },
      {
        stageId: "security_stage_2_initial_review",
        stageName: "Analysis",
        stageType: "custom_form",
        formModule: "stage-form-security-initial-review.js"
      },
      {
        stageId: "security_stage_3_answer_questions",
        stageName: "Answer",
        stageType: "custom_form",
        formModule: "stage-form-rfp-answer-questions.js",
        dataSourceName: "security_questions"
      },
      {
        stageId: "security_stage_4_review_of_answers",
        stageName: "Review",
        stageType: "custom_form",
        formModule: "stage-form-security-review-of-answers.js"
      }
    ]
  }
];

/* --------------------------------------------------
 * 2. VALIDATION HELPER
 * --------------------------------------------------
 * Confirms that a given taskType does **not** declare the same
 * `dataSourceName` more than once across its stages.
 */
export function validateUniqueDataSourcesPerTask(taskType) {
  const taskDef = DOC_TASK_TYPE_DEFINITIONS.find(
    t => t.taskType === taskType
  );
  if (!taskDef) {
    throw new Error(`Unknown taskType "${taskType}".`);
  }

  const seen = new Set();
  taskDef.stages.forEach(({ dataSourceName }) => {
    if (!dataSourceName) return; // skip un-tagged stages
    if (seen.has(dataSourceName)) {
      throw new Error(
        `dataSourceName "${dataSourceName}" appears multiple times in ` +
        `taskType "${taskType}". Each data source must be unique within a task definition.`
      );
    }
    seen.add(dataSourceName);
  });
}

/* --------------------------------------------------
 * 3. PUBLIC UTILITY
 * --------------------------------------------------
 * Returns the stageId responsible for a particular data source
 * inside a specified taskType.  Per-call validation guarantees
 * uniqueness and guards against configuration drift.
 */
export function getStageIdForDataSource(taskType, dataSourceName) {
  // Fail fast if the task’s definition is mis-configured.
  validateUniqueDataSourcesPerTask(taskType);

  const taskDef = DOC_TASK_TYPE_DEFINITIONS.find(
    t => t.taskType === taskType
  );

  const matches = taskDef.stages.filter(
    s => s.dataSourceName === dataSourceName
  );

  if (matches.length === 0) {
    throw new Error(
      `dataSourceName "${dataSourceName}" not found in taskType "${taskType}".`
    );
  }

  /* The duplicate-check above should guarantee matches.length === 1,
     but keep the defensive guard in case validateUniqueDataSourcesPerTask
     is bypassed elsewhere. */
  if (matches.length > 1) {
    throw new Error(
      `Internal configuration error: dataSourceName "${dataSourceName}" occurs ` +
      `${matches.length} times in taskType "${taskType}".`
    );
  }

  return matches[0].stageId;
}
