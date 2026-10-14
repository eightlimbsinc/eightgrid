"use client";

import clsx from "clsx";
import type { CellGetter } from "@/lib/compute";
import type { Attachment } from "@/lib/fields";
import type { Field, RecordRow } from "@/lib/types";
import { useBase } from "./context";
import { CellDisplay } from "./cells";
import { FieldIcon } from "./FieldIcon";

export function RecordCard({
  record,
  fields,
  getter,
  onOpen,
  draggable,
  onDragStart,
  coverField,
  compact,
  skipFieldId,
}: {
  record: RecordRow;
  fields: Field[];
  getter: CellGetter;
  onOpen: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  coverField?: Field;
  compact?: boolean;
  skipFieldId?: string;
}) {
  const { table } = useBase();
  const primary = fields.find((f) => f.id === table.primaryFieldId);
  const rest = fields.filter((f) => f.id !== table.primaryFieldId && f.id !== skipFieldId).slice(0, compact ? 0 : 6);
  const cover = coverField ? ((record.data[coverField.id] as Attachment[] | undefined) ?? [])[0] : undefined;
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onOpen}
      className={clsx(
        "cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md",
        draggable && "active:cursor-grabbing",
      )}
    >
      {coverField && (
        <div className="flex h-32 items-center justify-center bg-gray-100">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-gray-400">No image</span>
          )}
        </div>
      )}
      <div className="space-y-2 p-3">
        <div className="truncate font-semibold">{(primary && getter.text(record, primary)) || <span className="text-gray-400">Unnamed record</span>}</div>
        {rest.map((f) => {
          const v = getter.get(record, f);
          if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
          return (
            <div key={f.id} className="min-w-0">
              <div className="mb-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                <FieldIcon type={f.type} size={11} />
                {f.name}
              </div>
              <div className="flex max-h-[60px] min-h-[18px] items-center overflow-hidden text-[13px]">
                <CellDisplay field={f} value={v} wrap />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
