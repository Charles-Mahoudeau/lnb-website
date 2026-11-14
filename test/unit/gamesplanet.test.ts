import { describe, expect, it } from 'vitest';

import {
  decodeEntities,
  discountPercent,
  gamePageUrl,
  isAvailableInFrance,
  isGamesplanetImageUrl,
  parseProducts,
  priceToCents,
  uidFromGameUrl,
  withRef,
  coverSourceUrl,
} from '../../shared/utils/gamesplanet.ts';

const PRODUCT = `
  <product>
    <uid>8822-1</uid>
    <name>Warhammer &amp; Friends: Survivors</name>
    <desc>Ignored &lt;b&gt;text&lt;/b&gt;</desc>
    <price>5.99</price>
    <price_base>7.49</price_base>
    <price_end_at>2026-11-18 01:00:00 +0100</price_end_at>
    <link>https://fr.gamesplanet.com/game/warhammer-survivors-steam-key--8822-1?ref=teknantes</link>
    <publisher>Auroch Digital</publisher>
    <category>Action</category>
    <ean/>
    <age_rating><usk/><pegi>7</pegi><esrb>E10</esrb></age_rating>
    <country_whitelist/>
    <country_blacklist>AE,BR</country_blacklist>
    <steam_id>app/3669620</steam_id>
    <packshot>https://fr.gamesplanet.com/acache/88/22/1/fr/packshot-9e36.jpg</packshot>
    <teaser620>https://fr.gamesplanet.com/acache/88/22/1/fr/t620x300-21e1.jpg</teaser620>
  </product>`;

describe('parseProducts', () => {
  it('reads a product into a compact game', () => {
    const [game] = parseProducts(`<products>${PRODUCT}</products>`);
    expect(game).toEqual({
      uid: '8822-1',
      name: 'Warhammer & Friends: Survivors',
      publisher: 'Auroch Digital',
      category: 'Action',
      priceCents: 599,
      basePriceCents: 749,
      steamId: 'app/3669620',
      pegi: 7,
      url: 'https://fr.gamesplanet.com/game/warhammer-survivors-steam-key--8822-1',
      packshotUrl: 'https://fr.gamesplanet.com/acache/88/22/1/fr/packshot-9e36.jpg',
      teaserUrl: 'https://fr.gamesplanet.com/acache/88/22/1/fr/t620x300-21e1.jpg',
      availableInFrance: true,
      flashEndsAt: new Date('2026-11-18T00:00:00.000Z'),
    });
  });

  it('keeps feed order and skips broken products', () => {
    const second = PRODUCT.replace('8822-1', '4816-1').replace('Warhammer', 'Beyond');
    const broken = '<product><uid>nope</uid><name>Broken</name><price>1.00</price></product>';
    const noPrice = '<product><uid>1-1</uid><name>No price</name></product>';
    const games = parseProducts(`<products>${PRODUCT}${broken}${noPrice}${second}</products>`);
    expect(games.map((g) => g.uid)).toEqual(['8822-1', '4816-1']);
  });

  it('treats empty fields as missing, and never lets the regular price drop under the price', () => {
    const [game] = parseProducts(
      `<product><uid>1-1</uid><name>A</name><price>10.00</price><price_base>4.00</price_base>
        <link>https://fr.gamesplanet.com/game/a--1-1</link><ean/><steam_id/><pegi/></product>`,
    );
    expect(game).toMatchObject({
      basePriceCents: 1000,
      steamId: null,
      pegi: null,
      flashEndsAt: null,
    });
  });

  it('survives an unterminated product and an empty feed', () => {
    expect(parseProducts('<products></products>')).toEqual([]);
    expect(parseProducts('<products><product><uid>1-1</uid>')).toEqual([]);
  });
});

describe('prices', () => {
  it('turns a decimal price into cents without float drift', () => {
    expect(priceToCents('5.99')).toBe(599);
    expect(priceToCents('19.99')).toBe(1999);
    expect(priceToCents('1.82')).toBe(182);
    expect(priceToCents('0')).toBe(0);
    expect(priceToCents('free')).toBeNull();
    expect(priceToCents(null)).toBeNull();
  });

  it('gives a discount only when the price is under the regular one', () => {
    expect(discountPercent(182, 1999)).toBe(91);
    expect(discountPercent(4499, 4999)).toBe(10);
    expect(discountPercent(1000, 1000)).toBeNull();
    expect(discountPercent(0, 0)).toBeNull();
  });
});

