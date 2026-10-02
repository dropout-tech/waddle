// Test-only fake of the user-scoped Supabase client used by material.ts.
// It APPLIES the filters to in-memory rows (so a missing owner filter really
// leaks a fixture row) and records every query for assertions.
// Not imported by index.ts, so never deployed.

type Row = Record<string, unknown>;
export type RecordedQuery = { table: string; select: string; ops: [string, ...unknown[]][] };

function project(row: Row, select: string): Row {
  const out: Row = {};
  for (const raw of select.split(",")) {
    const part = raw.trim();
    const [alias, expr] = part.includes(":") ? part.split(":") : [part, part];
    const m = expr.match(/^(\w+)(->>|->)(\w+)$/);
    if (m) {
      const base = row[m[1]] as Row | null | undefined;
      const v = base && typeof base === "object" ? base[m[3]] : undefined;
      out[alias] = v === undefined ? null : m[2] === "->>" && typeof v !== "string" && v !== null ? JSON.stringify(v) : v;
    } else {
      out[alias] = row[expr] === undefined ? null : row[expr];
    }
  }
  return out;
}

class FakeQuery {
  rec: RecordedQuery;
  rows: Row[];
  failOn: Set<string>;
  constructor(rows: Row[], table: string, failOn: Set<string>) {
    this.rows = rows;
    this.failOn = failOn;
    this.rec = { table, select: "", ops: [] };
  }
  select(cols: string) {
    this.rec.select = cols;
    return this;
  }
  eq(c: string, v: unknown) {
    this.rec.ops.push(["eq", c, v]);
    return this;
  }
  in(c: string, v: unknown[]) {
    this.rec.ops.push(["in", c, v]);
    return this;
  }
  not(c: string, op: string, v: unknown) {
    this.rec.ops.push(["not", c, op, v]);
    return this;
  }
  gte(c: string, v: unknown) {
    this.rec.ops.push(["gte", c, v]);
    return this;
  }
  lt(c: string, v: unknown) {
    this.rec.ops.push(["lt", c, v]);
    return this;
  }
  lte(c: string, v: unknown) {
    this.rec.ops.push(["lte", c, v]);
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.rec.ops.push(["order", c, o?.ascending !== false]);
    return this;
  }
  range(a: number, b: number) {
    this.rec.ops.push(["range", a, b]);
    return this;
  }
  limit(n: number) {
    this.rec.ops.push(["limit", n]);
    return this;
  }
  result(): { data: Row[] | null; error: { message: string } | null } {
    if (this.failOn.has(this.rec.table)) return { data: null, error: { message: "boom" } };
    let rows = [...this.rows];
    const cmp = (a: unknown, b: unknown) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    const orders: [string, boolean][] = [];
    let range: [number, number] | null = null;
    let limit: number | null = null;
    for (const [op, ...args] of this.rec.ops) {
      const [c, v, w] = args as [string, unknown, unknown];
      if (op === "eq") rows = rows.filter((r) => r[c] === v);
      if (op === "in") rows = rows.filter((r) => (v as unknown[]).includes(r[c]));
      if (op === "gte") rows = rows.filter((r) => r[c] != null && cmp(r[c], v) >= 0);
      if (op === "lt") rows = rows.filter((r) => r[c] != null && cmp(r[c], v) < 0);
      if (op === "lte") rows = rows.filter((r) => r[c] != null && cmp(r[c], v) <= 0);
      if (op === "not" && v === "is" && w === null) rows = rows.filter((r) => r[c] != null);
      if (op === "not" && v === "like") {
        const prefix = String(w).replace(/%$/, "");
        rows = rows.filter((r) => !(typeof r[c] === "string" && (r[c] as string).startsWith(prefix)));
      }
      if (op === "order") orders.push([c, v as boolean]);
      if (op === "range") range = [args[0] as number, args[1] as number];
      if (op === "limit") limit = args[0] as number;
    }
    rows.sort((a, b) => {
      for (const [c, asc] of orders) {
        const d = cmp(a[c], b[c]);
        if (d) return asc ? d : -d;
      }
      return 0;
    });
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (limit != null) rows = rows.slice(0, limit);
    return { data: rows.map((r) => project(r, this.rec.select)), error: null };
  }
  then<T>(resolve: (v: ReturnType<FakeQuery["result"]>) => T, reject?: (e: unknown) => unknown) {
    try {
      return Promise.resolve(resolve(this.result()));
    } catch (e) {
      return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
    }
  }
}

export function fakeDb(tables: Record<string, Row[]>, opts: { failOn?: string[] } = {}) {
  const queries: RecordedQuery[] = [];
  const failOn = new Set(opts.failOn ?? []);
  return {
    queries,
    from(table: string) {
      const q = new FakeQuery(tables[table] ?? [], table, failOn);
      queries.push(q.rec);
      return q;
    },
  };
}
