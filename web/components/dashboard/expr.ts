// Derived metrics: + - * / ( ), numbers, tags and abs/min/max/avg/sum. The
// same grammar is parsed server-side before a spec is ever returned, so a bad
// expression here only ever reads as "no value", never as a thrown error.

type Values = Record<string, number | null | undefined>;
export type Evaluate = (values: Values) => number | undefined;

type Node =
  | { t: "num"; v: number }
  | { t: "tag"; k: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "fn"; f: string; args: Node[] };

const FUNCS: Record<string, (xs: number[]) => number> = {
  abs: (xs) => Math.abs(xs[0]),
  min: (xs) => Math.min(...xs),
  max: (xs) => Math.max(...xs),
  sum: (xs) => xs.reduce((a, b) => a + b, 0),
  avg: (xs) => xs.reduce((a, b) => a + b, 0) / xs.length,
};

function parse(src: string): Node | null {
  const toks = src.match(/\d+(?:\.\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|\S/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const take = (s: string) => (toks[i] === s ? (i++, true) : false);

  const expr = (): Node | null => {
    let a = term();
    while (a && (peek() === "+" || peek() === "-")) {
      const op = toks[i++];
      const b = term();
      a = b ? { t: "bin", op, a, b } : null;
    }
    return a;
  };
  const term = (): Node | null => {
    let a = factor();
    while (a && (peek() === "*" || peek() === "/")) {
      const op = toks[i++];
      const b = factor();
      a = b ? { t: "bin", op, a, b } : null;
    }
    return a;
  };
  const factor = (): Node | null => {
    const tok = peek();
    if (tok == null) return null;
    if (take("-")) {
      const a = factor();
      return a ? { t: "neg", a } : null;
    }
    if (take("(")) {
      const a = expr();
      return a && take(")") ? a : null;
    }
    i++;
    if (/^[\d.]/.test(tok)) return { t: "num", v: Number(tok) };
    if (!/^[A-Za-z_]/.test(tok)) return null;
    if (!(tok in FUNCS)) return { t: "tag", k: tok };
    if (!take("(")) return null;
    const args: Node[] = [];
    do {
      const a = expr();
      if (!a) return null;
      args.push(a);
    } while (take(","));
    return take(")") ? { t: "fn", f: tok, args } : null;
  };

  const root = expr();
  return root && i === toks.length ? root : null;
}

function run(n: Node, v: Values): number | undefined {
  switch (n.t) {
    case "num":
      return n.v;
    case "tag": {
      const x = v[n.k];
      return typeof x === "number" && Number.isFinite(x) ? x : undefined;
    }
    case "neg": {
      const a = run(n.a, v);
      return a == null ? undefined : -a;
    }
    case "bin": {
      const a = run(n.a, v);
      const b = run(n.b, v);
      if (a == null || b == null) return undefined;
      if (n.op === "/") return b === 0 ? undefined : a / b;
      return n.op === "+" ? a + b : n.op === "-" ? a - b : a * b;
    }
    case "fn": {
      const xs = n.args.map((a) => run(a, v));
      return xs.every((x): x is number => x != null) ? FUNCS[n.f](xs) : undefined;
    }
  }
}

const cache = new Map<string, Evaluate>();

/** A metric evaluator: a plain tag read, or a compiled expression. */
export function evaluator(m: { key?: string; expr?: string }): Evaluate {
  const id = m.key ? `k:${m.key}` : `e:${m.expr ?? ""}`;
  const hit = cache.get(id);
  if (hit) return hit;
  let fn: Evaluate;
  if (m.key) {
    const k = m.key;
    fn = (v) => {
      const x = v[k];
      return typeof x === "number" && Number.isFinite(x) ? x : undefined;
    };
  } else {
    const root = m.expr ? parse(m.expr) : null;
    fn = (v) => {
      if (!root) return undefined;
      const x = run(root, v);
      return x != null && Number.isFinite(x) ? x : undefined;
    };
  }
  cache.set(id, fn);
  return fn;
}
