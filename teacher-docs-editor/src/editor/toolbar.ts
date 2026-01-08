export function wrapSelection(text: string, from: number, to: number, wrapLeft: string, wrapRight = wrapLeft) {
  return text.slice(0, from) + wrapLeft + text.slice(from, to) + wrapRight + text.slice(to);
}

export function addHeading(text: string, lineStart: number) {
  return text.slice(0, lineStart) + "## " + text.slice(lineStart);
}

export function insertAt(text: string, pos: number, insert: string) {
  return text.slice(0, pos) + insert + text.slice(pos);
}
