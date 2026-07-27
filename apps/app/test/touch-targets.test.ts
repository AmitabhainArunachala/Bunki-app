/**
 * ≥44 pt touch targets on every interactive control (REQ-UI-09, controller §10).
 *
 * The sizes are plain data in `interactive-styles.ts` precisely so this test can
 * read them; see that file's header for why they are not inline in the
 * components.
 */

import { describe, expect, it } from 'vitest';

import { INTERACTIVE_STYLES, TOUCH_TARGET } from '../src/ui/interactive-styles.ts';
import { MIN_TOUCH_TARGET, SPACE, TYPE } from '../src/ui/theme.ts';

describe('touch targets', () => {
  it('uses the controller’s 44 pt figure', () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
    expect(TOUCH_TARGET.minHeight).toBe(44);
    expect(TOUCH_TARGET.minWidth).toBe(44);
  });

  it.each(Object.entries(INTERACTIVE_STYLES))(
    '%s reaches the minimum in both axes',
    (_name, style) => {
      expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    },
  );

  it.each(Object.entries(INTERACTIVE_STYLES))(
    '%s stays ≥44 pt once its own text and padding are counted',
    (_name, style) => {
      // A control whose minHeight is 44 but whose padded content is taller is
      // fine; one whose content is *shorter* still gets 44 from minHeight. The
      // failure this catches is a negative or zero vertical padding paired with
      // a shrunk minHeight in some future edit.
      const contentHeight = TYPE.label * 1.2 + style.paddingVertical * 2;
      expect(Math.max(contentHeight, style.minHeight)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    },
  );

  it('separates adjacent controls, so a 44 pt target is not 44 pt of overlap', () => {
    // Chips and buttons are laid out in rows with `gap: SPACE.sm`.
    expect(SPACE.sm).toBeGreaterThanOrEqual(8);
  });
});
