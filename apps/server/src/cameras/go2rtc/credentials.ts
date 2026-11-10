import { randomBytes } from "node:crypto";

/** Credentials for go2rtc's API (Basic auth) and its RTSP server, generated per server run. Never logged. */
export interface Go2rtcCredentials {
  username: string;
  password: string;
}

export function generateCredentials(): Go2rtcCredentials {
  return {
    username: `home-${randomBytes(16).toString("hex")}`,
    password: randomBytes(32).toString("base64url"),
  };
}

export function basicAuthHeader({ username, password }: Go2rtcCredentials): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
