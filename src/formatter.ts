import { LogEntry } from './parser';

export type OutputFormat = 'colored' | 'table' | 'json' | 'compact';

// ANSI color codes
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
};

const LEVEL_STYLES: Record<string, { color: string; badge: string }> = {
  error:   { color: C.red,    badge: `${C.bgRed}${C.white}${C.bold} ERROR ${C.reset}` },
  warn:    { color: C.yellow, badge: `${C.yellow}${C.bold} WARN ${C.reset}` },
  info:    { color: C.blue,   badge: `${C.blue} INFO ${C.reset}` },
  debug:   { color: C.gray,   badge: `${C.gray} DEBUG${C.reset}` },
  unknown: { color: C.dim,    badge: `${C.dim}  --- ${C.reset}` },
};

function formatTimestamp(d: Date | null): string {
  if (!d) return '                   ';
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// --- Colored output (default) ---

function formatColored(entry: LogEntry): string {
  const style = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.unknown;
  const ts = entry.timestamp ? `${C.dim}${formatTimestamp(entry.timestamp)}${C.reset} ` : '';
  const extras = Object.keys(entry.extra).length > 0
    ? ` ${C.dim}${JSON.stringify(entry.extra)}${C.reset}`
    : '';
  return `${ts}${style.badge} ${style.color}${entry.message}${C.reset}${extras}`;
}

// --- Table output ---

function formatTableHeader(): string {
  const sep = `${C.dim}|${C.reset}`;
  return [
    `${C.bold}${'Timestamp'.padEnd(19)}${C.reset}`,
    `${C.bold}${'Level'.padEnd(7)}${C.reset}`,
    `${C.bold}Message${C.reset}`,
  ].join(` ${sep} `) + '\n' + C.dim + '-'.repeat(80) + C.reset;
}

function formatTableRow(entry: LogEntry): string {
  const style = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.unknown;
  const sep = `${C.dim}|${C.reset}`;
  return [
    `${C.dim}${formatTimestamp(entry.timestamp)}${C.reset}`,
    `${style.color}${entry.level.toUpperCase().padEnd(7)}${C.reset}`,
    `${style.color}${entry.message}${C.reset}`,
  ].join(` ${sep} `);
}

// --- Compact output ---

function formatCompact(entry: LogEntry): string {
  const lvl = entry.level.charAt(0).toUpperCase();
  const ts = entry.timestamp ? formatTimestamp(entry.timestamp).slice(11) : '        ';
  return `${ts} ${lvl} ${entry.message}`;
}

// --- JSON output ---

function entriesToJson(entries: LogEntry[]): string {
  const cleaned = entries.map(e => ({
    timestamp: e.timestamp?.toISOString() ?? null,
    level: e.level,
    message: e.message,
    ...e.extra,
  }));
  return JSON.stringify(cleaned, null, 2);
}

// --- Public API ---

export function formatEntries(entries: LogEntry[], format: OutputFormat): string {
  if (format === 'json') {
    return entriesToJson(entries);
  }

  const lines: string[] = [];

  if (format === 'table') {
    lines.push(formatTableHeader());
    for (const entry of entries) lines.push(formatTableRow(entry));
  } else if (format === 'compact') {
    for (const entry of entries) lines.push(formatCompact(entry));
  } else {
    for (const entry of entries) lines.push(formatColored(entry));
  }

  return lines.join('\n');
}

export function formatSingleEntry(entry: LogEntry, format: OutputFormat): string {
  switch (format) {
    case 'table': return formatTableRow(entry);
    case 'compact': return formatCompact(entry);
    case 'json': return JSON.stringify({
      timestamp: entry.timestamp?.toISOString() ?? null,
      level: entry.level,
      message: entry.message,
      ...entry.extra,
    });
    default: return formatColored(entry);
  }
}
