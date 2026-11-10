-- CreateTable
CREATE TABLE "CameraGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RoutineScope" NOT NULL,
    "ownerId" TEXT,
    "createdById" TEXT,
    "layout" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CameraGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraGroupMember" (
    "groupId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CameraGroupMember_pkey" PRIMARY KEY ("groupId","deviceId")
);

-- CreateTable
CREATE TABLE "CameraGroupAudience" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CameraGroupAudience_pkey" PRIMARY KEY ("groupId","userId")
);

-- AddForeignKey
ALTER TABLE "CameraGroup" ADD CONSTRAINT "CameraGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraGroup" ADD CONSTRAINT "CameraGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraGroupMember" ADD CONSTRAINT "CameraGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CameraGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraGroupMember" ADD CONSTRAINT "CameraGroupMember_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraGroupAudience" ADD CONSTRAINT "CameraGroupAudience_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CameraGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraGroupAudience" ADD CONSTRAINT "CameraGroupAudience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
