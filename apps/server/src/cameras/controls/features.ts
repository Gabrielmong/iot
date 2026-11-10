import { CAMERA_CONTROL_CODES, type CameraFeatures, type CameraFeatureSpec } from "@home/protocols";
import { asObject } from "../../json.js";
import type { Prisma } from "../../generated/prisma/client.js";

const CATALOG: ReadonlySet<string> = new Set(CAMERA_CONTROL_CODES);

function validSpec(v: unknown): CameraFeatureSpec | undefined {
  const spec = asObject(v as Prisma.JsonValue);
  if (spec.type === "bool") return { type: "bool" };
  if (spec.type === "enum" && Array.isArray(spec.range) && spec.range.every((r) => typeof r === "string")) return { type: "enum", range: spec.range as string[] };
  return undefined;
}

/** The camera's stored controllable features (`config.cameraFeatures`), with malformed entries dropped. */
export function cameraFeaturesOf(config: unknown): CameraFeatures | undefined {
  const stored = asObject(asObject(config as Prisma.JsonValue).cameraFeatures as Prisma.JsonValue);
  const features: CameraFeatures = {};
  for (const [code, value] of Object.entries(stored)) {
    const spec = CATALOG.has(code) ? validSpec(value) : undefined;
    if (spec) features[code as keyof CameraFeatures] = spec;
  }
  return Object.keys(features).length > 0 ? features : undefined;
}
