import { graphql } from '../../gql'

export const ADMIN_DEVICE_FIELDS = graphql(`
  fragment AdminDeviceFields on AdminDevice {
    id
    name
    brand
    kind
    model
    ip
    adopted
    room { id name }
    parentId
    status
    hasKey
    lastSeenAt
    online
    testable
    testBlockedReason
    mac
  }
`)

export const ADMIN_DEVICES = graphql(`
  query AdminDevices {
    adminDevices { ...AdminDeviceFields }
  }
`)

export const ADOPT_DEVICE = graphql(`
  mutation AdoptDevice($id: ID!, $name: String!, $roomId: ID, $kind: DeviceKind) {
    adoptDevice(id: $id, name: $name, roomId: $roomId, kind: $kind) { ...AdminDeviceFields }
  }
`)

export const UPDATE_DEVICE = graphql(`
  mutation UpdateDevice($id: ID!, $name: String, $roomId: ID, $kind: DeviceKind) {
    updateDevice(id: $id, name: $name, roomId: $roomId, kind: $kind) { ...AdminDeviceFields }
  }
`)

export const REMOVE_DEVICE = graphql(`
  mutation RemoveDevice($id: ID!) {
    removeDevice(id: $id)
  }
`)

export const SET_TUYA_LOCAL_KEY = graphql(`
  mutation SetTuyaLocalKey($deviceId: ID!, $localKey: String!) {
    setTuyaLocalKey(deviceId: $deviceId, localKey: $localKey) { ...AdminDeviceFields }
  }
`)

export const ADD_KASA_BY_IP = graphql(`
  mutation AddKasaByIp($ip: String!) {
    addKasaByIp(ip: $ip) { ...AdminDeviceFields }
  }
`)

export const CREATE_ROOM = graphql(`
  mutation CreateRoom($name: String!) {
    createRoom(name: $name) { id name sortOrder }
  }
`)

export const UPDATE_ROOM = graphql(`
  mutation UpdateRoom($id: ID!, $name: String, $sortOrder: Int) {
    updateRoom(id: $id, name: $name, sortOrder: $sortOrder) { id name sortOrder }
  }
`)

export const DELETE_ROOM = graphql(`
  mutation DeleteRoom($id: ID!) {
    deleteRoom(id: $id)
  }
`)

export const USERS = graphql(`
  query Users {
    users { id name avatarColor avatarImage role hasPin }
  }
`)

export const CREATE_USER = graphql(`
  mutation CreateUser($name: String!, $pin: String, $role: Role!, $avatarColor: String!, $avatarImage: String) {
    createUser(name: $name, pin: $pin, role: $role, avatarColor: $avatarColor, avatarImage: $avatarImage) { id name avatarColor avatarImage role hasPin }
  }
`)

export const UPDATE_USER = graphql(`
  mutation UpdateUser($id: ID!, $name: String, $role: Role, $avatarColor: String, $avatarImage: String, $pin: String, $clearPin: Boolean) {
    updateUser(id: $id, name: $name, role: $role, avatarColor: $avatarColor, avatarImage: $avatarImage, pin: $pin, clearPin: $clearPin) { id name avatarColor avatarImage role hasPin }
  }
`)

export const DELETE_USER = graphql(`
  mutation DeleteUser($id: ID!) {
    deleteUser(id: $id)
  }
`)

export const GRANTS = graphql(`
  query Grants($userId: ID!) {
    grants(userId: $userId)
  }
`)

export const SET_GRANTS = graphql(`
  mutation SetGrants($userId: ID!, $deviceIds: [ID!]!) {
    setGrants(userId: $userId, deviceIds: $deviceIds)
  }
`)

export const INTEGRATIONS = graphql(`
  query Integrations {
    integrations { tuyaCloudConfigured kasaConfigured swannConfigured xweatherConfigured googleMapsConfigured tuyaLastSyncAt kasaLastSavedAt swannLastSyncAt }
  }
`)

export const SET_TUYA_CLOUD = graphql(`
  mutation SetTuyaCloud($accessId: String!, $accessSecret: String!, $region: String!) {
    setTuyaCloud(accessId: $accessId, accessSecret: $accessSecret, region: $region) { tuyaCloudConfigured kasaConfigured }
  }
`)

export const SYNC_TUYA_KEYS = graphql(`
  mutation SyncTuyaKeys {
    syncTuyaKeys { matched unmatched found }
  }
`)

export const SET_SWANN_RECORDER = graphql(`
  mutation SetSwannRecorder($host: String!, $username: String!, $password: String!) {
    setSwannRecorder(host: $host, username: $username, password: $password) { channels codecs }
  }
`)

export const SET_KASA_CREDENTIALS = graphql(`
  mutation SetKasaCredentials($username: String!, $password: String!) {
    setKasaCredentials(username: $username, password: $password) { tuyaCloudConfigured kasaConfigured }
  }
`)

export const SET_XWEATHER_CREDENTIALS = graphql(`
  mutation SetXweatherCredentials($clientId: String!, $clientSecret: String!) {
    setXweatherCredentials(clientId: $clientId, clientSecret: $clientSecret) { xweatherConfigured }
  }
`)

export const TEST_XWEATHER = graphql(`
  mutation TestXweather {
    testXweather
  }
`)

export const SET_GOOGLE_MAPS_KEY = graphql(`
  mutation SetGoogleMapsKey($apiKey: String!) {
    setGoogleMapsKey(apiKey: $apiKey) { googleMapsConfigured }
  }
`)

export const WEATHER_SETTINGS = graphql(`
  query WeatherSettings {
    weatherSettings { lat lng address refreshMinutes staleMinutes enabled lastError }
    weather { status updatedAt }
  }
`)

export const UPDATE_WEATHER_SETTINGS = graphql(`
  mutation UpdateWeatherSettings($input: WeatherSettingsInput!) {
    updateWeatherSettings(input: $input) { lat lng address refreshMinutes staleMinutes enabled lastError }
  }
`)

export const MAPS_API_KEY = graphql(`
  query MapsApiKey {
    mapsApiKey
  }
`)

export const START_DEVICE_TRIAL = graphql(`
  mutation StartDeviceTrial($id: ID!) {
    startDeviceTrial(id: $id) { deviceId state { online on } }
  }
`)

export const SET_TRIAL_STATE = graphql(`
  mutation SetTrialState($id: ID!, $on: Boolean!) {
    setTrialState(id: $id, on: $on) { deviceId state { online on } }
  }
`)

export const END_DEVICE_TRIAL = graphql(`
  mutation EndDeviceTrial($id: ID!) {
    endDeviceTrial(id: $id)
  }
`)
