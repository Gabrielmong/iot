import beardedDragon from './images/beaded-dragon.webp'
import cat from './images/cat.webp'
import crow from './images/crow.webp'
import godzilla from './images/godzilla.webp'
import otter from './images/otter.webp'

export type AvatarImage = { id: string; label: string; src: string }

/** The built-in profile pictures. Ids must match the server's AVATAR_IMAGES. */
export const AVATAR_IMAGES: readonly AvatarImage[] = [
  { id: 'beaded-dragon', label: 'Bearded dragon', src: beardedDragon },
  { id: 'cat', label: 'Cat', src: cat },
  { id: 'crow', label: 'Crow', src: crow },
  { id: 'godzilla', label: 'Godzilla', src: godzilla },
  { id: 'otter', label: 'Otter', src: otter },
]

/** The picture's URL, or undefined for no picture (or an id this build doesn't know). */
export function avatarImageSrc(id: string | null | undefined): string | undefined {
  return AVATAR_IMAGES.find((i) => i.id === id)?.src
}
