/**
 * Minimal ISO 10303-21 (STEP) reader for IFC files.
 * It only extracts `#id=TYPE(args)` records; interpretation happens in reader.ts.
 */

export type StepValue =
  | { t: 'ref'; id: number }
  | { t: 'str'; v: string }
  | { t: 'num'; v: number }
  | { t: 'enum'; v: string }
  | { t: 'null' }
  | { t: 'list'; v: StepValue[] };

export interface StepEntity {
  id: number;
  type: string;
  args: StepValue[];
}

export interface StepFile {
  schema: string;
  entities: Map<number, StepEntity>;
}

const decodeString = (raw: string) => {
  let out = '';
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "'" && raw[index + 1] === "'") {
      out += "'";
      index += 1;
      continue;
    }
    out += raw[index];
  }
  return out
    .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_match, hex: string) => {
      const codes = hex.match(/.{4}/g) ?? [];
      return codes.map(code => String.fromCharCode(parseInt(code, 16))).join('');
    })
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
};

const findClose = (text: string, open: number) => {
  let depth = 0;
  let quoted = false;
  for (let index = open; index < text.length; index += 1) {
    const ch = text[index];
    if (quoted) {
      if (ch === "'") {
        if (text[index + 1] === "'") index += 1;
        else quoted = false;
      }
      continue;
    }
    if (ch === "'") {
      quoted = true;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const parseValue = (raw: string): StepValue => {
  const text = raw.trim();
  if (!text || text === '$' || text === '*') return { t: 'null' };
  if (text.startsWith('#')) return { t: 'ref', id: Number(text.slice(1)) };
  if (text.startsWith("'")) return { t: 'str', v: decodeString(text.slice(1, -1)) };
  if (text.startsWith('(')) {
    const inner = text.slice(1, -1);
    return { t: 'list', v: inner.trim() ? splitArgs(inner).map(parseValue) : [] };
  }
  if (text.startsWith('.')) return { t: 'enum', v: text.replace(/\./g, '') };
  const typed = text.match(/^[A-Z0-9_]+\s*\(([\s\S]*)\)$/);
  if (typed) return parseValue(typed[1]);
  const value = Number(text);
  if (Number.isFinite(value)) return { t: 'num', v: value };
  return { t: 'str', v: text };
};

const splitArgs = (source: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (quoted) {
      if (ch === "'") {
        if (source[index + 1] === "'") index += 1;
        else quoted = false;
      }
      continue;
    }
    if (ch === "'") {
      quoted = true;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(source.slice(start, index));
      start = index + 1;
    }
  }
  out.push(source.slice(start));
  return out;
};

export function parseStep(text: string): StepFile {
  const schemaMatch = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  const schema = schemaMatch?.[1] ?? 'IFC';
  const dataStart = text.toUpperCase().indexOf('DATA;');
  const body = dataStart >= 0 ? text.slice(dataStart + 5) : text;
  const entities = new Map<number, StepEntity>();

  let cursor = 0;
  while (cursor < body.length) {
    const hash = body.indexOf('#', cursor);
    if (hash < 0) break;
    let index = hash + 1;
    let idText = '';
    while (index < body.length && body[index] >= '0' && body[index] <= '9') {
      idText += body[index];
      index += 1;
    }
    if (!idText) {
      cursor = hash + 1;
      continue;
    }
    while (index < body.length && /\s/.test(body[index])) index += 1;
    if (body[index] !== '=') {
      cursor = hash + 1;
      continue;
    }
    index += 1;
    while (index < body.length && /\s/.test(body[index])) index += 1;
    let type = '';
    while (index < body.length && /[A-Za-z0-9_]/.test(body[index])) {
      type += body[index];
      index += 1;
    }
    while (index < body.length && /\s/.test(body[index])) index += 1;
    if (body[index] !== '(' || !type) {
      cursor = hash + 1;
      continue;
    }
    const close = findClose(body, index);
    if (close < 0) break;
    const argsText = body.slice(index + 1, close);
    const args = argsText.trim() ? splitArgs(argsText).map(parseValue) : [];
    entities.set(Number(idText), { id: Number(idText), type: type.toUpperCase(), args });
    cursor = close + 1;
  }

  return { schema, entities };
}
