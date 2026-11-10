import { CameraThumb } from '../../device/camera/CameraThumb'
import { useThumbnail } from '../../device/camera/useThumbnail'

/** A camera tile's refreshed thumbnail, filling the rest of the card. */
export function CameraTileThumb({ deviceId }: { deviceId: string }) {
  return <CameraThumb {...useThumbnail(deviceId)} fill />
}
