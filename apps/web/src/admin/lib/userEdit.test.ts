import { signOutWarning, userUpdate } from './userEdit'

const bob = { id: 'u2', name: 'Bob', avatarColor: '#fff', role: 'USER' as const }
const same = { name: 'Bob', avatarColor: '#fff', avatarImage: '', role: 'USER' as const, pin: '', clearPin: false }

describe('userEdit', () => {
  it('has no warning for a rename or color change', () => {
    expect(signOutWarning(bob, { ...same, name: 'Robert' }, false)).toBeNull()
  })

  it('warns about a role change or a new PIN', () => {
    expect(signOutWarning(bob, { ...same, role: 'ADMIN' }, false)).toBe('Changing the role or PIN signs Bob out on every device.')
    expect(signOutWarning(bob, { ...same, pin: '1234' }, false)).toMatch(/signs Bob out/)
  })

  it('uses a stronger warning when editing yourself', () => {
    expect(signOutWarning(bob, { ...same, pin: '1234' }, true)).toMatch(/You'll be signed out/)
  })

  it('sends a picture change, with an empty string to clear it', () => {
    expect(userUpdate(bob, { ...same, avatarImage: 'otter' })).toEqual({ id: 'u2', avatarImage: 'otter' })
    expect(userUpdate({ ...bob, avatarImage: 'otter' }, same)).toEqual({ id: 'u2', avatarImage: '' })
    expect(userUpdate({ ...bob, avatarImage: 'otter' }, { ...same, avatarImage: 'otter' })).toEqual({ id: 'u2' })
  })

  it('sends only the changed fields', () => {
    expect(userUpdate(bob, { ...same, name: 'Robert' })).toEqual({ id: 'u2', name: 'Robert' })
    expect(userUpdate(bob, { ...same, role: 'ADMIN', pin: '4321' })).toEqual({ id: 'u2', role: 'ADMIN', pin: '4321' })
  })

  it('sends clearPin only when a guest that has a PIN switches to No PIN', () => {
    const gus = { id: 'u3', name: 'Gus', avatarColor: '#fff', role: 'GUEST' as const, hasPin: true }
    const form = { ...same, name: 'Gus', role: 'GUEST' as const, clearPin: true }
    expect(userUpdate(gus, form)).toEqual({ id: 'u3', clearPin: true })
    expect(userUpdate({ ...gus, hasPin: false }, form)).toEqual({ id: 'u3' })
    expect(signOutWarning(gus, form, false)).toMatch(/signs Gus out/)
  })

  it('warns that becoming a guest removes cameras, routines and groups', () => {
    expect(signOutWarning(bob, { ...same, role: 'GUEST' }, false)).toMatch(/removes Bob's cameras, computers, personal routines and camera groups/)
  })
})
