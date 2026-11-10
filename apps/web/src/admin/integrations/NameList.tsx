import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'

type Props = { intro: string; names: readonly string[] }

/** A sentence followed by a dense list of device names; renders nothing for an empty list. */
export function NameList({ intro, names }: Props) {
  if (names.length === 0) return null
  return (
    <>
      <Typography sx={{ mt: 2 }}>{intro}</Typography>
      <List dense>
        {names.map((name) => (
          <ListItem key={name}>
            <ListItemText primary={name} />
          </ListItem>
        ))}
      </List>
    </>
  )
}
