import type { DeviceKind } from '../gql/graphql'

/** Device kinds a guest can never be given (mirrors the server's GUEST_HIDDEN_KINDS). */
export const hiddenFromGuests = (kind: DeviceKind): boolean => kind === 'CAMERA' || kind === 'COMPUTER'
