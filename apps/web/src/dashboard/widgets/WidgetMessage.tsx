import Typography from '@mui/material/Typography'

/** A widget's single line when it has nothing to show. */
export function WidgetMessage({ text }: { text: string }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
      {text}
    </Typography>
  )
}
