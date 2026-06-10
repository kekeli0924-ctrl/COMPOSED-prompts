import { z } from 'zod';

const StudyModeEnum = z.enum([
  'cram-review',
  'multi-day-plan',
  'practice-questions',
  'concept-clarification',
  'essay-project',
]);

const AssessmentTypeEnum = z.enum([
  'test',
  'quiz',
  'paper',
  'project',
  'presentation',
  'other',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const WizardInputsSchema = z
  .object({
    provider: z.string().min(1).max(50),
    model: z.string().min(1).max(100),
    courseId: z.string().min(1).max(100).nullable(),
    courseFreeText: z.string().min(1).max(200).optional(),
    mode: StudyModeEnum,
    assessmentType: AssessmentTypeEnum,
    assessmentDate: z
      .string()
      .regex(ISO_DATE_RE, 'must be YYYY-MM-DD')
      // Format alone admits impossible dates ('2026-02-31'), which would blow up the
      // generations.assessment_date::date insert. Round-trip through UTC Date — JS
      // rolls invalid days over (Feb 31 → Mar 3), so equality pins calendar validity.
      // NaN-guarded: Zod runs refinements even when the regex already failed, so this
      // must never throw on arbitrary input.
      .refine((s) => {
        const t = new Date(`${s}T00:00:00Z`).getTime();
        return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
      }, 'must be a real calendar date'),
    hoursAvailable: z.number().positive().max(720),
    material: z.string().max(20000).optional(),
    attachedMaterialKinds: z
      .array(
        z.enum([
          'study-guide',
          'class-notes',
          'past-quiz',
          'textbook',
          'slides',
          'problem-set',
        ]),
      )
      .max(6)
      .optional(),
    confidence: z
      .union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
      ])
      .optional(),
    understanding: z.string().max(2000).optional(),
    confusion: z.string().max(2000).optional(),
    useRecap: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.courseId === null && !val.courseFreeText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'courseFreeText is required when courseId is null',
        path: ['courseFreeText'],
      });
    }
  });

export const FeedbackPayloadSchema = z.object({
  promptHash: z.string().length(64),
  provider: z.string().min(1).max(50),
  model: z.string().min(1).max(100),
  mode: StudyModeEnum,
  courseId: z.string().min(1).max(100).nullable(),
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  text: z.string().max(1000).optional(),
});
