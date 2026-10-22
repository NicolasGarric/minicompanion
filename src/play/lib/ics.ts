import { download, slug } from '../../core/lib/image';
import { APP_NAME } from '../../core/brand';

/** Calendar file (.ics) for one event: opens in every calendar app, no account or API needed. */
export function downloadIcs(e: { id: string; title: string; start: string; end: string; location?: string; description?: string; url?: string }) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${APP_NAME}//PLAY//EN`,
    'BEGIN:VEVENT',
    `UID:${e.id}@${APP_NAME.toLowerCase()}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : '',
    e.description ? `DESCRIPTION:${esc(e.description)}` : '',
    e.url ? `URL:${e.url}` : '',
    // Reminder the day before (in-app reminders cover the rest)
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(e.title)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  download(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), `${slug(e.title)}.ics`);
}
