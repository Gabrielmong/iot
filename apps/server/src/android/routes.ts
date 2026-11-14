import express, { type RequestHandler } from "express";
import type { PrismaClient } from "../generated/prisma/client.js";
import { getHomeName } from "../services/home-name.js";
import { readApkInfo } from "./apk-store.js";

export const IDENTITY_PATH = "/api/identity";
export const APK_PATH = "/app/home.apk";

/** Lets the Android app confirm a server is Home and learn which app version it offers. No auth. */
export function identityRouter(deps: { prisma: PrismaClient; apkDir?: string }): RequestHandler {
  const router = express.Router();
  router.get("/", async (_req, res, next) => {
    try {
      const info = readApkInfo(deps.apkDir);
      res.set("Cache-Control", "no-store");
      res.json({ app: "home-control", name: await getHomeName(deps.prisma), androidApp: info ? { versionCode: info.versionCode } : null });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

/** The APK download; a 404 of its own when there is none, so it never falls through to the web app. */
export function apkRouter(apkDir?: string): RequestHandler {
  const router = express.Router();
  router.get("/", (_req, res) => {
    const info = readApkInfo(apkDir);
    if (!info) {
      res.status(404).json({ code: "NOT_FOUND" });
      return;
    }
    res.sendFile(info.apkPath, { headers: { "Content-Type": "application/vnd.android.package-archive", "Cache-Control": "no-store" } });
  });
  return router;
}
