import * as readline from 'readline';
import * as fs from 'fs';

// Canonical log entry
export interface LogEntry {
  timestamp: Date | null;
  level: LogLevel;
  message: string;
  raw: string;
  extra: Record<string, unknown>;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'unknown';

export type LogFormat = 'json' | 'text' | 'unknown';

// --- Level normalization ---

const LEVEL_MAP: Record<string, LogLevel> = {
  error: 'error', err: 'error', fatal: 'error', critical: 'error', crit: 'error',
  warn: 'warn', warning: 'warn',
  info: 'info', information: 'info', notice: 'info',
  debug: 'debug', trace: 'debug', verbose: 'debug',
};

function normalizeLevel(raw: string): LogLevel {
  return LEVEL_MAP[raw.toLowerCase().trim()] ?? 'unknown';
}

// --- Timestamp parsing ---

function parseTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    // Unix seconds or ms
    const ts = value > 1e12 ? value : value * 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
    // Try common text format: 2026-03-30 10:00:00
    const match = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
    if (match) {
      const d2 = new Date(`${match[1]}T${match[2]}`);
      if (!isNaN(d2.getTime())) return d2;
    }
  }
  return null;
}

// --- JSON line parser ---

const JSON_LEVEL_FIELDS = ['level', 'severity', 'loglevel', 'log_level'];
const JSON_MSG_FIELDS = ['message', 'msg', 'text', 'body'];
const JSON_TS_FIELDS = ['timestamp', 'time', 'ts', 'date', '@timestamp', 'datetime'];

function findField<T>(obj: Record<string, unknown>, candidates: string[]): T | undefined {
  for (const key of candidates) {
    if (key in obj) return obj[key] as T;
  }
  // Case-insensitive fallback
  const lowerMap = new Map(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const key of candidates) {
    const actual = lowerMap.get(key.toLowerCase());
    if (actual) return obj[actual] as T;
  }
  return undefined;
}

function parseJsonLine(line: string): LogEntry | null {
  try {
    const obj = JSON.parse(line);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;

    const levelRaw = findField<string>(obj, JSON_LEVEL_FIELDS) ?? '';
    const message = findField<string>(obj, JSON_MSG_FIELDS) ?? '';
    const tsRaw = findField<unknown>(obj, JSON_TS_FIELDS);

    // Build extra: everything that's not level/msg/ts
    const knownKeys = new Set([...JSON_LEVEL_FIELDS, ...JSON_MSG_FIELDS, ...JSON_TS_FIELDS]);
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!knownKeys.has(k.toLowerCase())) extra[k] = v;
    }

    return {
      timestamp: parseTimestamp(tsRaw),
      level: normalizeLevel(String(levelRaw)),
      message: String(message),
      raw: line,
      extra,
    };
  } catch {
    return null;
  }
}

// --- Text line parser ---

const TEXT_LEVEL_PATTERNS = [
  /\[(\w+)]/,                    // [ERROR], [WARN], [INFO]
  /\b(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL|CRITICAL)\b:?/i,
];

const TEXT_TS_PATTERN = /^(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/;

function parseTextLine(line: string): LogEntry {
  let timestamp: Date | null = null;
  let level: LogLevel = 'unknown';
  let message = line;

  // Extract timestamp
  const tsMatch = line.match(TEXT_TS_PATTERN);
  if (tsMatch) {
    timestamp = parseTimestamp(tsMatch[1]);
    message = line.slice(tsMatch[0].length).trim();
  }

  // Extract level
  for (const pat of TEXT_LEVEL_PATTERNS) {
    const m = message.match(pat);
    if (m) {
      level = normalizeLevel(m[1]);
      // Remove level token from message
      message = message.replace(pat, '').trim();
      break;
    }
  }

  return { timestamp, level, message, raw: line, extra: {} };
}

// --- Format detection ---

export function detectFormat(lines: string[]): LogFormat {
  let jsonCount = 0;
  const sample = lines.slice(0, 10);
  for (const line of sample) {
    if (line.trim().startsWith('{')) {
      try { JSON.parse(line); jsonCount++; } catch { /* not json */ }
    }
  }
  if (jsonCount > sample.length / 2) return 'json';
  if (sample.length > 0) return 'text';
  return 'unknown';
}

// --- Parse single line (auto-detect per line, with hint) ---

export function parseLine(line: string, formatHint: LogFormat): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (formatHint === 'json' || (formatHint === 'unknown' && trimmed.startsWith('{'))) {
    const entry = parseJsonLine(trimmed);
    if (entry) return entry;
  }
  return parseTextLine(trimmed);
}

// --- Stream parser: read file or stdin line by line ---

export async function parseStream(
  input: NodeJS.ReadableStream,
  callback: (entry: LogEntry) => void
): Promise<LogFormat> {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const buffer: string[] = [];
  let format: LogFormat = 'unknown';
  let detected = false;

  for await (const line of rl) {
    if (!detected) {
      buffer.push(line);
      if (buffer.length >= 5 || /* small file hint */ false) {
        format = detectFormat(buffer);
        detected = true;
        for (const buffered of buffer) {
          const entry = parseLine(buffered, format);
          if (entry) callback(entry);
        }
        buffer.length = 0;
      }
      continue;
    }
    const entry = parseLine(line, format);
    if (entry) callback(entry);
  }

  // Flush remaining buffer (file < 5 lines)
  if (buffer.length > 0) {
    format = detectFormat(buffer);
    for (const buffered of buffer) {
      const entry = parseLine(buffered, format);
      if (entry) callback(entry);
    }
  }

  return format;
}

// --- Load entire file into entries array ---

export async function parseFile(filePath: string): Promise<{ entries: LogEntry[]; format: LogFormat }> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const entries: LogEntry[] = [];
  const format = await parseStream(stream, entry => entries.push(entry));
  return { entries, format };
}
