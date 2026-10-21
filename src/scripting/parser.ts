import { ScriptError } from './types';
import { Token, tokenize } from './lexer';

// Recursive-descent parser producing a small AST. Grammar: docs/mission_language.md

export interface Pos { line: number; col: number }

export type Atom =
  | ({ k: 'int'; v: number } & Pos)
  | ({ k: 'float'; v: number } & Pos)
  | ({ k: 'bool'; v: boolean } & Pos)
  | ({ k: 'str'; v: string } & Pos)
  | ({ k: 'var'; name: string } & Pos);

export type BinOp = '+' | '-' | '*' | '/' | '%';
export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

export type Expr = { k: 'atom'; a: Atom } | { k: 'bin'; op: BinOp; l: Atom; r: Atom };

export type Cond =
  | ({ k: 'atom'; neg: boolean; a: Atom } & Pos)
  | ({ k: 'cmp'; neg: boolean; op: CmpOp; l: Atom; r: Atom } & Pos)
  | ({ k: 'cmd'; neg: boolean; name: string; args: Atom[] } & Pos);

export type Stmt =
  | ({ k: 'start'; name: string } & Pos)
  | ({ k: 'end' } & Pos)
  | ({ k: 'label'; name: string } & Pos)
  | ({ k: 'jump'; op: 'GOTO' | 'GOSUB' | 'START_THREAD'; label: string } & Pos)
  | ({ k: 'return' } & Pos)
  | ({ k: 'endThread' } & Pos)
  | ({ k: 'if'; cond: Cond; then: Stmt[]; else: Stmt[] | null } & Pos)
  | ({ k: 'while'; cond: Cond; body: Stmt[] } & Pos)
  | ({ k: 'decl'; scope: 'local' | 'global'; name: string; init: Expr | null } & Pos)
  | ({ k: 'set'; target: string; expr: Expr } & Pos)
  | ({ k: 'wait'; arg: Atom } & Pos)
  | ({ k: 'cmd'; name: string; args: Atom[]; result: string | null; prefix: number | null } & Pos);

const KEYWORDS = new Set([
  'SCRIPT_START', 'SCRIPT_END', 'IF', 'ELSE', 'END_IF', 'WHILE', 'END_WHILE', 'LOCAL', 'GLOBAL', 'SET',
  'GOTO', 'GOSUB', 'RETURN', 'START_THREAD', 'END_THREAD', 'WAIT', 'NOT', 'TRUE', 'FALSE',
]);
export const isKeyword = (s: string) => KEYWORDS.has(s.toUpperCase());

class Parser {
  private i = 0;
  errors: ScriptError[] = [];
  constructor(private t: Token[], private file: string) {}

  private peek(o = 0): Token { return this.t[Math.min(this.i + o, this.t.length - 1)]; }
  private next(): Token { return this.t[Math.min(this.i++, this.t.length - 1)]; }
  private err(msg: string, tok: Token): never {
    throw new ScriptError(msg, tok.line, tok.col, this.file);
  }
  private kw(tok: Token): string { return tok.kind === 'ident' ? tok.text.toUpperCase() : ''; }
  private atEol(): boolean { const k = this.peek().kind; return k === 'newline' || k === 'eof'; }
  private endLine(): void {
    if (!this.atEol()) this.err(`unexpected '${this.peek().text}' at end of statement`, this.peek());
    while (this.peek().kind === 'newline') this.next();
  }
  /** Skip to the next line after an error so later errors are still reported. */
  private recover(): void {
    while (!this.atEol()) this.next();
    while (this.peek().kind === 'newline') this.next();
  }

  parseProgram(): Stmt[] {
    while (this.peek().kind === 'newline') this.next();
    return this.block(new Set());
  }

  /** Parse statements until one of the terminator keywords (not consumed) or EOF. */
  private block(terms: Set<string>): Stmt[] {
    const out: Stmt[] = [];
    while (this.peek().kind !== 'eof') {
      const tok = this.peek();
      if (terms.has(this.kw(tok)) && this.peek(1).kind !== 'colon') break;
      try {
        const s = this.statement();
        if (s) out.push(s);
      } catch (e) {
        if (e instanceof ScriptError) { this.errors.push(e); this.recover(); } else throw e;
      }
    }
    return out;
  }

  private ident(what: string): Token {
    const tok = this.next();
    if (tok.kind !== 'ident') this.err(`expected ${what}`, tok);
    return tok;
  }

  private atom(): Atom {
    const tok = this.next();
    const pos = { line: tok.line, col: tok.col };
    switch (tok.kind) {
      case 'int': return { k: 'int', v: tok.num ?? 0, ...pos };
      case 'float': return { k: 'float', v: tok.num ?? 0, ...pos };
      case 'string': return { k: 'str', v: tok.str ?? '', ...pos };
      case 'ident': {
        const up = tok.text.toUpperCase();
        if (up === 'TRUE' || up === 'FALSE') return { k: 'bool', v: up === 'TRUE', ...pos };
        if (isKeyword(tok.text)) this.err(`keyword ${up} cannot be used as a value`, tok);
        return { k: 'var', name: tok.text, ...pos };
      }
      default: return this.err(`expected a value, got '${tok.text === '\n' ? 'end of line' : tok.text}'`, tok);
    }
  }

  private expr(): Expr {
    const l = this.atom();
    const p = this.peek();
    if (p.kind === 'op' && ['+', '-', '*', '/', '%'].includes(p.text)) {
      this.next();
      const r = this.atom();
      return { k: 'bin', op: p.text as BinOp, l, r };
    }
    return { k: 'atom', a: l };
  }

