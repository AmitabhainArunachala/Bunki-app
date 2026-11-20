/** Stub consumer: a reading surface (G4, assertion [1]). It restores exactly what the return record says — paragraph,
 *  selection range, focus target, scroll — and seeks owned media to the recorded position within 250 ms on the clock it is
 *  given. It imports nothing from corridor.js: the contract is the only interface it compiles against. */
import { restorePlan, validateReturnRecord, MEDIA_RETURN_TOLERANCE_MS } from '../return.mjs';

export function createConsumer(surface, { clock = null } = {}) {
  let remembered = null;                      // the selection the surface held when the learner left, keyed by record id
  return {
    leave(record) {
      validateReturnRecord(record);
      remembered = { id: record.id, selection: { ...surface.selection } };
    },
    returnTo(record) {
      const plan = restorePlan(record);
      surface.paragraph = plan.paragraph;
      surface.selection = remembered && remembered.id === record.id ? { ...remembered.selection } : { start: 0, end: 0 };
      surface.focus = plan.focus;
      surface.scroll = { ...plan.scroll };
      if (plan.mediaMs !== null) {
        const t0 = clock ? clock.now() : 0;
        surface.media = { ...(surface.media || {}), positionMs: plan.mediaMs };   // a direct seek lands on the recorded position
        if (clock) clock.advance(Math.min(MEDIA_RETURN_TOLERANCE_MS, 40));         // the seek's own latency on the stub clock
        return { seekedTo: surface.media.positionMs, tookMs: clock ? clock.now() - t0 : 0 };
      }
      return { seekedTo: null, tookMs: 0 };
    },
  };
}
