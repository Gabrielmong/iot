import type { Rgb } from '../types'
import { NAMED_COLORS } from './colorName'

const SWATCH_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']

/** The 8 preset colors offered in the light dialog (a subset of the named palette). */
export const SWATCHES: readonly { name: string; rgb: Rgb }[] = NAMED_COLORS.filter((c) => SWATCH_NAMES.includes(c.name))
