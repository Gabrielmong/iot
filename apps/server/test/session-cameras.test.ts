import { describe, expect, it } from "vitest";
import { SessionCameras } from "../src/cameras/streams/session-cameras.js";

describe("SessionCameras", () => {
  it("keeps per session only cameras registered now, so a set never outgrows the cameras", () => {
    let registered = ["a", "b"];
    const sessions = new SessionCameras(() => registered);
    sessions.record("s1", "u1", "a");
    sessions.record("s1", "u1", "b");
    registered = ["b", "c"]; // camera a was removed
    sessions.record("s1", "u1", "c");
    expect(sessions.take("s1")).toEqual(new Set(["b", "c"]));
  });

  it("take drops the session's record; takeUser unions and drops all of a user's sessions", () => {
    const sessions = new SessionCameras(() => ["a", "b", "c"]);
    sessions.record("s1", "u1", "a");
    sessions.record("s2", "u1", "b");
    sessions.record("s3", "u2", "c");
    expect(sessions.take("s1")).toEqual(new Set(["a"]));
    expect(sessions.take("s1")).toEqual(new Set());
    sessions.record("s1", "u1", "a");
    expect(sessions.takeUser("u1")).toEqual(new Set(["a", "b"]));
    expect(sessions.sessions()).toEqual(["s3"]);
  });

  it("forgets a removed camera everywhere", () => {
    const sessions = new SessionCameras(() => ["a", "b"]);
    sessions.record("s1", "u1", "a");
    sessions.record("s1", "u1", "b");
    sessions.forget("a");
    expect(sessions.take("s1")).toEqual(new Set(["b"]));
  });
});
