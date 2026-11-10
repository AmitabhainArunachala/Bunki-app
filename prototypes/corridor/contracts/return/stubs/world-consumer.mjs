/** Stub consumer: a world surface (G4, assertion [1]). A world keeps its own place model (the room and the learner's
 *  position in it) but returns through the same contract: paragraph (the room's reading position), selection, focus,
 *  scroll, and owned media within 250 ms. It compiles against ../return.mjs only. */
import { restorePlan, validateReturnRecord, MEDIA_RETURN_TOLERANCE_MS } from '../return.mjs';

export function createConsumer(surface, { clock = null } = {}) {
  const parked = new Map();                   // record id → the world's own snapshot at the moment of leaving
  return {
    leave(record) {
      validateReturnRecord(record);
      parked.set(record.id, { selection: { ...surface.selection }, room: surface.room ?? null });
    },
    returnTo(record) {
      const plan = restorePlan(record);
      const snap = parked.get(record.id);
      surface.paragraph = plan.paragraph;
      surface.selection = snap ? { ...snap.selection } : { start: 0, end: 0 };
      if (snap && snap.room !== null) surface.room = snap.room;
      surface.focus = plan.focus;
      surface.scroll = { ...plan.scroll };
      if (plan.mediaMs !== null) {
        const t0 = clock ? clock.now() : 0;
        surface.media = { ...(surface.media || {}), positionMs: plan.mediaMs };
        if (clock) clock.advance(Math.min(MEDIA_RETURN_TOLERANCE_MS, 60));
        return { seekedTo: surface.media.positionMs, tookMs: clock ? clock.now() - t0 : 0 };
      }
      return { seekedTo: null, tookMs: 0 };
    },
  };
}
