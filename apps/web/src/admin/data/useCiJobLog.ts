import { useQuery } from '@apollo/client/react'
import { CI_JOB_LOG } from './deployDocuments'

/** A finished CI job's log, never polled. Asked again on each open so a failed fetch (null) doesn't stick; the helper caches logs on disk. */
export function useCiJobLog(jobId: string | null) {
  const { data, loading } = useQuery(CI_JOB_LOG, {
    variables: { jobId: jobId ?? '' },
    skip: jobId === null,
    fetchPolicy: 'cache-and-network',
  })
  return { log: data?.ciJobLog ?? null, loading: loading && data === undefined }
}
