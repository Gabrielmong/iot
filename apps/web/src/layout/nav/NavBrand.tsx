import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { BrandMark } from '../BrandMark'

type Props = { homeName: string; showName?: boolean }

/** The mark and the home's name, linking to the dashboard. */
export function NavBrand({ homeName, showName = true }: Props) {
  return (
    <Typography
      variant="h6"
      component={RouterLink}
      to="/"
      aria-label={showName ? undefined : homeName}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, color: 'text.primary', textDecoration: 'none' }}
    >
      <BrandMark />
      {showName && (
        <Typography component="span" variant="inherit" noWrap>
          {homeName}
        </Typography>
      )}
    </Typography>
  )
}
