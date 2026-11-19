-- CreateTable
CREATE TABLE "WeatherSettings" (
    "id" TEXT NOT NULL DEFAULT 'home',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "refreshMinutes" INTEGER NOT NULL DEFAULT 15,
    "staleMinutes" INTEGER NOT NULL DEFAULT 45,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeatherSettings_pkey" PRIMARY KEY ("id")
);
