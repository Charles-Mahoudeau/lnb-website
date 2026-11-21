import { afterEach, describe, expect, it, vi } from 'vitest';

import { protectMarkdown, translateMarkdown } from '../../server/services/translation.ts';

const env = { DEEPL_API_KEY: 'key:fx' } as NodeJS.ProcessEnv;

afterEach(() => vi.unstubAllGlobals());

describe('protectMarkdown', () => {
  it('keeps code, links and URLs out of the text and puts them back', () => {
    const markdown =
      'Use `/home` and see [the wiki](https://lnb.fr/wiki) or https://lnb.fr/x.\n\n```js\nconst a = 1 < 2;\n```\n\nBye & <thanks>';
    const { text, restore } = protectMarkdown(markdown);
    expect(text).not.toContain('/home');
    expect(text).not.toContain('https://');
    expect(text).not.toContain('const a');
    expect(text).toContain('&amp; &lt;thanks&gt;');
    expect(restore(text)).toBe(markdown);
  });

  it('keeps an unclosed fence to the end', () => {
    const { text } = protectMarkdown('Hi\n```\ncode');
    expect(text).not.toContain('code');
  });
});

describe('translateMarkdown', () => {
  it('refuses without a key', async () => {
    await expect(translateMarkdown(['a'], 'en', {})).rejects.toMatchObject({
      status: 503,
      data: { problem: 'translationUnavailable' },
    });
  });

  it('sends the texts, skips the empty ones and restores what was protected', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { text: string[] };
      return Promise.resolve(
        Response.json({
          translations: body.text.map((text) => ({ text: `FR(${text})` })),
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await translateMarkdown(['Hello `x`', '', 'Body https://a.b/c'], 'en', env);
    expect(result).toEqual(['FR(Hello `x`)', '', 'FR(Body https://a.b/c)']);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect((init.headers as Record<string, string>).Authorization).toBe('DeepL-Auth-Key key:fx');
    const sent = JSON.parse(init.body as string) as { text: string[]; target_lang: string };
    expect(sent.text).toHaveLength(2);
    expect(sent.text.join()).not.toContain('`x`');
    expect(sent.target_lang).toBe('FR');
  });

  it('maps DeepL failures', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 456 })));
    await expect(translateMarkdown(['a'], 'fr', env)).rejects.toMatchObject({
      status: 429,
      data: { problem: 'translationQuota' },
    });
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 500 })));
    await expect(translateMarkdown(['a'], 'fr', env)).rejects.toMatchObject({ status: 502 });
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network')));
    await expect(translateMarkdown(['a'], 'fr', env)).rejects.toMatchObject({ status: 502 });
  });
});
