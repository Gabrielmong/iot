import type { CameraFeatures } from "@home/protocols";
import { describe, expect, it } from "vitest";
import { moveProps, settingsFromValues, settingsToProps, supportedSettings } from "../src/cameras/controls/commands.js";
import { cameraFeaturesOf } from "../src/cameras/controls/features.js";

const FEATURES: CameraFeatures = {
  ptz_control: { type: "enum", range: ["0", "2", "4", "6"] },
  basic_nightvision: { type: "enum", range: ["0", "1", "2"] },
  basic_flip: { type: "bool" },
  basic_private: { type: "bool" },
};

describe("camera commands", () => {
  it("maps each direction through PTZ_VALUES", () => {
    expect(moveProps("UP")).toEqual({ ptz_control: "0" });
    expect(moveProps("RIGHT")).toEqual({ ptz_control: "2" });
    expect(moveProps("DOWN")).toEqual({ ptz_control: "4" });
    expect(moveProps("LEFT")).toEqual({ ptz_control: "6" });
  });

  it("settingsToProps maps nightVision through NIGHT_VISION_VALUES and booleans as-is", () => {
    expect(settingsToProps({ nightVision: "ON", flip: false }, FEATURES)).toEqual({ basic_nightvision: "2", basic_flip: false });
    expect(settingsToProps({ nightVision: "AUTO" }, FEATURES)).toEqual({ basic_nightvision: "0" });
  });

  it("settingsToProps rejects a setting the camera lacks", () => {
    expect(() => settingsToProps({ statusLight: true }, FEATURES)).toThrow("This camera can't do that");
  });

  it("settingsToProps rejects an empty patch", () => {
    expect(() => settingsToProps({}, FEATURES)).toThrow();
  });

  it("settingsFromValues reads supported settings and leaves the rest null", () => {
    expect(settingsFromValues({ basic_nightvision: "1", basic_flip: true, basic_private: false, basic_osd: true }, FEATURES)).toEqual({
      nightVision: "OFF",
      privacy: false,
      flip: true,
      followMotion: null,
      timestamp: null,
      statusLight: null,
      motionDetection: null,
      wdr: null,
    });
  });

  it("settingsFromValues gives null for an unexpected value", () => {
    expect(settingsFromValues({ basic_nightvision: "9", basic_flip: "yes" }, FEATURES)).toMatchObject({ nightVision: null, flip: null });
  });

  it("supportedSettings lists the camera's settings, without privacy for non-admins", () => {
    expect(supportedSettings(FEATURES, true)).toEqual(["nightVision", "privacy", "flip"]);
    expect(supportedSettings(FEATURES, false)).toEqual(["nightVision", "flip"]);
  });
});

describe("cameraFeaturesOf", () => {
  it("reads the stored features", () => {
    expect(cameraFeaturesOf({ version: "3.4", cameraFeatures: FEATURES })).toEqual(FEATURES);
  });

  it("drops malformed entries", () => {
    expect(
      cameraFeaturesOf({
        cameraFeatures: { basic_flip: { type: "bool" }, siren_switch: { type: "bool" }, basic_osd: { type: "enum" }, basic_nightvision: { type: "enum", range: [1] }, motion_switch: "x" },
      }),
    ).toEqual({ basic_flip: { type: "bool" } });
  });

  it("is undefined without features", () => {
    expect(cameraFeaturesOf({})).toBeUndefined();
    expect(cameraFeaturesOf(null)).toBeUndefined();
    expect(cameraFeaturesOf({ cameraFeatures: { siren_switch: { type: "bool" } } })).toBeUndefined();
  });
});
