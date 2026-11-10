/**
 * Whether a drag over `overId` should move the dragged card there. After a swap the edge between two
 * cards of different sizes often sits under the pointer, so re-entering the card just swapped with must
 * not swap back (that makes mixed-size cards jitter).
 */
export function isNewDragTarget(lastOverId: string | null, activeId: string, overId: string | null): boolean {
  return overId !== null && overId !== activeId && overId !== lastOverId
}
