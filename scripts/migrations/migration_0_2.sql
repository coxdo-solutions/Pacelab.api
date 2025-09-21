
CREATE TYPE "LessonProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

ALTER TABLE "LessonProgress"
ADD COLUMN "status" "LessonProgressStatus" NOT NULL DEFAULT 'NOT_STARTED';

UPDATE "LessonProgress"
SET "status" = CASE
  WHEN "completed" = true THEN 'COMPLETED'::"LessonProgressStatus"
  WHEN "completed" = false THEN 'NOT_STARTED'::"LessonProgressStatus"
  ELSE 'NOT_STARTED'::"LessonProgressStatus"
END
WHERE "completed" IS NOT NULL;

ALTER TABLE "LessonProgress" DROP COLUMN IF EXISTS "completed";