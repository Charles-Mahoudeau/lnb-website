/**
 * Whether an SVG looks like it could run code: scripts, foreign content, event handlers or
 * javascript: links. Logos are served as images only, so this is a second lock, not the first.
 */
export function isUnsafeSvg(text: string): boolean {
  return /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(text);
}
