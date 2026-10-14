"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Trash2, X } from "lucide-react";
import { api } from "@/client/api";
import { deleteRecords, updateRecords } from "@/client/mutations";
import { recordsStore, useTables } from "@/client/store";
import { cellToText, coerceValue, isComputed } from "@/lib/fields";
import { orderedFields } from "@/lib/query";
import type { ActivityEntry, Comment, Field } from "@/lib/types";
import { Avatar, Modal, toastError } from "../ui";
import { useBase } from "./context";
import { FieldValueEditor } from "./cells";
import { FieldIcon } from "./FieldIcon";

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function RecordModal({
  tableId,
  recordId,
  ids,
  onNavigate,
  onClose,
}: {
  tableId: string;
  recordId: string;
  ids?: string[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const { base, resolver, canEdit, canComment, view, confirm } = useBase();
  useTables([tableId]);
  const record = recordsStore.records(tableId).find((r) => r.id === recordId);
  const table = base.tables.find((t) => t.id === tableId);
  const fields = useMemo(() => base.fields.filter((f) => f.tableId === tableId), [base.fields, tableId]);
  const ordered = useMemo(
    () => (table ? orderedFields(fields, view.tableId === tableId ? view : undefined, table.primaryFieldId) : fields),
    [fields, view, table, tableId],
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<ActivityEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const loadActivity = useCallback(() => {
    api<{ comments: Comment[]; history: ActivityEntry[] }>(`/api/records/${recordId}`)
      .then((r) => {
        setComments(r.comments);
        setHistory(r.history);
      })
      .catch(() => {});
  }, [recordId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity, record?.updatedAt]);

  const idx = ids?.indexOf(recordId) ?? -1;
  const prev = ids && idx > 0 ? ids[idx - 1] : null;
  const next = ids && idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowUp" && prev) onNavigate(prev);
      if (e.key === "ArrowDown" && next) onNavigate(next);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prev, next, onNavigate]);

  if (!table) return null;
  if (!record) {
    return (
      <Modal title="Record" onClose={onClose}>
        <div className="p-8 text-center text-gray-500">
          {recordsStore.isLoaded(tableId) ? "This record was deleted." : "Loading…"}
        </div>
      </Modal>
    );
  }

  const primary = fields.find((f) => f.id === table.primaryFieldId);
  const title = (primary && resolver.getter(tableId).text(record, primary)) || "Unnamed record";
  const hidden = new Set(view.tableId === tableId ? (view.config.hiddenFieldIds ?? []) : []);
  const visible = ordered.filter((f) => showHidden || !hidden.has(f.id));
  const hiddenCount = ordered.length - ordered.filter((f) => !hidden.has(f.id)).length;

  const setValue = (f: Field, v: unknown) => {
    updateRecords(tableId, fields, [{ id: record.id, fields: { [f.id]: coerceValue(f, v) } }]);
  };

  const timeline = [
    ...comments.map((c) => ({ t: c.createdAt, kind: "comment" as const, c })),
    ...history.map((h) => ({ t: h.createdAt, kind: "history" as const, h })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  return (
    <Modal onClose={onClose} width={1100} bare>
      <div className="flex h-[84vh] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          {ids && (
            <div className="flex">
              <button className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" disabled={!prev} onClick={() => prev && onNavigate(prev)} title="Previous (↑)">
                <ChevronUp size={18} />
              </button>
              <button className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" disabled={!next} onClick={() => next && onNavigate(next)} title="Next (↓)">
                <ChevronDown size={18} />
              </button>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500">{table.name}</div>
            <h2 className="truncate text-lg font-semibold">{title}</h2>
          </div>
          {canEdit && (
            <button
              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="Delete record"
              onClick={async () => {
                if (!(await confirm("Delete this record?"))) return;
                await deleteRecords(tableId, fields, [record.id]);
                onClose();
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button className="rounded p-1.5 text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-2xl space-y-5">
              {visible.map((f) => (
                <div key={f.id}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-gray-600">
                    <FieldIcon type={f.type} size={13} />
                    {f.name}
                    {hidden.has(f.id) && <span className="text-gray-400">(hidden in view)</span>}
                  </div>
                  {f.description && <p className="mb-1 text-xs text-gray-400">{f.description}</p>}
                  <FieldValueEditor
                    field={f}
                    value={resolver.getter(tableId).get(record, f)}
                    onChange={(v) => setValue(f, v)}
                    readOnly={!canEdit || isComputed(f.type)}
                  />
                </div>
              ))}
              {hiddenCount > 0 && (
                <button className="text-blue-700 hover:underline" onClick={() => setShowHidden(!showHidden)}>
                  {showHidden ? "Hide" : "Show"} {hiddenCount} hidden field{hiddenCount > 1 ? "s" : ""}
                </button>
              )}
            </div>
          </div>
          <aside className="flex w-[340px] shrink-0 flex-col border-l border-gray-100 bg-gray-50">
            <div className="flex items-center gap-1.5 border-b border-gray-100 px-4 py-3 font-medium">
              <MessageSquare size={14} /> Activity
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {timeline.map((item) =>
                item.kind === "comment" ? (
                  <CommentItem key={item.c.id} comment={item.c} onDeleted={loadActivity} />
                ) : (
                  <HistoryItem key={item.h.seq} entry={item.h} fields={fields} />
                ),
              )}
              {!timeline.length && <p className="text-gray-400">No activity yet.</p>}
            </div>
            {canComment && (
              <form
                className="border-t border-gray-100 p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  try {
                    await api(`/api/records/${record.id}/comments`, { body: { body: draft } });
                    setDraft("");
                    loadActivity();
                  } catch (err) {
                    toastError(err);
                  }
                }}
              >
                <textarea
                  className="input min-h-[60px] resize-none bg-white"
                  placeholder="Leave a comment…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                  }}
                />
                <div className="mt-2 flex justify-end">
                  <button className="btn-primary py-1" disabled={!draft.trim()}>
                    Comment
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      </div>
    </Modal>
  );
}

function CommentItem({ comment, onDeleted }: { comment: Comment; onDeleted: () => void }) {
  return (
    <div className="group rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-2">
        <Avatar name={comment.userName} size={20} />
        <span className="font-medium">{comment.userName}</span>
        <span className="text-xs text-gray-400">{timeAgo(comment.createdAt)}</span>
        <button
          className="ml-auto text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
          onClick={() => api(`/api/comments/${comment.id}`, { method: "DELETE" }).then(onDeleted, toastError)}
          aria-label="Delete comment"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <p className="whitespace-pre-wrap break-words text-gray-800">{comment.body}</p>
    </div>
  );
}

function HistoryItem({ entry, fields }: { entry: ActivityEntry; fields: Field[] }) {
  const { resolver } = useBase();
  const ctx = resolver.getter(fields[0]?.tableId ?? "").ctx;
  const who = entry.actorName ?? "Someone";
  if (entry.kind === "record.create") {
    return (
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{who}</span> created this record · {timeAgo(entry.createdAt)}
      </div>
    );
  }
  const changes = (entry.payload.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
  return (
    <div className="space-y-1 text-xs text-gray-500">
      <div>
        <span className="font-medium text-gray-700">{who}</span> edited · {timeAgo(entry.createdAt)}
      </div>
      {Object.entries(changes).map(([fid, ch]) => {
        const f = fields.find((x) => x.id === fid);
        if (!f) return null;
        const from = cellToText(f, ch.from, ctx);
        const to = cellToText(f, ch.to, ctx);
        return (
          <div key={fid} className="rounded-md bg-white px-2 py-1 ring-1 ring-gray-100">
            <span className="font-medium text-gray-600">{f.name}</span>:{" "}
            {from && <span className="text-red-500 line-through">{from.slice(0, 80)}</span>} {to && <span className="text-green-700">{to.slice(0, 80)}</span>}
            {!to && !from && <span>cleared</span>}
          </div>
        );
      })}
    </div>
  );
}
