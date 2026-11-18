import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Gauge as ChartGauge, gaugeClasses } from '@mui/x-charts/Gauge'

type Props = { label: string; value: number; caption?: string }

/**
 * A 0–100 % gauge with its label underneath and an optional detail line. The meter semantics sit on the
 * wrapper: x-charts hides its own SVG from assistive technology.
 */
export function Gauge({ label, value, caption }: Props) {
  const rounded = Math.round(Math.min(100, Math.max(0, value)))
  return (
    <Stack sx={{ alignItems: 'center', minWidth: 0 }}>
      <Box role="meter" aria-label={label} aria-valuenow={rounded} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${rounded}%`}>
        <ChartGauge
          width={110}
          height={110}
          value={rounded}
          startAngle={-120}
          endAngle={120}
          innerRadius="78%"
          text={`${rounded}%`}
          sx={{ [`& .${gaugeClasses.valueText}`]: { fontSize: 20, fontWeight: 600 } }}
        />
      </Box>
      <Typography variant="subtitle2">{label}</Typography>
      {caption && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {caption}
        </Typography>
      )}
    </Stack>
  )
}
