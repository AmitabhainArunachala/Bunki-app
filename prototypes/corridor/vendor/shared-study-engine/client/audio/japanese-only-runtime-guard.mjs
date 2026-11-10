/** Current whole-field policy only; no profile defaults and no media side effects. */
import {validateJapaneseOnlySelection} from './japanese-only-selection.mjs';
import {canonicalStringify} from '../schema/event.mjs';
function invalid(reason) {
  const error = Error(`japanese-only-runtime-${reason}`);
  error.audioCode = 'integrity';
  return error;
}
export function assertJapaneseOnlyRuntimeField({selection, plan, sourceRevision,
  correctionLedgerRevision, taskKeys, taskKey, fieldId, profileId, profiles, assignments} = {}) {
  try {
    const current = validateJapaneseOnlySelection(selection,
      {plan, sourceRevision, correctionLedgerRevision, ...(taskKeys === undefined ? {} : {taskKeys})});
    const rows = current.rows.filter(row => row.taskKey === taskKey && row.sourcePath === fieldId);
    if (rows.length !== 1 || rows[0].selected !== true) throw invalid('field-excluded');
    const task = plan.tasks.find(task => task.taskKey === taskKey);
    const field = task?.fields?.find(field => field.sourcePath === fieldId);
    if (!field || field.language !== 'ja' || field.pendingReasons.some(reason =>
        !['profile-unassigned', 'reading-review-pending'].includes(reason))) throw invalid('field-unready');
    const explicit = assignments?.profiles?.ja;
    if (!explicit || typeof explicit !== 'object' || Array.isArray(explicit) ||
        !Array.isArray(profiles) || typeof profileId !== 'string' || !profileId.trim()) {
      throw invalid('explicit-japanese-profile-required');
    }
    const matches = profiles.filter(row => row && canonicalStringify(row.profile) === canonicalStringify(explicit));
    if (matches.length !== 1 || matches[0].id !== profileId ||
        profiles.filter(row => row?.id === profileId).length !== 1) throw invalid('japanese-profile-mismatch');
    return rows[0];
  } catch (error) {
    if (error?.audioCode === 'integrity') throw error;
    throw invalid('selection-invalid');
  }
}
