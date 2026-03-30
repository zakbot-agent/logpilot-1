import { LogEntry, LogLevel } from './parser';

export interface FilterOptions {
  levels?: LogLevel[];
  since?: Date;
  grep?: string;
  tail?: number;
  head?: number;
}

// --- Time duration parsing ---

const DURATION_REGEX = /^(\d+)\s*(m|min|h|hr|d|day|w|wk)s?$/i;

const DURATION_MS: Record<string, number> = {
  m: 60_000, min: 60_000,
  h: 3_600_000, hr: 3_600_000,
  d: 86_400_000, day: 86_400_000,
  w: 604_800_000, wk: 604_800_000,
};

export function parseSince(value: string): Date {
  const match = value.match(DURATION_REGEX);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const ms = DURATION_MS[unit];
    if (ms) return new Date(Date.now() - amount * ms);
  }
  // Try as date string
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d;
  throw new Error(`Invalid --since value: "${value}". Use formats like 5m, 1h, 2d, 1w, or a date.`);
}

// --- Level filter ---

export function parseLevels(value: string): LogLevel[] {
  return value.split(',').map(l => l.trim().toLowerCase() as LogLevel);
}

// --- Apply all filters ---

export function applyFilters(entries: LogEntry[], options: FilterOptions): LogEntry[] {
  let result = entries;

  if (options.levels && options.levels.length > 0) {
    const levelSet = new Set(options.levels);
    result = result.filter(e => levelSet.has(e.level));
  }

  if (options.since) {
    const since = options.since.getTime();
    result = result.filter(e => e.timestamp !== null && e.timestamp.getTime() >= since);
  }

  if (options.grep) {
    const pattern = options.grep.toLowerCase();
    result = result.filter(e =>
      e.message.toLowerCase().includes(pattern) ||
      e.raw.toLowerCase().includes(pattern)
    );
  }

  if (options.tail !== undefined) {
    result = result.slice(-options.tail);
  }

  if (options.head !== undefined) {
    result = result.slice(0, options.head);
  }

  return result;
}
