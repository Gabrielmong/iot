-- CreateEnum
CREATE TYPE "StreamSource" AS ENUM ('LOCAL', 'CLOUD');

-- AlterEnum
ALTER TYPE "Brand" ADD VALUE 'SWANN';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "streamSource" "StreamSource";
