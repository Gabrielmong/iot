import { graphql } from '../../gql'

export const HOME_NAME = graphql(`
  query HomeName {
    homeName
  }
`)

export const SET_HOME_NAME = graphql(`
  mutation SetHomeName($name: String!) {
    setHomeName(name: $name)
  }
`)
