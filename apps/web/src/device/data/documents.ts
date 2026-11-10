import { graphql } from '../../gql'

/** Everything in the dashboard's `DeviceFields` (so `deviceState` events normalise into it) plus the detail-only fields. */
export const DEVICE = graphql(`
  query Device($id: ID!) {
    device(id: $id) {
      ...DeviceFields
      lastSeenAt
      connection
      streamSource
      ip
    }
  }
`)

export const DEVICE_GRANTS = graphql(`
  query DeviceGrants($deviceId: ID!) {
    deviceGrants(deviceId: $deviceId)
  }
`)

export const SET_DEVICE_GRANTS = graphql(`
  mutation SetDeviceGrants($deviceId: ID!, $userIds: [ID!]!) {
    setDeviceGrants(deviceId: $deviceId, userIds: $userIds)
  }
`)

/** Both return the camera's new source, which the cache merges into the page's Device. */
export const SET_CAMERA_ONVIF = graphql(`
  mutation SetCameraOnvif($deviceId: ID!, $username: String!, $password: String!, $confirmAddress: String) {
    setCameraOnvif(deviceId: $deviceId, username: $username, password: $password, confirmAddress: $confirmAddress) {
      id
      connection
      streamSource
    }
  }
`)

export const CLEAR_CAMERA_ONVIF = graphql(`
  mutation ClearCameraOnvif($deviceId: ID!) {
    clearCameraOnvif(deviceId: $deviceId) {
      id
      connection
      streamSource
    }
  }
`)

export const CAMERA_CONTROLS_FIELDS = graphql(`
  fragment CameraControlsFields on CameraControls {
    deviceId
    pan
    presets {
      slot
      saved
    }
    supported
    settings {
      nightVision
      privacy
      flip
      followMotion
      timestamp
      statusLight
      motionDetection
      wdr
    }
  }
`)

/** null: no known controls (fixed Swann cameras, unreadable Tuya ones). */
export const CAMERA_CONTROLS = graphql(`
  query CameraControls($deviceId: ID!) {
    cameraControls(deviceId: $deviceId) {
      ...CameraControlsFields
    }
  }
`)

export const MOVE_CAMERA = graphql(`
  mutation MoveCamera($deviceId: ID!, $direction: PanDirection!) {
    moveCamera(deviceId: $deviceId, direction: $direction)
  }
`)

export const STOP_CAMERA = graphql(`
  mutation StopCamera($deviceId: ID!) {
    stopCamera(deviceId: $deviceId)
  }
`)

export const GOTO_CAMERA_PRESET = graphql(`
  mutation GotoCameraPreset($deviceId: ID!, $slot: Int!) {
    gotoCameraPreset(deviceId: $deviceId, slot: $slot)
  }
`)

export const SAVE_CAMERA_PRESET = graphql(`
  mutation SaveCameraPreset($deviceId: ID!, $slot: Int!) {
    saveCameraPreset(deviceId: $deviceId, slot: $slot) {
      ...CameraControlsFields
    }
  }
`)

export const SET_CAMERA_SETTINGS = graphql(`
  mutation SetCameraSettings($deviceId: ID!, $settings: CameraSettingsInput!) {
    setCameraSettings(deviceId: $deviceId, settings: $settings) {
      ...CameraControlsFields
    }
  }
`)
