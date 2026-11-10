import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'

type Props = { cameraIds: readonly string[]; names: ReadonlyMap<string, string>; onChange: (cameraIds: string[]) => void }

const move = (ids: readonly string[], from: number, to: number) => {
  const next = [...ids]
  const [id] = next.splice(from, 1)
  next.splice(to, 0, id!)
  return next
}

/** A group's cameras in grid order: move up/down, or remove. */
export function GroupCameraOrder({ cameraIds, names, onChange }: Props) {
  return (
    <List dense disablePadding>
      {cameraIds.map((id, i) => {
        const name = names.get(id) ?? 'Camera'
        return (
          <ListItem
            key={id}
            disableGutters
            secondaryAction={
              <>
                <IconButton size="small" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => onChange(move(cameraIds, i, i - 1))}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" aria-label={`Move ${name} down`} disabled={i === cameraIds.length - 1} onClick={() => onChange(move(cameraIds, i, i + 1))}>
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" aria-label={`Remove ${name}`} onClick={() => onChange(cameraIds.filter((c) => c !== id))}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </>
            }
          >
            <ListItemText primary={`${i + 1}. ${name}`} />
          </ListItem>
        )
      })}
    </List>
  )
}
