-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GUEST';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "pinHash" DROP NOT NULL;
