import type { DraftStep } from './draft'

/** Each step card's heading in the editor. */
export const STEP_TITLE: Record<DraftStep['kind'], string> = {
  SET: 'Set devices',
  WAIT: 'Wait',
  ROUTINE: 'Run routine',
  CONTINUE_IF: 'Only continue if…',
  IF: 'If… then run… otherwise run…',
}
