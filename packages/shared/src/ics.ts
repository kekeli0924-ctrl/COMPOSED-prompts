import type { StudyBlock } from './study-schedule.js';

// RFC 5545 text escaping: backslash, semicolon, comma, newline.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// '2026-06-12T19:00:00' (local floating) -> '20260612T190000' (no Z, no TZID).
function toIcsLocal(dt: string): string {
  return dt.replace(/[-:]/g, '').replace(/\.\d+$/, '');
}

function icsStampUtc(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Note: line folding (RFC 5545 §3.1, >75 octets) is intentionally omitted — study
// SUMMARY lines stay well under 75 chars for realistic course labels, and Google /
// Apple / Outlook all import unfolded lines fine.
export function buildIcs(
  blocks: StudyBlock[],
  opts: { courseLabel: string; assessmentType: string },
): string {
  const dtstamp = icsStampUtc(new Date());
  const summary = escapeText(`Study: ${opts.courseLabel} (${opts.assessmentType})`);
  const description = escapeText('Composed study session.');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Composed//Study Schedule//EN',
    'CALSCALE:GREGORIAN',
  ];

  blocks.forEach((b, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:composed-${i}-${toIcsLocal(b.start)}@composed.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${toIcsLocal(b.start)}`,
      `DTEND:${toIcsLocal(b.end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Study time',
      'TRIGGER:-PT10M',
      'END:VALARM',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
