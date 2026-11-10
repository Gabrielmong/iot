/** Video for a camera cannot be set up now (go2rtc disabled or down, or the camera not configured). Never carries a source URL. */
export class CameraUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CameraUnavailableError";
  }
}
