/** "Tuesday 20 October" and "08:00" of an instant, in Paris time, for sentences about when. */
export function parisParts(iso: string, locale: string): { date: string; time: string } {
  const at = new Date(iso);
  const timeZone = 'Europe/Paris';
  return {
    date: new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone,
    }).format(at),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(at),
  };
}