describe('availability in France', () => {
  it('follows the blacklist and the whitelist', () => {
    expect(isAvailableInFrance(null, null)).toBe(true);
    expect(isAvailableInFrance(null, 'AE,BR')).toBe(true);
    expect(isAvailableInFrance(null, 'AE, fr')).toBe(false);
    expect(isAvailableInFrance('DE,FR', null)).toBe(true);
    expect(isAvailableInFrance('DE,GB', null)).toBe(false);
  });
});

describe('links', () => {
  it('drops the query from a game page and adds the ref back', () => {
    const url = gamePageUrl('https://fr.gamesplanet.com/game/a--1-1?ref=other&utm=x');
    expect(url).toBe('https://fr.gamesplanet.com/game/a--1-1');
    expect(withRef(url!, 'teknantes')).toBe('https://fr.gamesplanet.com/game/a--1-1?ref=teknantes');
  });

  it('replaces a ref that is already there', () => {
    expect(withRef('https://fr.gamesplanet.com/game/a--1-1?ref=old', 'teknantes')).toBe(
      'https://fr.gamesplanet.com/game/a--1-1?ref=teknantes',
    );
  });

  it('refuses links that are not https', () => {
    expect(gamePageUrl('http://fr.gamesplanet.com/game/a--1-1')).toBeNull();
    expect(gamePageUrl('javascript:alert(1)')).toBeNull();
    expect(gamePageUrl(null)).toBeNull();
  });

  it('reads the uid at the end of a Gamesplanet game page', () => {
    expect(
      uidFromGameUrl('https://fr.gamesplanet.com/game/beast-of-reincarnation-steam-key--8200-1'),
    ).toBe('8200-1');
    expect(uidFromGameUrl('https://gamesplanet.com/game/a--3030-33?ref=x')).toBe('3030-33');
    expect(uidFromGameUrl('https://evil.example/game/a--8200-1')).toBeNull();
    expect(uidFromGameUrl('https://fr.gamesplanet.com.evil.example/game/a--8200-1')).toBeNull();
    expect(uidFromGameUrl('https://fr.gamesplanet.com/')).toBeNull();
    expect(uidFromGameUrl('not a url')).toBeNull();
  });
});

describe('covers', () => {
  it('only come from Gamesplanet hosts over https', () => {
    expect(isGamesplanetImageUrl('https://fr.gamesplanet.com/acache/a.jpg')).toBe(true);
    expect(isGamesplanetImageUrl('https://gpstatic.com/acache/a.jpg')).toBe(true);
    expect(isGamesplanetImageUrl('http://gpstatic.com/a.jpg')).toBe(false);
    expect(isGamesplanetImageUrl('https://gpstatic.com.evil.example/a.jpg')).toBe(false);
    expect(isGamesplanetImageUrl('https://evilgpstatic.com/a.jpg')).toBe(false);
    expect(isGamesplanetImageUrl('http://169.254.169.254/latest')).toBe(false);
  });
});

describe('coverSourceUrl', () => {
  it('moves covers from fr.gamesplanet.com, which refuses robots, to gpstatic.com', () => {
    expect(coverSourceUrl('https://fr.gamesplanet.com/acache/88/22/1/fr/t620x300-21e1.jpg')).toBe(
      'https://gpstatic.com/acache/88/22/1/fr/t620x300-21e1.jpg',
    );
    expect(coverSourceUrl('https://gpstatic.com/acache/a.jpg')).toBe(
      'https://gpstatic.com/acache/a.jpg',
    );
    expect(coverSourceUrl('http://169.254.169.254/x')).toBe('http://169.254.169.254/x');
    expect(coverSourceUrl('nope')).toBe('nope');
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities, and leaves unknown ones', () => {
    expect(decodeEntities('A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41; &unknown;')).toBe(
      'A & B <c> "d" \'e\' A &unknown;',
    );
  });
});
