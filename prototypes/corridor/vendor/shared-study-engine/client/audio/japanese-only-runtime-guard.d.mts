import type {JapaneseOnlySelection, JapaneseSelectionOptions, JapaneseSelectionRow} from './japanese-only-selection.mjs';
export function assertJapaneseOnlyRuntimeField(options: JapaneseSelectionOptions & {
 selection: JapaneseOnlySelection; taskKey:string; fieldId:string; profileId:string;
 profiles: readonly Readonly<{id:string;profile:unknown}>[];
 assignments:Readonly<{profiles?:Readonly<Record<string,unknown>>}>;
}):JapaneseSelectionRow;
