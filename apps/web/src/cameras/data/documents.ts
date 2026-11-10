import { graphql } from '../../gql'

export const CAMERA_GROUP_FIELDS = graphql(`
  fragment CameraGroupFields on CameraGroup {
    id
    name
    scope
    layout
    cameraIds
    audience
    editable
    owner { id name role }
  }
`)

export const CAMERA_GROUPS = graphql(`
  query CameraGroups {
    cameraGroups { ...CameraGroupFields }
  }
`)

export const OTHER_CAMERA_GROUPS = graphql(`
  query OtherCameraGroups {
    otherCameraGroups { ...CameraGroupFields }
  }
`)

export const CREATE_CAMERA_GROUP = graphql(`
  mutation CreateCameraGroup($input: CameraGroupInput!) {
    createCameraGroup(input: $input) { ...CameraGroupFields }
  }
`)

export const UPDATE_CAMERA_GROUP = graphql(`
  mutation UpdateCameraGroup($id: ID!, $input: CameraGroupInput!) {
    updateCameraGroup(id: $id, input: $input) { ...CameraGroupFields }
  }
`)

export const DELETE_CAMERA_GROUP = graphql(`
  mutation DeleteCameraGroup($id: ID!) {
    deleteCameraGroup(id: $id)
  }
`)

export const CAMERA_GROUPS_CHANGED = graphql(`
  subscription CameraGroupsChanged {
    cameraGroupsChanged
  }
`)
