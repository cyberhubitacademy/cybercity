// GTA-style rich text for HUD, help boxes, tutorial cards and How to Play.
//   [y]Coral Café[/y]  yellow = destination      [b]Max[/b]  blue = ally / target
//   [r]Pink Tide[/r]   red = enemy               [g]..[/g] green, [p]..[/p] pink
//   ~E~ / ~Shift~ / ~Mouse~  render as keycaps
// Anything else is plain text (never parsed as HTML).

const COLOR_TAGS: Record<string, string> = { y: 'cc-c-y', b: 'cc-c-b', r: 'cc-c-r', g: 'cc-c-g', p: 'cc-c-p' };

/** Keycap element (also used by prompts and the How to Play keyboard). */
export function keycap(label: string, wide = false): HTMLElement {
  const k = document.createElement('kbd');
  k.className = `cc-keycap${wide || label.length > 2 ? ' wide' : ''}`;
  k.textContent = label;
  return k;
}

/** Parse markup into DOM nodes appended to `into` (returns `into`). */
export function rich<T extends HTMLElement>(into: T, text: string): T {
  const re = /\[(\/?)([ybrgp])\]|~([^~\s][^~]{0,10})~/g;
  const stack: HTMLElement[] = [into];
  let last = 0;
  let m: RegExpExecArray | null;
  const top = () => stack[stack.length - 1];
  while ((m = re.exec(text))) {
    if (m.index > last) top().append(text.slice(last, m.index));
    last = re.lastIndex;
    if (m[3]) {
      top().append(keycap(m[3]));
    } else if (m[1]) {
      if (stack.length > 1) stack.pop();
    } else {
      const span = document.createElement('span');
      span.className = COLOR_TAGS[m[2]];
      top().append(span);
      stack.push(span);
    }
  }
  if (last < text.length) top().append(text.slice(last));
  return into;
}

/** Strip markup to plain text (for comparisons / accessibility labels). */
export function plain(text: string): string {
  return text.replace(/\[\/?[ybrgp]\]/g, '').replace(/~([^~]+)~/g, '$1');
}
