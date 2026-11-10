import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

/** Where the video would be while the camera's privacy mode is on. */
export function PrivacyFrame() {
  return (
    <Box
      sx={{
        aspectRatio: '16 / 9',
        bgcolor: 'common.black',
        color: 'grey.400',
        borderRadius: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}
    >
      <VisibilityOffIcon />
      <Typography variant="body2">Privacy mode is on</Typography>
    </Box>
  )
}
