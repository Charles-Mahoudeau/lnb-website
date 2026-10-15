import { describe, expect, it } from 'vitest';

import {
  canLinkFromSchool,
  isAllowedRedirect,
  isLinkApp,
  normalizeLinkCode,
} from '../../shared/utils/link-apps.ts';
import type { LinkApp } from '../../shared/utils/link-apps.ts';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ISEG = '8dab9574-4b8e-4eec-8e5e-791d6835fdea';

describe('normalizeLinkCode', () => {
  it('keeps the digits of a typed or pasted code', () => {
    expect(normalizeLinkCode('123 456')).toBe('123456');
    expect(normalizeLinkCode('123-456')).toBe('123456');
  });

  it('cuts a code after 6 digits', () => {
    expect(normalizeLinkCode('1234567')).toBe('123456');
  });
});

describe('isLinkApp', () => {
  it('accepts a listed app', () => {
    expect(isLinkApp('warden')).toBe(true);
  });

  it('refuses unknown IDs, including inherited object keys', () => {
    expect(isLinkApp('other')).toBe(false);
    expect(isLinkApp('toString')).toBe(false);
    expect(isLinkApp(undefined)).toBe(false);
  });
});

describe('canLinkFromSchool', () => {
  it('lets every school link an app without a school list', () => {
    expect(canLinkFromSchool({ name: 'Open' }, ISEG)).toBe(true);
  });

  it('limits an app to its schools', () => {
    const app: LinkApp = { name: 'Epitech only', schools: [EPITECH] };
    expect(canLinkFromSchool(app, EPITECH.toUpperCase())).toBe(true);
    expect(canLinkFromSchool(app, ISEG)).toBe(false);
  });
});

describe('isAllowedRedirect', () => {
  const app: LinkApp = {
    name: 'App',
    redirectUris: ['http://127.0.0.1/callback', 'https://app.example/linked'],
  };

  it('accepts a loopback redirect on any port', () => {
    expect(isAllowedRedirect(app, 'http://127.0.0.1:51234/callback')).toBe(true);
    expect(isAllowedRedirect(app, 'http://127.0.0.1/callback?session=1')).toBe(true);
  });

  it('matches other redirects on origin and path', () => {
    expect(isAllowedRedirect(app, 'https://app.example/linked')).toBe(true);
    expect(isAllowedRedirect(app, 'https://app.example:8443/linked')).toBe(false);
    expect(isAllowedRedirect(app, 'https://app.example/other')).toBe(false);
  });

  it('refuses other hosts, fragments, credentials and junk', () => {
    expect(isAllowedRedirect(app, 'https://evil.example/linked')).toBe(false);
    expect(isAllowedRedirect(app, 'http://127.0.0.1:80/callback#x')).toBe(false);
    expect(isAllowedRedirect(app, 'http://user@127.0.0.1/callback')).toBe(false);
    expect(isAllowedRedirect(app, 'not a url')).toBe(false);
    expect(isAllowedRedirect({ name: 'None' }, 'http://127.0.0.1/callback')).toBe(false);
  });
});
