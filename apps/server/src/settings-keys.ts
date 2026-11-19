/** Keys of `Setting` rows. Every value is stored with encryptSecret unless noted. */
export const SettingKey = {
  /** The household's display name (plain text; shown before sign-in). */
  homeName: "home.name",
  /** TP-Link account email (encrypted). */
  kasaUsername: "kasa.username",
  /** TP-Link account password (encrypted). */
  kasaPassword: "kasa.password",
  /** Tuya IoT platform Access ID (encrypted). */
  tuyaAccessId: "tuya.accessId",
  /** Tuya IoT platform Access Secret (encrypted). */
  tuyaAccessSecret: "tuya.accessSecret",
  /** Tuya data centre: us, eu, cn or in (encrypted). */
  tuyaRegion: "tuya.region",
  /** Swann recorder IP (encrypted). */
  swannHost: "swann.host",
  /** Swann recorder login name (encrypted). */
  swannUsername: "swann.username",
  /** Swann recorder password (encrypted). */
  swannPassword: "swann.password",
  /** JSON probe result {template, channels} (encrypted for uniformity; not itself secret). */
  swannProbe: "swann.probe",
  /** Xweather API client ID (encrypted). */
  xweatherClientId: "xweather.clientId",
  /** Xweather API client secret (encrypted). */
  xweatherClientSecret: "xweather.clientSecret",
  /** Google Maps JavaScript API key (encrypted; handed to admins to draw the map). */
  googleMapsApiKey: "google.mapsApiKey",
  /** A camera's ONVIF login, JSON {username, password} (encrypted). Deleted with the device. */
  cameraOnvif: (deviceId: string) => `camera.${deviceId}.onvif`,
} as const;
