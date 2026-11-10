import { graphql } from '../../gql'

export const UPDATE_PROFILE = graphql(`
  mutation UpdateProfile($name: String, $avatarColor: String, $avatarImage: String) {
    updateProfile(name: $name, avatarColor: $avatarColor, avatarImage: $avatarImage) { id name avatarColor avatarImage role }
  }
`)

export const CHANGE_MY_PIN = graphql(`
  mutation ChangeMyPin($currentPin: String!, $newPin: String!) {
    changeMyPin(currentPin: $currentPin, newPin: $newPin)
  }
`)
