import { grantableUsers, initialUserSelection } from './accessSelection'

const users = [
  { id: 'a', role: 'ADMIN' },
  { id: 'u1', role: 'USER' },
  { id: 'u2', role: 'USER' },
]

describe('accessSelection', () => {
  it('lists only non-admin users as grantable', () => {
    expect(grantableUsers(users).map((u) => u.id)).toEqual(['u1', 'u2'])
  })

  it('preselects granted non-admin users and drops admin or unknown ids', () => {
    expect([...initialUserSelection(['u1', 'a', 'gone'], users)]).toEqual(['u1'])
  })
})
