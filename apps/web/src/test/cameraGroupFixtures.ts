import type { CameraGroupFieldsFragment } from '../gql/graphql'
import { liveSubscription, reply, type Handler } from './testClient'

type Opts = Partial<Omit<CameraGroupFieldsFragment, '__typename' | 'owner'>> & { owner?: { id: string; name: string; role: 'ADMIN' | 'USER' } | null }

/** A camera group as the server returns it. */
export function cameraGroupFixture(o: Opts = {}): CameraGroupFieldsFragment {
  const group = {
    __typename: 'CameraGroup',
    id: o.id ?? 'g1',
    name: o.name ?? 'Front of house',
    scope: o.scope ?? 'PERSONAL',
    layout: o.layout ?? 4,
    cameraIds: o.cameraIds ?? ['cam1'],
    audience: o.audience ?? [],
    editable: o.editable ?? true,
    owner: o.owner ? { __typename: 'User', ...o.owner } : null,
  }
  return group as CameraGroupFieldsFragment
}

/** Handlers for screens that list camera groups. */
export function cameraGroupHandlers(groups: CameraGroupFieldsFragment[] = [], others: CameraGroupFieldsFragment[] = []): Record<string, Handler> {
  return {
    CameraGroups: reply({ cameraGroups: groups }),
    OtherCameraGroups: reply({ otherCameraGroups: others }),
    CameraGroupsChanged: liveSubscription().handler,
  }
}
