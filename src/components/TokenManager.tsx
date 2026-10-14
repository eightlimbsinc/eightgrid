"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { api } from "@/client/api";
import { Spinner, toast, Toaster, toastError, useConfirm } from "./ui";

interface Token {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function TokenManager() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = () =>
    api<{ tokens: Token[] }>("/api/tokens")
      .then((r) => setTokens(r.tokens))
      .catch(toastError);
  useEffect(() => {
    load();
  }, []);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold">API tokens</h2>
      <p className="mb-4 text-gray-500">
        Tokens let scripts and integrations use the{" "}
        <Link href="/docs/api" className="text-blue-600 hover:underline">
          EightGrid REST API
        </Link>{" "}
        with your permissions.
      </p>
      <form
        className="mb-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await api<{ token: string }>("/api/tokens", { body: { name } });
            setCreated(r.token);
            setName("");
            load();
          } catch (err) {
            toastError(err);
          }
        }}
      >
        <input className="input" placeholder="Token name, e.g. Zapier sync" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn-primary shrink-0">Create token</button>
      </form>
      {created && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="mb-2 font-medium text-green-800">Copy your new token now — it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 font-mono text-xs">{created}</code>
            <button
              className="btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(created);
                toast("Copied");
              }}
            >
              <Copy size={14} /> Copy
            </button>
          </div>
        </div>
      )}
      {!tokens ? (
        <Spinner />
      ) : tokens.length === 0 ? (
        <p className="text-gray-500">No tokens yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-2 font-medium">Name</th>
              <th className="font-medium">Token</th>
              <th className="font-medium">Created</th>
              <th className="font-medium">Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="py-2">{t.name}</td>
                <td className="font-mono text-xs">{t.prefix}…</td>
                <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "Never"}</td>
                <td className="text-right">
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Revoke"
                    onClick={async () => {
                      if (!(await confirm(`Revoke "${t.name}"? Integrations using it will stop working.`, { confirmLabel: "Revoke" }))) return;
                      await api(`/api/tokens/${t.id}`, { method: "DELETE" }).catch(toastError);
                      load();
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog}
      <Toaster />
    </section>
  );
}
