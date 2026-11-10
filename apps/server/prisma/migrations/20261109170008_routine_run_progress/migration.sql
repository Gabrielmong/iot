-- AlterTable
ALTER TABLE "RoutineRun" ADD COLUMN     "currentStep" INTEGER,
ADD COLUMN     "startedBy" TEXT,
ADD COLUMN     "waitUntil" TIMESTAMP(3);
