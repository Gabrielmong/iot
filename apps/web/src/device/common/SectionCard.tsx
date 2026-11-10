import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

type Props = { title: string; /** Region name; defaults to the title. */ label?: string; children: ReactNode }

/** A titled card that is also a named page region. */
export function SectionCard({ title, label = title, children }: Props) {
  return (
    <Card variant="outlined" component="section" aria-label={label} sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ fontSize: 17, mb: 1.5 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}
