-- CreateEnum
CREATE TYPE "ScheduleAnchor" AS ENUM ('CLOCK', 'SUNRISE', 'SUNSET');

-- AlterTable
ALTER TABLE "RoutineSchedule" ADD COLUMN     "anchor" "ScheduleAnchor" NOT NULL DEFAULT 'CLOCK',
ADD COLUMN     "offsetMinutes" INTEGER NOT NULL DEFAULT 0;