  private cond(): Cond {
    const start = this.peek();
    const pos = { line: start.line, col: start.col };
    let neg = false;
    while (this.kw(this.peek()) === 'NOT') { this.next(); neg = !neg; }
    const first = this.peek();
    // command condition: an identifier that is not a known variable-like token followed by args
    if (first.kind === 'ident' && /^[A-Z][A-Z0-9_]*$/.test(first.text) && !isKeyword(first.text) && first.text.includes('_') && this.looksLikeCommand()) {
      this.next();
      const args: Atom[] = [];
      while (!this.atEol()) args.push(this.atom());
      return { k: 'cmd', neg, name: first.text.toUpperCase(), args, ...pos };
    }
    const l = this.atom();
    const p = this.peek();
    if (p.kind === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(p.text)) {
      this.next();
      const r = this.atom();
      return { k: 'cmp', neg, op: p.text as CmpOp, l, r, ...pos };
    }
    return { k: 'atom', neg, a: l, ...pos };
  }

  /** Commands are UPPER_SNAKE; a following comparison operator means it's a variable. */
  private looksLikeCommand(): boolean {
    const after = this.peek(1);
    return !(after.kind === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(after.text));
  }

  private statement(): Stmt | null {
    let tok = this.peek();
    let prefix: number | null = null;
    if (tok.kind === 'prefix') {
      this.next();
      prefix = tok.num ?? null;
      tok = this.peek();
    }
    const pos = { line: tok.line, col: tok.col };
    if (tok.kind !== 'ident') this.err(`expected a statement, got '${tok.text}'`, tok);

    // label
    if (this.peek(1).kind === 'colon' && prefix === null) {
      this.next(); this.next();
      if (isKeyword(tok.text)) this.err(`keyword ${tok.text} cannot be a label`, tok);
      if (!this.atEol()) return { k: 'label', name: tok.text, ...pos }; // statement may follow on the same line
      this.endLine();
      return { k: 'label', name: tok.text, ...pos };
    }

    const word = tok.text.toUpperCase();
    if (prefix !== null && isKeyword(word) && word !== 'WAIT') this.err(`opcode prefix not allowed before ${word}`, tok);
    this.next();
    switch (word) {
      case 'SCRIPT_START': {
        const n = this.next();
        if (n.kind !== 'ident' && n.kind !== 'string') this.err('expected script name', n);
        this.endLine();
        return { k: 'start', name: n.kind === 'string' ? n.str ?? '' : n.text, ...pos };
      }
      case 'SCRIPT_END': this.endLine(); return { k: 'end', ...pos };
      case 'GOTO': case 'GOSUB': case 'START_THREAD': {
        const l = this.ident('label name');
        this.endLine();
        return { k: 'jump', op: word, label: l.text, ...pos };
      }
      case 'RETURN': this.endLine(); return { k: 'return', ...pos };
      case 'END_THREAD': this.endLine(); return { k: 'endThread', ...pos };
      case 'WAIT': {
        const a = this.atom();
        this.endLine();
        return { k: 'wait', arg: a, ...pos };
      }
      case 'LOCAL': case 'GLOBAL': {
        const n = this.ident('variable name');
        if (isKeyword(n.text)) this.err(`keyword ${n.text} cannot be a variable`, n);
        let init: Expr | null = null;
        if (this.peek().kind === 'op' && this.peek().text === '=') { this.next(); init = this.expr(); }
        this.endLine();
        return { k: 'decl', scope: word === 'LOCAL' ? 'local' : 'global', name: n.text, init, ...pos };
      }
      case 'SET': {
        const n = this.ident('variable name');
        const eq = this.next();
        if (eq.kind !== 'op' || eq.text !== '=') this.err("expected '='", eq);
        const e = this.expr();
        this.endLine();
        return { k: 'set', target: n.text, expr: e, ...pos };
      }
      case 'IF': {
        const c = this.cond();
        this.endLine();
        const then = this.block(new Set(['ELSE', 'END_IF']));
        let els: Stmt[] | null = null;
        if (this.kw(this.peek()) === 'ELSE') {
          this.next(); this.endLine();
          els = this.block(new Set(['END_IF']));
        }
        if (this.kw(this.peek()) !== 'END_IF') {
          // keep the parsed body so later errors are still reported
          this.errors.push(new ScriptError('IF without END_IF', tok.line, tok.col, this.file));
        } else {
          this.next(); this.endLine();
        }
        return { k: 'if', cond: c, then, else: els, ...pos };
      }
      case 'WHILE': {
        const c = this.cond();
        this.endLine();
        const body = this.block(new Set(['END_WHILE']));
        if (this.kw(this.peek()) !== 'END_WHILE') {
          this.errors.push(new ScriptError('WHILE without END_WHILE', tok.line, tok.col, this.file));
        } else {
          this.next(); this.endLine();
        }
        return { k: 'while', cond: c, body, ...pos };
      }
      case 'ELSE': case 'END_IF': case 'END_WHILE':
        this.err(`${word} without matching ${word === 'END_WHILE' ? 'WHILE' : 'IF'}`, tok);
        break;
      default: break;
    }
    if (isKeyword(word)) this.err(`unexpected keyword ${word}`, tok);
    // command
    const args: Atom[] = [];
    let result: string | null = null;
    while (!this.atEol()) {
      if (this.peek().kind === 'arrow') {
        this.next();
        const r = this.ident('result variable after ->');
        result = r.text;
        break;
      }
      args.push(this.atom());
    }
    this.endLine();
    return { k: 'cmd', name: word, args, result, prefix, ...pos };
  }
}

export function parse(src: string, file = '<script>'): { ast: Stmt[]; errors: ScriptError[] } {
  const { tokens, errors } = tokenize(src, file);
  const p = new Parser(tokens, file);
  const ast = p.parseProgram();
  return { ast, errors: [...errors, ...p.errors] };
}
