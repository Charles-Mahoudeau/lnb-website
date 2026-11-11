import writeExcelFile from 'write-excel-file/node';

import type { PartnerReferentRole } from '#shared/schemas/partner-events';

// The spreadsheet the organizer validates teams against, mirrored sheet for sheet: `Manager` (one
// row per team) and `Joueur` (one row per player), plus a third sheet of interest for LNB's own
// use. The headers are the organizer's, in French. See docs/partner-events.md.

export interface ExportReferent {
  pseudo: string;
  email: string;
  birthDate: string | null;
  role: PartnerReferentRole;
}

export interface ExportTeam {
  league: string;
  name: string;
  abbreviation: string;
  referent: ExportReferent;
  players: {
    inGameName: string;
    role: 'captain' | 'starter' | 'substitute';
    email: string;
    birthDate: string;
  }[];
}

export interface ExportInterest {
  name: string;
  school: string | null;
  email: string;
  league: string;
  inGameName: string;
  rank: string;
  status: string;
}

const ROLE = { captain: 'Capitaine', starter: 'Joueur', substitute: 'Remplaçant' } as const;

/** Dates are stored as `YYYY-MM-DD`: a date cell, shown as dd/mm/yyyy. */
function dateCell(value: string | null) {
  if (!value) return { value: '' };
  return { value: new Date(`${value}T00:00:00Z`), type: Date, format: 'dd/mm/yyyy' } as const;
}

const header = (labels: string[]) =>
  labels.map((value) => ({ value, fontWeight: 'bold' }) as const);
const text = (value: string) => ({ value });

/** The sheets as rows of cells, kept apart from the library so tests can read them. */
export function buildSheets(teams: ExportTeam[], interest: ExportInterest[]) {
  return {
    Manager: [
      header([
        'Ligue',
        'Nom de l’équipe',
        'Abréviation',
        'Pseudo du manager',
        'Rôle',
        'Mail',
        'Date de naissance',
      ]),
      ...teams.map((team) => [
        text(team.league),
        text(team.name),
        text(team.abbreviation),
        text(team.referent.pseudo),
        text(team.referent.role),
        text(team.referent.email),
        dateCell(team.referent.birthDate),
      ]),
    ],
    Joueur: [
      header(['Ligue', 'Appartenance équipe', 'Pseudo', 'Rôle', 'Mail', 'Date de naissance']),
      ...teams.flatMap((team) =>
        team.players.map((player) => [
          text(team.league),
          text(team.name),
          text(player.inGameName),
          text(ROLE[player.role]),
          text(player.email),
          dateCell(player.birthDate),
        ]),
      ),
    ],
    Intérêt: [
      header(['Nom', 'École', 'Mail', 'Ligue', 'Pseudo', 'Rang', 'Statut']),
      ...interest.map((row) => [
        text(row.name),
        text(row.school ?? ''),
        text(row.email),
        text(row.league),
        text(row.inGameName),
        text(row.rank),
        text(row.status),
      ]),
    ],
  };
}

/** The .xlsx file as bytes. */
export async function exportXlsx(teams: ExportTeam[], interest: ExportInterest[]): Promise<Buffer> {
  const sheets = buildSheets(teams, interest);
  const columns = (widths: number[]) => widths.map((width) => ({ width }));
  return writeExcelFile([
    { data: sheets.Manager, sheet: 'Manager', columns: columns([12, 26, 14, 22, 18, 30, 18]) },
    { data: sheets.Joueur, sheet: 'Joueur', columns: columns([12, 26, 22, 14, 30, 18]) },
    {
      data: sheets['Intérêt'],
      sheet: 'Intérêt',
      columns: columns([24, 12, 30, 12, 22, 16, 12]),
    },
  ]).toBuffer();
}
