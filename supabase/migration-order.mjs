/**
 * The order the migrations must be applied in, taken from each file's own
 * "Run AFTER" header.
 *
 * Shared, so that the runner and the lint that checks for re-run hazards agree
 * about what "later" means. A new migration goes here and nowhere else.
 */
export const MIGRATION_ORDER = [
  'schema.sql',
  'marketplace.sql',
  'payments.sql',
  'platform.sql',
  'assessments.sql',
  'classes-forum.sql',
  'classes-followup.sql',
  'multi-role.sql',
  'family.sql',
  'scheduling.sql',
  'assessment-modes.sql',
  'assessment-timing.sql',
  'assessment-marking.sql',
  'content-and-help.sql',
  'audit.sql',
  'messaging.sql',
  'analytics.sql',
  'refunds.sql',
  'badges.sql',
  'question-types.sql',
  'public-site.sql',
  'taxonomy.sql',
  'learning-twin.sql',
  'economy.sql',
  'consent.sql',
]
