-- AlterTable
ALTER TABLE "RoutineRun" ADD COLUMN     "currentPath" JSONB NOT NULL DEFAULT '[]';
