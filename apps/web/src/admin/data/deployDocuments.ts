import { graphql } from '../../gql'

export const DEPLOY_STATUS = graphql(`
  query DeployStatus {
    deployStatus {
      available
      running { sha message deployedAt }
      autoDeploy
      pausedReason
      lastCheckAt
      lastCheckError
      busy
      helperUpdateAvailable
      events {
        id kind status sha message by startedAt finishedAt detail canRollback rollbackBlockedReason
      }
    }
  }
`)

export const DEPLOY_LOG = graphql(`
  query DeployLog($eventId: ID!) {
    deployLog(eventId: $eventId)
  }
`)

export const DEPLOY_NOW = graphql(`mutation DeployNow { deployNow }`)
export const RESTART_APP = graphql(`mutation RestartApp { restartApp }`)
export const PAUSE_AUTO_DEPLOY = graphql(`mutation PauseAutoDeploy { pauseAutoDeploy }`)
export const RESUME_AUTO_DEPLOY = graphql(`mutation ResumeAutoDeploy { resumeAutoDeploy }`)
export const ROLLBACK_DEPLOY = graphql(`mutation RollbackDeploy($sha: String!) { rollbackDeploy(sha: $sha) }`)
