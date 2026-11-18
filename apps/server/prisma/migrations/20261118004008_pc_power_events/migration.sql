-- CreateEnum
CREATE TYPE "PowerSource" AS ENUM ('PROBE', 'AGENT');

-- CreateTable
CREATE TABLE "PowerEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "source" "PowerSource" NOT NULL DEFAULT 'PROBE',

    CONSTRAINT "PowerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PowerEvent_deviceId_at_idx" ON "PowerEvent"("deviceId", "at");

-- AddForeignKey
ALTER TABLE "PowerEvent" ADD CONSTRAINT "PowerEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
