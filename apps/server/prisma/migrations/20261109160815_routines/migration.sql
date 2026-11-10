-- CreateEnum
CREATE TYPE "RoutineScope" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'OK', 'PARTIAL', 'FAILED', 'INTERRUPTED', 'STOPPED');

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RoutineScope" NOT NULL,
    "ownerId" TEXT,
    "createdById" TEXT,
    "roomId" TEXT,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineSchedule" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "minuteOfDay" INTEGER NOT NULL,
    "days" INTEGER[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoutineSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineAudience" (
    "routineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RoutineAudience_pkey" PRIMARY KEY ("routineId","userId")
);

-- CreateTable
CREATE TABLE "RoutineRun" (
    "routineId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "problems" JSONB NOT NULL,

    CONSTRAINT "RoutineRun_pkey" PRIMARY KEY ("routineId")
);

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineSchedule" ADD CONSTRAINT "RoutineSchedule_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineAudience" ADD CONSTRAINT "RoutineAudience_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineAudience" ADD CONSTRAINT "RoutineAudience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
