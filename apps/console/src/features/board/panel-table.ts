import type { ColumnId, TablePanel } from "@groundtruth/panel-dsl";

import { epochMilliseconds, telemetryValueText } from "../../data/format";
import type { PanelSeries } from "../../data/panels";

export type PanelTableRow = {
  readonly cells: Readonly<Record<string, number | string | null>>;
  readonly key: string;
};

export const buildPanelTableRows = (panel: TablePanel, series: ReadonlyArray<PanelSeries>) => {
  const rows = new Map<string, Record<string, number | string | null>>();
  for (const item of series) {
    const attributes = Object.fromEntries(
      Object.entries(item.attributes).map(([key, value]) => [key, telemetryValueText(value)]),
    );
    const attributeIdentity = JSON.stringify(
      Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)),
    );
    for (const point of item.points) {
      const at = epochMilliseconds(point.at);
      const key = `${at}:${attributeIdentity}`;
      const existing = rows.get(key) ?? { __time: at, ...attributes };
      existing[item.queryRef] = point.value;
      rows.set(key, existing);
    }
  }

  const materialized = [...rows.entries()].map(([key, cells]) => ({ cells, key }));
  if (panel.sort !== undefined) {
    const direction = panel.sort.direction === "asc" ? 1 : -1;
    materialized.sort(
      (left, right) =>
        compareCells(cellForSort(panel, left.cells), cellForSort(panel, right.cells)) * direction,
    );
  }
  return materialized.slice(0, panel.rowLimit);
};

const cellForSort = (
  panel: TablePanel,
  cells: Readonly<Record<string, number | string | null>>,
) => {
  const column = panel.columns.find((candidate) => candidate.id === panel.sort?.columnId);
  if (column?._tag === "time") return cells.__time ?? null;
  if (column?._tag === "attribute") return cells[column.attribute] ?? null;
  if (column?._tag === "value") return cells[column.queryRef] ?? null;
  return null;
};

const compareCells = (left: number | string | null, right: number | string | null) => {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
};

export const tableCellValue = (column: TablePanel["columns"][number], row: PanelTableRow) => {
  if (column._tag === "time") return row.cells.__time ?? null;
  if (column._tag === "attribute") return row.cells[column.attribute] ?? null;
  return row.cells[column.queryRef] ?? null;
};

export const tableColumnKey = (columnId: ColumnId) => columnId;
