"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, clientId } from "@/client/api";
import { Resolver } from "@/client/display";
import { recordsStore, useTables } from "@/client/store";
import { hasRole, type BasePayload, type ViewConfig } from "@/lib/types";
import { Toaster, toastError, useConfirm } from "../ui";
import { BaseContext, type BaseCtx } from "./context";
import { BaseHeader } from "./BaseHeader";
import { TableTabs } from "./TableTabs";
import { ViewSidebar } from "./ViewSidebar";
import { Toolbar } from "./Toolbar";
import { ViewRenderer } from "./ViewRenderer";
import { RecordModal } from "./RecordModal";

interface Change {
  seq: number;
  kind: string;
  tableId: string | null;
  recordId: string | null;
  clientId: string | null;
}

const POLL_MS = 2500;

export function BaseApp({
  initial,
  user,
  tableId: initialTableId,
  viewId: initialViewId,
}: {
  initial: BasePayload;
  user: { id: string; name: string; email: string };
  tableId?: string;
  viewId?: string;
}) {
  const [base, setBase] = useState(initial);
  const [tableId, setTableId] = useState(
    initial.tables.find((t) => t.id === initialTableId)?.id ?? initial.tables[0]?.id,
  );
  const [viewByTable, setViewByTable] = useState<Record<string, string>>(() =>
    initialTableId && initialViewId ? { [initialTableId]: initialViewId } : {},
  );
  const [localView, setLocalView] = useState<Record<string, Partial<ViewConfig>>>({});
  const [search, setSearch] = useState("");
  const [openRec, setOpenRec] = useState<{ tableId: string; recordId: string; ids?: string[] } | null>(null);
  const { confirm, dialog } = useConfirm();
  const seqRef = useRef(initial.latestSeq);

  const table = base.tables.find((t) => t.id === tableId) ?? base.tables[0];
  const tableViews = base.views.filter((v) => v.tableId === table.id);
  const baseView = tableViews.find((v) => v.id === viewByTable[table.id]) ?? tableViews[0];
  const view = useMemo(
    () => (localView[baseView.id] ? { ...baseView, config: { ...baseView.config, ...localView[baseView.id] } } : baseView),
    [baseView, localView],
  );
  const fields = useMemo(() => base.fields.filter((f) => f.tableId === table.id), [base.fields, table.id]);

  // Load the current table plus every table it links to (for link cell names).
  const neededTables = useMemo(() => {
    const ids = new Set([table.id]);
    for (const f of fields) if (f.type === "link" && f.options.linkedTableId) ids.add(f.options.linkedTableId);
    if (openRec) {
      ids.add(openRec.tableId);
      for (const f of base.fields)
        if (f.tableId === openRec.tableId && f.type === "link" && f.options.linkedTableId) ids.add(f.options.linkedTableId);
    }
    return [...ids].filter((id) => base.tables.some((t) => t.id === id));
  }, [table.id, fields, openRec, base.fields, base.tables]);
  const { version } = useTables(neededTables);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolver = useMemo(() => new Resolver(base), [base, version]);

  // Keep the URL in sync without a server round-trip.
  useEffect(() => {
    const url = `/base/${base.id}/${table.id}/${view.id}`;
    if (window.location.pathname !== url) window.history.replaceState(null, "", url);
    document.title = `${base.name}: ${table.name} - EightGrid`;
  }, [base.id, base.name, table.id, table.name, view.id]);

  const reloadBase = useCallback(async () => {
    try {
      const next = await api<BasePayload>(`/api/bases/${base.id}`);
      setBase(next);
    } catch (e) {
      toastError(e);
    }
  }, [base.id]);

  // Realtime: poll the base's change feed and refresh what other people changed.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const res = await api<{ latest: number; changes: Change[] }>(
            `/api/bases/${base.id}/changes?since=${seqRef.current}`,
          );
          seqRef.current = res.latest;
          const foreign = res.changes.filter((c) => c.clientId !== clientId);
          if (foreign.some((c) => c.kind === "schema")) {
            await reloadBase();
          }
          const tables = new Set(foreign.filter((c) => c.kind.startsWith("record.") && c.tableId).map((c) => c.tableId!));
          // Our own link edits touch other tables too
          for (const c of res.changes) if (c.kind === "record.links" && c.tableId) tables.add(c.tableId);
          for (const t of tables) if (recordsStore.isLoaded(t)) recordsStore.load(t, true).catch(() => {});
        } catch (e) {
          if ((e as { status?: number }).status === 404) return; // removed from base
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [base.id, reloadBase]);

  const canSchema = hasRole(base.role, "creator");

  // View config edits apply locally at once and are saved (debounced, merged) for creators.
  const pendingView = useRef<{ id: string; config: Partial<ViewConfig>; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const flushView = useCallback(() => {
    const p = pendingView.current;
    if (!p) return;
    pendingView.current = null;
    clearTimeout(p.timer);
    api(`/api/views/${p.id}`, { method: "PATCH", body: { config: p.config } }).catch((e) => {
      toastError(e);
      reloadBase();
    });
  }, [reloadBase]);
  useEffect(() => flushView, [flushView]);

  const patchView = useCallback(
    (config: Partial<ViewConfig>) => {
      const id = baseView.id;
      if (!canSchema) {
        setLocalView((m) => ({ ...m, [id]: { ...m[id], ...config } }));
        return;
      }
      setBase((b) => ({
        ...b,
        views: b.views.map((v) => (v.id === id ? { ...v, config: { ...v.config, ...config } } : v)),
      }));
      if (pendingView.current && pendingView.current.id !== id) flushView();
      const p = (pendingView.current ??= { id, config: {} });
      p.config = { ...p.config, ...config };
      clearTimeout(p.timer);
      p.timer = setTimeout(flushView, 400);
    },
    [baseView.id, canSchema, flushView],
  );

  const ctx: BaseCtx = {
    base,
    resolver,
    table,
    view,
    fields,
    canSchema,
    canEdit: hasRole(base.role, "editor"),
    canComment: hasRole(base.role, "commenter"),
    isOwner: base.role === "owner",
    search,
    setSearch,
    reloadBase,
    selectTable: (id) => {
      setTableId(id);
      setSearch("");
    },
    selectView: (id) => setViewByTable((m) => ({ ...m, [table.id]: id })),
    patchView,
    openRecord: (tableId, recordId, ids) => setOpenRec({ tableId, recordId, ids }),
    confirm,
  };

  return (
    <BaseContext.Provider value={ctx}>
      <div className="flex h-screen flex-col overflow-hidden bg-white">
        <BaseHeader user={user} />
        <TableTabs />
        <div className="flex min-h-0 flex-1">
          <ViewSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Toolbar />
            <div className="relative min-h-0 flex-1">
              <ViewRenderer key={view.id} />
            </div>
          </div>
        </div>
      </div>
      {openRec && (
        <RecordModal
          key={openRec.recordId}
          tableId={openRec.tableId}
          recordId={openRec.recordId}
          ids={openRec.ids}
          onNavigate={(recordId) => setOpenRec({ ...openRec, recordId })}
          onClose={() => setOpenRec(null)}
        />
      )}
      {dialog}
      <Toaster />
    </BaseContext.Provider>
  );
}
