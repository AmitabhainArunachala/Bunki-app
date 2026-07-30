import type { Phase2State } from "./phase2-types.ts";

const tsvCell = (value: string): string =>
  value.replace(/\r\n?|\n/gu, "<br>").replaceAll("\t", " ");

export function phase2CardsToAnkiTsv(state: Phase2State): string {
  const rows = [
    [
      "Front",
      "Back",
      "Tags",
      "Source",
      "Source ID",
      "Concept",
      "Lineage fingerprints",
      "Exact lineage text",
    ],
    ...state.cards.map((card) => [
      card.front,
      card.back,
      card.tags.join(" "),
      state.sources.find((source) => source.id === card.sourceId)?.title ?? "",
      card.sourceId ?? "",
      card.conceptId,
      card.lineage.map((anchor) => anchor.sourceFingerprint).join(" | "),
      card.lineage.map((anchor) => anchor.exactText).join(" | "),
    ]),
  ];
  return rows.map((row) => row.map(tsvCell).join("\t")).join("\n");
}
