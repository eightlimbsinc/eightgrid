import Link from "next/link";
import { headers } from "next/headers";
import { Logo } from "@/components/Logo";

export const metadata = { title: "API documentation - EightGrid" };

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-[12px] leading-relaxed text-gray-100">{children}</pre>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function ApiDocs() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const api = `${origin}/api/v1`;
  return (
    <div className="min-h-full bg-white">
      <header className="flex h-14 items-center justify-between border-b border-gray-200 px-6">
        <Link href="/">
          <Logo withText size={26} />
        </Link>
        <Link href="/account" className="btn-secondary">
          Get an API token
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-10 px-6 py-10 text-[14px] leading-relaxed text-gray-800">
        <div>
          <h1 className="mb-2 text-3xl font-semibold">EightGrid REST API</h1>
          <p className="text-gray-600">
            The API follows Airtable&apos;s conventions closely, so most Airtable scripts and integrations port over by changing the base URL
            and token. Open a base and click <b>API</b> in the header to see its table and field IDs.
          </p>
        </div>

        <Section id="auth" title="Authentication">
          <p>
            Create a personal token on your{" "}
            <Link className="text-blue-600 hover:underline" href="/account">
              account page
            </Link>{" "}
            and send it as a bearer token. Requests act with your permissions in each base.
          </p>
          <Code>{`curl ${api}/bases -H "Authorization: Bearer egt_..."`}</Code>
        </Section>

        <Section id="schema" title="Bases & schema">
          <Code>{`GET ${api}/bases
→ { "bases": [{ "id": "basXXX", "name": "Marketing", "permissionLevel": "owner" }] }

GET ${api}/bases/{baseId}/tables
→ { "tables": [{ "id": "tblXXX", "name": "Tasks", "primaryFieldId": "fldXXX",
                 "fields": [{ "id": "fldXXX", "name": "Name", "type": "text", ... }],
                 "views":  [{ "id": "viwXXX", "name": "Grid view", "type": "grid" }] }] }`}</Code>
        </Section>

        <Section id="list" title="List records">
          <p>
            Tables can be referenced by ID or by name (URL-encoded). Field values are keyed by field name; empty fields are omitted.
          </p>
          <Code>{`GET ${api}/bases/{baseId}/tables/{tableIdOrName}/records
    ?pageSize=100                       # max 100
    &offset=100                         # from the previous response
    &view=Grid%20view                   # apply a view's filters & sorts
    &fields[]=Name&fields[]=Status      # only these fields
    &sort[0][field]=Due&sort[0][direction]=desc
    &filterByFormula=AND({Status}="Done",{Budget}>100)
    &maxRecords=500

→ { "records": [{ "id": "recXXX", "createdTime": "2026-01-01T00:00:00.000Z",
                  "fields": { "Name": "Launch", "Status": "Done", "Budget": 1200 } }],
    "offset": "100" }`}</Code>
        </Section>

        <Section id="create" title="Create records">
          <p>
            Up to 100 records per request. With <code>&quot;typecast&quot;: true</code>, unknown select options are created automatically and
            text values are converted (e.g. <code>&quot;1,200&quot;</code> → 1200).
          </p>
          <Code>{`POST ${api}/bases/{baseId}/tables/{table}/records
{ "records": [{ "fields": { "Name": "New task", "Status": "Todo", "Owner": ["recPERSON"] } }],
  "typecast": true }`}</Code>
        </Section>

        <Section id="update" title="Update & delete records">
          <Code>{`PATCH  .../records            { "records": [{ "id": "recXXX", "fields": { "Status": "Done" } }] }   # merge
PUT    .../records            { "records": [{ "id": "recXXX", "fields": { ... } }] }              # replace
GET    .../records/{recordId}
PATCH  .../records/{recordId} { "fields": { "Status": "Done" } }
DELETE .../records/{recordId}
DELETE .../records?records[]=recA&records[]=recB`}</Code>
        </Section>

        <Section id="values" title="Field value formats">
          <table className="w-full text-left text-[13px]">
            <tbody className="divide-y divide-gray-100">
              {[
                ["Text, long text, email, URL, phone", "string"],
                ["Number, currency, percent, rating", "number (percent is the displayed number, e.g. 50 for 50%)"],
                ["Checkbox", "true / false"],
                ["Single select", '"Option name"'],
                ["Multiple select", '["A", "B"]'],
                ["Date", '"2026-03-01" or ISO datetime when the field includes time'],
                ["Link to another record", '["recXXX", "recYYY"] (links are two-way)'],
                ["Attachment", '[{ "url": "https://…", "filename": "file.pdf" }]'],
                ["User", 'read: { "id", "email", "name" }; write: user id or email'],
                ["Formula, created/modified time & by", "read-only, computed"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-2 pr-4 font-medium">{k}</td>
                  <td className="py-2 font-mono text-[12px] text-gray-600">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="errors" title="Errors">
          <p>
            Errors return a non-2xx status with <code>{`{ "error": "message" }`}</code>: 400 invalid input, 401 missing/invalid token, 403 not
            allowed for your role, 404 base/table/record not found.
          </p>
        </Section>
      </main>
    </div>
  );
}
