"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ------------------------------------------------------------------ Popover

export type Anchor = HTMLElement | DOMRect | { x: number; y: number };

function anchorRect(a: Anchor): DOMRect {
  if (a instanceof HTMLElement) return a.getBoundingClientRect();
  if ("width" in a) return a;
  return new DOMRect(a.x, a.y, 0, 0);
}

export function Popover({
  anchor,
  onClose,
  children,
  className,
  align = "left",
  width,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchorRect(anchor);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = align === "right" ? r.right - w : r.left;
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, align]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      // Clicks inside nested popovers (portaled) shouldn't close parents
      if ((target as HTMLElement).closest?.("[data-popover]")) {
        const all = [...document.querySelectorAll("[data-popover]")];
        if (all.indexOf((target as HTMLElement).closest("[data-popover]")!) > all.indexOf(ref.current!)) return;
      }
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const all = [...document.querySelectorAll("[data-popover]")];
        if (all[all.length - 1] === ref.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      data-popover
      className={clsx(
        "fixed z-50 rounded-lg border border-gray-200 bg-white shadow-xl",
        !pos && "invisible",
        className,
      )}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** A button that toggles a popover anchored to itself. */
export function PopoverButton({
  button,
  children,
  className,
  popoverClassName,
  align,
  width,
}: {
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  popoverClassName?: string;
  align?: "left" | "right";
  width?: number;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(e) => setAnchor(anchor ? null : (e.currentTarget as HTMLElement))}
      >
        {button}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} className={popoverClassName} align={align} width={width}>
          {children(() => setAnchor(null))}
        </Popover>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Menu

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

export function Menu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <div className="min-w-[200px] p-1">
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 h-px bg-gray-100" />
        ) : (
          <button
            key={i}
            type="button"
            disabled={item.disabled}
            className={clsx("menu-item", item.danger && "text-red-600")}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            <span className="flex w-4 justify-center text-gray-500">{item.icon}</span>
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void }) {
  return (
    <Popover anchor={at} onClose={onClose}>
      <Menu items={items} onClose={onClose} />
    </Popover>
  );
}

// ------------------------------------------------------------------ Modal

export function Modal({
  title,
  onClose,
  children,
  width = 520,
  className,
  bare,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
  bare?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[data-popover]")) return;
      const modals = document.querySelectorAll("[data-modal]");
      if (modals[modals.length - 1] === ref.current) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  return createPortal(
    <div
      ref={ref}
      data-modal
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={clsx("w-full rounded-xl bg-white shadow-2xl", className)} style={{ maxWidth: width }}>
        {!bare && (
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <button className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ message: string; resolve: (ok: boolean) => void; danger?: boolean; confirmLabel?: string } | null>(null);
  const confirm = (message: string, opts: { danger?: boolean; confirmLabel?: string } = {}) =>
    new Promise<boolean>((resolve) => setState({ message, resolve, ...opts }));
  const dialog = state && (
    <Modal
      title="Are you sure?"
      width={420}
      onClose={() => {
        state.resolve(false);
        setState(null);
      }}
    >
      <div className="px-5 py-4 text-gray-700">{state.message}</div>
      <div className="flex justify-end gap-2 px-5 pb-4">
        <button
          className="btn-secondary"
          onClick={() => {
            state.resolve(false);
            setState(null);
          }}
        >
          Cancel
        </button>
        <button
          autoFocus
          className={state.danger === false ? "btn-primary" : "btn-danger"}
          onClick={() => {
            state.resolve(true);
            setState(null);
          }}
        >
          {state.confirmLabel ?? "Delete"}
        </button>
      </div>
    </Modal>
  );
  return { confirm, dialog };
}

// ------------------------------------------------------------------ Toasts

type Toast = { id: number; message: string; kind: "info" | "error" };
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastSeq = 0;

export function toast(message: string, kind: Toast["kind"] = "info") {
  const id = ++toastSeq;
  toasts = [...toasts, { id, message, kind }];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastListeners.forEach((l) => l());
  }, kind === "error" ? 6000 : 3000);
}

export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : String(e), "error");
}

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto rounded-lg px-4 py-2 text-white shadow-lg",
            t.kind === "error" ? "bg-red-600" : "bg-gray-900",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ misc

export function Avatar({ name, image, size = 24 }: { name: string; image?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name} width={size} height={size} className="shrink-0 rounded-full" referrerPolicy="no-referrer" />;
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 55% 50%)` }}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500", className)}
    />
  );
}
