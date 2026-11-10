/** Translucent round buttons over the video, matching the player's own controls; big enough for thumbs. */
export const overlayButton = {
  width: 44,
  height: 44,
  color: 'common.white',
  bgcolor: 'rgba(0, 0, 0, 0.45)',
  touchAction: 'none',
  userSelect: 'none',
  '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.65)' },
} as const
