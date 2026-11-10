import { useQuery } from '@apollo/client/react'
import CircularProgress from '@mui/material/CircularProgress'
import { HOME_NAME } from '../home/data/documents'
import { PageSection } from './common/PageSection'
import { QueryError } from './common/QueryError'
import { HomeNameForm } from './settings/HomeNameForm'

/** Admin settings: household-wide preferences such as the home's name. */
export function SettingsPage() {
  const { data, error, refetch } = useQuery(HOME_NAME)
  if (error && !data) return <QueryError what="settings" onRetry={() => void refetch().catch(() => {})} />
  return (
    <PageSection title="Personalize">
      {data ? <HomeNameForm current={data.homeName} /> : <CircularProgress size={24} />}
    </PageSection>
  )
}
