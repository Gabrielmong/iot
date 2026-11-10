import { graphql } from '../gql'

export const LOGIN_USERS = graphql(`
  query LoginUsers {
    loginUsers { id name avatarColor avatarImage role hasPin }
  }
`)

export const LOGIN = graphql(`
  mutation Login($userId: ID!, $pin: String!, $shared: Boolean!) {
    login(userId: $userId, pin: $pin, shared: $shared) {
      token
      user { id name avatarColor avatarImage role hasPin }
    }
  }
`)

export const LOGIN_GUEST = graphql(`
  mutation LoginGuest($userId: ID!, $shared: Boolean!) {
    loginGuest(userId: $userId, shared: $shared) {
      token
      user { id name avatarColor avatarImage role hasPin }
    }
  }
`)

export const LOGOUT = graphql(`
  mutation Logout {
    logout
  }
`)

export const ME = graphql(`
  query Me {
    me { id name avatarColor avatarImage role hasPin }
  }
`)
