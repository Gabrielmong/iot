import { badInput } from "../api-errors.js";
import { isValidPin } from "../auth/pin.js";

const MAX_NAME = 40;
const COLOR = /^#[0-9a-f]{6}$/i;

/** A trimmed, non-empty display name (users, rooms, devices). */
export function parseName(name: string, what = "Name"): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME) throw badInput(`${what} must be 1-${MAX_NAME} characters`);
  return trimmed;
}

export function parsePin(pin: string): string {
  if (!isValidPin(pin)) throw badInput("PIN must be 4 to 8 digits");
  return pin;
}

/** The built-in profile pictures (ids of the web app's avatar images). */
export const AVATAR_IMAGES = ["beaded-dragon", "cat", "crow", "godzilla", "otter"] as const;

/** A known picture id; "" means no picture (null). */
export function parseAvatarImage(image: string): string | null {
  if (image === "") return null;
  if (!(AVATAR_IMAGES as readonly string[]).includes(image)) throw badInput("Unknown profile picture");
  return image;
}

export function parseColor(color: string): string {
  if (!COLOR.test(color)) throw badInput("Colour must look like #1a2b3c");
  return color;
}
