// Where the startup migration stands (server/plugins/migrate.ts), read by /api/health so the
// platform only routes traffic to an instance whose database is ready.
export type MigrationStatus = 'running' | 'done' | 'failed';

let status: MigrationStatus = 'running';

export function setMigrationStatus(next: MigrationStatus): void {
  status = next;
}

export function getMigrationStatus(): MigrationStatus {
  return status;
}
