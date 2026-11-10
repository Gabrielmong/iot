import type { AdminDeviceFieldsFragment } from '../gql/graphql'

export type AdminDeviceOpts = Partial<
  Pick<AdminDeviceFieldsFragment, 'id' | 'name' | 'brand' | 'kind' | 'model' | 'ip' | 'adopted' | 'parentId' | 'status' | 'hasKey' | 'lastSeenAt' | 'room' | 'online' | 'testable' | 'testBlockedReason' | 'mac'>
>

/** An admin device as the server returns it (with `__typename`s so the Apollo cache normalizes it). */
export function adminDeviceFixture(o: AdminDeviceOpts = {}): AdminDeviceFieldsFragment {
  const room = o.room === undefined ? null : o.room
  return {
    __typename: 'AdminDevice',
    id: o.id ?? 'd1',
    name: o.name ?? 'Smart plug',
    brand: o.brand ?? 'TUYA',
    kind: o.kind ?? 'PLUG',
    model: o.model ?? 'SP10',
    ip: o.ip ?? '192.168.1.20',
    adopted: o.adopted ?? false,
    room: room && { __typename: 'Room', ...room },
    parentId: o.parentId ?? null,
    status: o.status ?? 'OK',
    hasKey: o.hasKey ?? true,
    lastSeenAt: o.lastSeenAt ?? null,
    online: o.online ?? true,
    testable: o.testable ?? false,
    testBlockedReason: o.testBlockedReason ?? null,
    mac: o.mac ?? null,
  } as AdminDeviceFieldsFragment
}

export const roomFixture = (id: string, name: string, sortOrder: number) => ({ __typename: 'Room', id, name, sortOrder })

export const userFixture = (id: string, name: string, role: 'ADMIN' | 'USER' | 'GUEST' = 'USER', hasPin = role !== 'GUEST') => ({
  __typename: 'User',
  id,
  name,
  avatarColor: '#1e88e5',
  avatarImage: null,
  role,
  hasPin,
})
