import { createPrisma } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const TEST_DB = "home_test";
let client: PrismaClient | undefined;

function testUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set");
  const name = new URL(url).pathname.replace(/^\//, "");
  if (name !== TEST_DB) throw new Error(`Refusing to reset: database must be ${TEST_DB}`);
  return url;
}

/** Truncates every table in home_test and returns a client bound to it. */
export async function resetDb(): Promise<PrismaClient> {
  const url = testUrl();
  client ??= createPrisma(url);
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE "DeviceGrant", "Session", "Device", "Room", "Setting", "User", "UserDashboardLayout", "DefaultDashboardLayout", "Routine", "RoutineSchedule", "RoutineAudience", "RoutineRun", "CameraGroup", "CameraGroupMember", "CameraGroupAudience", "PowerEvent", "AgentEnrollment", "AgentRemoval", "WeatherSettings", "WeatherSnapshot" RESTART IDENTITY CASCADE',
  );
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
