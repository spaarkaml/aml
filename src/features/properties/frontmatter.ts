import YAML from "yaml";

/** One front-matter field as shown in the Properties panel. */
export interface Field {
  key: string;
  value: unknown;
  kind: "text" | "number" | "boolean" | "list" | "date" | "other";
}

export function parseFields(yaml: string): Field[] {
  if (!yaml.trim()) return [];
  let data: unknown;
  try {
    data = YAML.parse(yaml);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
    key,
    value,
    kind: kindOf(value),
  }));
}

function kindOf(v: unknown): Field["kind"] {
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? "date" : "text";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number"))
    return "list";
  if (v instanceof Date) return "date";
  return "other";
}

/** Serialises fields back to YAML (block style, no trailing newline, key order preserved). */
export function toYaml(fields: Field[]): string {
  if (fields.length === 0) return "";
  const obj: Record<string, unknown> = {};
  for (const f of fields) obj[f.key] = f.value;
  return YAML.stringify(obj, { lineWidth: 0, indent: 2 }).replace(/\n+$/, "");
}

/** Parses what the user typed into a field editor back into a value of the field's kind. */
export function coerce(kind: Field["kind"], raw: string): unknown {
  switch (kind) {
    case "number": {
      const n = Number(raw);
      return Number.isNaN(n) ? raw : n;
    }
    case "boolean":
      return raw === "true";
    case "list":
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    case "text":
      // A text field that now holds a plain number or boolean becomes that type.
      if (/^-?\d+(\.\d+)?$/.test(raw.trim())) return Number(raw);
      if (raw === "true" || raw === "false") return raw === "true";
      return raw;
    default:
      return raw;
  }
}

export function display(field: Field): string {
  if (field.kind === "list") return (field.value as unknown[]).join(", ");
  if (field.kind === "other") return YAML.stringify(field.value).replace(/\n+$/, "");
  if (field.value instanceof Date) return field.value.toISOString().slice(0, 10);
  return String(field.value ?? "");
}

export function setField(fields: Field[], key: string, value: unknown): Field[] {
  const kind = kindOf(value);
  const i = fields.findIndex((f) => f.key === key);
  if (i === -1) return [...fields, { key, value, kind }];
  return fields.map((f, j) => (j === i ? { key, value, kind } : f));
}

export function removeField(fields: Field[], key: string): Field[] {
  return fields.filter((f) => f.key !== key);
}
