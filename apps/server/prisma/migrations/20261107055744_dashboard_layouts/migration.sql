-- CreateTable
CREATE TABLE "UserDashboardLayout" (
    "userId" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDashboardLayout_pkey" PRIMARY KEY ("userId","tab")
);

-- CreateTable
CREATE TABLE "DefaultDashboardLayout" (
    "tab" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultDashboardLayout_pkey" PRIMARY KEY ("tab")
);

-- AddForeignKey
ALTER TABLE "UserDashboardLayout" ADD CONSTRAINT "UserDashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
