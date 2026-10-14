"use client";

import { useMemo } from "react";
import { recordsStore, useTables } from "@/client/store";
import { searchRecords, viewRecords, visibleFields } from "@/lib/query";
import { useBase } from "./context";

/** Records of the current view after filters, sorts and search. */
export function useViewRecords() {
  const { table, view, fields, resolver, search } = useBase();
  const { loading, version } = useTables([table.id]);
  const getter = resolver.getter(table.id);
  const vis = useMemo(() => visibleFields(fields, view, table.primaryFieldId), [fields, view, table.primaryFieldId]);
  const rows = useMemo(
    () => searchRecords(viewRecords(recordsStore.records(table.id), view, getter), vis, search, getter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, view, getter, vis, search, table.id],
  );
  return { rows, vis, getter, loading };
}
