-- AlterEnum
ALTER TYPE "PowerSource" ADD VALUE 'WAKE';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "agentTokenHash" TEXT,
ADD COLUMN     "agentVersion" INTEGER;

-- AlterTable
ALTER TABLE "DeviceGrant" ADD COLUMN     "power" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stats" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentEnrollment" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "AgentEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRemoval" (
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRemoval_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentEnrollment_codeHash_key" ON "AgentEnrollment"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "Device_agentTokenHash_key" ON "Device"("agentTokenHash");

-- AddForeignKey
ALTER TABLE "AgentEnrollment" ADD CONSTRAINT "AgentEnrollment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
