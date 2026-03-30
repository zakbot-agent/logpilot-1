import * as fs from 'fs';
import * as readline from 'readline';
import { LogEntry, LogFormat, detectFormat, parseLine } from './parser';
import { FilterOptions } from './filter';
import { OutputFormat, formatSingleEntry } from './formatter';

export interface FollowOptions {
  filePath: string;
  format: OutputFormat;
  filters: FilterOptions;
}

export function followFile(options: FollowOptions): void {
  const { filePath, format, filters } = options;

  // Read initial lines to detect format
  const initialContent = fs.readFileSync(filePath, 'utf-8');
  const initialLines = initialContent.split('\n').filter(l => l.trim());
  const logFormat: LogFormat = detectFormat(initialLines);

  // Start watching from end of file
  let fileSize = fs.statSync(filePath).size;
  let buffer = '';

  console.log(`\x1b[2m--- Following ${filePath} (Ctrl+C to stop) ---\x1b[0m\n`);

  const watcher = fs.watch(filePath, (eventType) => {
    if (eventType !== 'change') return;

    const newSize = fs.statSync(filePath).size;
    if (newSize <= fileSize) {
      fileSize = newSize;
      return;
    }

    const stream = fs.createReadStream(filePath, {
      encoding: 'utf-8',
      start: fileSize,
      end: newSize - 1,
    });

    let chunk = '';
    stream.on('data', (data: string) => { chunk += data; });
    stream.on('end', () => {
      fileSize = newSize;
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        const entry = parseLine(line, logFormat);
        if (!entry) continue;
        if (!matchesFilters(entry, filters)) continue;
        process.stdout.write(formatSingleEntry(entry, format) + '\n');
      }
    });
  });

  process.on('SIGINT', () => {
    watcher.close();
    console.log('\n\x1b[2m--- Stopped following ---\x1b[0m');
    process.exit(0);
  });
}

function matchesFilters(entry: LogEntry, filters: FilterOptions): boolean {
  if (filters.levels && filters.levels.length > 0) {
    if (!filters.levels.includes(entry.level)) return false;
  }
  if (filters.since) {
    if (!entry.timestamp || entry.timestamp.getTime() < filters.since.getTime()) return false;
  }
  if (filters.grep) {
    const pattern = filters.grep.toLowerCase();
    if (!entry.message.toLowerCase().includes(pattern) && !entry.raw.toLowerCase().includes(pattern)) return false;
  }
  return true;
}
