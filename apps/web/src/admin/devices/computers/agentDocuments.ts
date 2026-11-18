import { graphql } from '../../../gql'

export const CREATE_AGENT_ENROLLMENT = graphql(`
  mutation CreateAgentEnrollment {
    createAgentEnrollment { downloadUrl expiresAt }
  }
`)
