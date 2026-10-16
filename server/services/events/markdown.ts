import MarkdownIt from 'markdown-it';

// Event descriptions are Markdown written by events managers. They're rendered on the server, so
// the page gets HTML that can't hold anything but the formatting below. No raw HTML (escaped),
// no images, and links only to http, https and mailto, opening in a new tab. No Nuxt imports,
// so unit tests can load it.

const md = new MarkdownIt('default', {
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});
md.disable(['image', 'table', 'heading', 'lheading', 'hr', 'code', 'fence']);

const SAFE_LINK = /^(?:https?:|mailto:)/i;
md.validateLink = (url) => SAFE_LINK.test(url.trim());

const renderLink =
  md.renderer.rules.link_open ??
  ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options));
md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  const token = tokens[i]!;
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer nofollow');
  return renderLink(tokens, i, options, env, self);
};

/** The description as HTML, safe to render with v-html. */
export function renderDescription(markdown: string): string {
  return md.render(markdown);
}

/**
 * The description as plain text, for the BDE website and social embeds: the words, with a line
 * break between paragraphs and list items, and links reduced to their text.
 */
export function descriptionText(markdown: string): string {
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };
  for (const token of md.parse(markdown, {})) {
    if (token.type === 'inline') {
      for (const child of token.children ?? []) {
        if (child.type === 'text' || child.type === 'code_inline') line += child.content;
        else if (child.type === 'softbreak' || child.type === 'hardbreak') line += '\n';
      }
    } else if (token.type === 'list_item_open') {
      flush();
      line = '- ';
    } else if (token.type === 'paragraph_close' || token.type === 'list_item_close') {
      flush();
    }
  }
  flush();
  return lines.join('\n').replace(/^- $/gm, '');
}

/** The first `max` characters of the plain text, cut at a word, for a meta description. */
export function descriptionSummary(markdown: string, max = 200): string {
  const text = descriptionText(markdown).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max / 2 ? cut.lastIndexOf(' ') : cut.length)}…`;
}
