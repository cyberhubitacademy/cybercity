import { ScriptError } from './types';

// Line-oriented tokenizer. Statements end at a newline; comments start with
// `;` or `//` and run to the end of the line.

export type TokenKind = 'ident' | 'int' | 'float' | 'string' | 'arrow' | 'colon' | 'op' | 'prefix' | 'newline' | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  /** Parsed value for numbers / strings / opcode prefixes. */
  num?: number;
  str?: string;
  line: number;
  col: number;
}

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdent = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

export function tokenize(src: string, file = '<script>'): { tokens: Token[]; errors: ScriptError[] } {
  const tokens: Token[] = [];
  const errors: ScriptError[] = [];
  let i = 0, line = 1, col = 1;
  let lineStart = true;
  const push = (t: Omit<Token, 'line' | 'col'>, l: number, c: number) => tokens.push({ ...t, line: l, col: c });
  const advance = (n = 1) => { i += n; col += n; };

  while (i < src.length) {
    const c = src[i];
    if (c === '\r') { advance(); continue; }
    if (c === '\n') {
      push({ kind: 'newline', text: '\n' }, line, col);
      i++; line++; col = 1; lineStart = true;
      continue;
    }
    if (c === ' ' || c === '\t') { advance(); continue; }
    if (c === ';' || (c === '/' && src[i + 1] === '/')) {
      while (i < src.length && src[i] !== '\n') advance();
      continue;
    }
    const l = line, cc = col;

    // Optional opcode prefix at the start of a statement: 4 hex digits starting with a digit, then ':'
    if (lineStart && isDigit(c)) {
      const m = /^([0-9][0-9A-Fa-f]{3}):/.exec(src.slice(i, i + 5));
      if (m) {
        push({ kind: 'prefix', text: m[0], num: parseInt(m[1], 16) }, l, cc);
        advance(5);
        continue;
      }
    }
    lineStart = false;

    if (c === '"') {
      let s = '';
      advance();
      let closed = false;
      while (i < src.length && src[i] !== '\n') {
        const ch = src[i];
        if (ch === '"') { closed = true; advance(); break; }
        if (ch === '\\') {
          const nx = src[i + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\' };
          if (nx !== undefined && nx in map) { s += map[nx]; advance(2); continue; }
          errors.push(new ScriptError(`unknown escape \\${nx ?? ''}`, line, col, file));
          advance();
          continue;
        }
        s += ch;
        advance();
      }
      if (!closed) errors.push(new ScriptError('unterminated string', l, cc, file));
      push({ kind: 'string', text: s, str: s }, l, cc);
      continue;
    }

    // A sign glued to a digit is part of a number literal when it does not directly follow
    // a value character ("x -5" and "= -5" are literals; "a - 5" and "a-5" are subtraction).
    const prevChar = i > 0 ? src[i - 1] : ' ';
    const signedLiteral = (c === '-' || c === '+') && isDigit(src[i + 1] ?? '') && !/[A-Za-z0-9_".]/.test(prevChar);
    if (isDigit(c) || signedLiteral || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++;
      const text = src.slice(i, j);
      const isFloat = text.includes('.');
      const num = Number(text);
      if (Number.isNaN(num) || (text.match(/\./g) ?? []).length > 1) {
        errors.push(new ScriptError(`bad number '${text}'`, l, cc, file));
      }
      push({ kind: isFloat ? 'float' : 'int', text, num }, l, cc);
      advance(j - i);
      continue;
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdent(src[j])) j++;
      const text = src.slice(i, j);
      push({ kind: 'ident', text }, l, cc);
      advance(j - i);
      continue;
    }

    if (c === '-' && src[i + 1] === '>') { push({ kind: 'arrow', text: '->' }, l, cc); advance(2); continue; }
    if (c === ':') { push({ kind: 'colon', text: ':' }, l, cc); advance(); continue; }
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=') { push({ kind: 'op', text: two }, l, cc); advance(2); continue; }
    if ('=<>+-*/%'.includes(c)) { push({ kind: 'op', text: c }, l, cc); advance(); continue; }

    errors.push(new ScriptError(`unexpected character '${c}'`, l, cc, file));
    advance();
  }
  tokens.push({ kind: 'newline', text: '\n', line, col });
  tokens.push({ kind: 'eof', text: '', line, col });
  return { tokens, errors };
}
