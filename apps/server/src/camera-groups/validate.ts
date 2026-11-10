import { badInput } from "../api-errors.js";
import { parseName } from "../services/user-input.js";

export const LAYOUTS = [1, 2, 4, 6, 8, 16] as const;
export const MAX_CAMERAS = 16;

export type GroupFields = { name: string; layout: number; cameraIds: string[] };

/** Shape checks only (no database): name, layout, and 1–16 distinct cameras. */
export function parseGroupInput(input: GroupFields): GroupFields {
  const name = parseName(input.name, "Group name");
  if (!(LAYOUTS as readonly number[]).includes(input.layout)) throw badInput("Pick a layout of 1, 2, 4, 6, 8 or 16");
  if (input.cameraIds.length === 0 || input.cameraIds.length > MAX_CAMERAS) throw badInput(`A group needs 1 to ${MAX_CAMERAS} cameras`);
  if (new Set(input.cameraIds).size !== input.cameraIds.length) throw badInput("A camera can appear only once");
  return { name, layout: input.layout, cameraIds: [...input.cameraIds] };
}
