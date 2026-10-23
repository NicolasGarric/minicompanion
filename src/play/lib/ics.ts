import { download, slug } from '../../core/lib/image';
import { APP_NAME } from '../../core/brand';

export interface IcsEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  url?: string;
}

/**
 * Calendar file (.ics) for one event, or several (one per round of a multi-week tournament):
 * opens in every calendar app, no account or API needed. Each event reminds the day before and one hour before.
 */
export function downloadIcs(events: IcsEvent | IcsEvent[], fileName?: string) {
  const list = Array.isArray(events) ? events : [events];
  if (!list.length) return;
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const alarm = (e: IcsEvent, trigger: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${APP_NAME}//PLAY//EN`,
    ...list.flatMap((e) => [
      'BEGIN:VEVENT',
      `UID:${e.id}@${APP_NAME.toLowerCase()}`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(e.title)}`,
      e.location ? `LOCATION:${esc(e.location)}` : '',
      e.description ? `DESCRIPTION:${esc(e.description)}` : '',
      e.url ? `URL:${e.url}` : '',
      ...alarm(e, '-P1D'),
      ...alarm(e, '-PT1H'),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].filter(Boolean);
  download(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), `${slug(fileName ?? list[0].title)}.ics`);
}
