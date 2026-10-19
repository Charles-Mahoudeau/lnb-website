import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import {
  TEAM_ICONS,
  TEAM_PROBLEMS,
  teamMemberBody,
  teamPoleBody,
  teamPolePatchBody,
  teamSettingsBody,
} from '../../shared/schemas/team.ts';
import { publicTeamPhoto } from '../../shared/utils/team.ts';

describe('team join link', () => {
  it('accepts an https link, trimmed', () => {
    expect(teamSettingsBody.parse({ joinUrl: '  https://forms.example.com/join ' })).toEqual({
      joinUrl: 'https://forms.example.com/join',
    });
  });

  it('turns an empty link into null, which hides the button', () => {
    expect(teamSettingsBody.parse({ joinUrl: '' })).toEqual({ joinUrl: null });
    expect(teamSettingsBody.parse({ joinUrl: null })).toEqual({ joinUrl: null });
  });

  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'https://',
    'example.com',
    'https:// x.com',
  ])('refuses %s', (joinUrl) => {
    expect(teamSettingsBody.safeParse({ joinUrl }).success).toBe(false);
  });
});

describe('team bodies', () => {
  const pole = {
    name: { en: 'Events', fr: 'Événements' },
    description: { en: '', fr: '' },
    icon: TEAM_ICONS[1],
    featured: false,
  };

  it('requires a name in both languages, but not a description', () => {
    expect(teamPoleBody.safeParse(pole).success).toBe(true);
    expect(teamPoleBody.safeParse({ ...pole, name: { en: 'Events', fr: ' ' } }).success).toBe(
      false,
    );
  });

  it('only offers the listed icons', () => {
    expect(teamPoleBody.safeParse({ ...pole, icon: 'i-lucide-skull' }).success).toBe(false);
  });

  it('refuses an empty patch', () => {
    expect(teamPolePatchBody.safeParse({}).success).toBe(false);
    expect(teamPolePatchBody.safeParse({ featured: true }).success).toBe(true);
  });

  it('requires a role in both languages, and the pole', () => {
    const member = {
      userId: 'abc',
      poleId: '0d9b7f0e-7a52-4f7e-9f0f-3d9b6a4a3b11',
      role: { en: 'Treasurer', fr: 'Trésorier' },
      bio: { en: '', fr: '' },
      visible: true,
    };
    expect(teamMemberBody.safeParse(member).success).toBe(true);
    expect(teamMemberBody.safeParse({ ...member, role: { en: 'Treasurer', fr: '' } }).success).toBe(
      false,
    );
    expect(teamMemberBody.safeParse({ ...member, poleId: 'nope' }).success).toBe(false);
  });
});

describe('team photos', () => {
  it('moves a stored avatar to the public route', () => {
    expect(publicTeamPhoto('/api/avatars/abc123')).toBe('/api/team/photos/abc123');
  });

  it('gives no photo for anything else', () => {
    expect(publicTeamPhoto(null)).toBeNull();
    expect(publicTeamPhoto('https://example.com/me.jpg')).toBeNull();
  });
});

describe('team translations', () => {
  it('has a message for every problem and every icon, in both languages', () => {
    for (const messages of [en, fr]) {
      for (const problem of TEAM_PROBLEMS) {
        expect(messages.admin.team.errors).toHaveProperty(problem);
      }
      for (const icon of TEAM_ICONS) {
        expect(messages.admin.team.icons).toHaveProperty(icon.replace('i-lucide-', ''));
      }
    }
  });
});
