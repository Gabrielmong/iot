-- CreateTable
CREATE TABLE "WeatherSnapshot" (
    "id" TEXT NOT NULL DEFAULT 'home',
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "WeatherSnapshot_pkey" PRIMARY KEY ("id")
);
