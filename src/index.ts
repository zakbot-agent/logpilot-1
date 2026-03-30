#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { parseFile, parseStream, LogEntry } from './parser';
import { applyFilters, parseLevels, parseSince, FilterOptions } from './filter';
import { formatEntries, OutputFormat } from './formatter';
import { computeStats, formatStats } from './stats';
import { followFile } from './follower';

// --- Argument parser ---

interface CliArgs {
  file?: string;
  levels?: string;
  since?: string;
  grep?: string;
  format?: string;
  stats: boolean;
  tail?: number;
  head?: number;
  follow: boolean;
  export?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { stats: false, follow: false, help: false };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case '--level':
        args.levels = argv[++i];
        break;
      case '--since':
        args.since = argv[++i];
        break;
      case '--grep':
        args.grep = argv[++i];
        break;
      case '--format':
        args.format = argv[++i];
        break;
      case '--stats':
        args.stats = true;
        break;
      case '--tail':
        args.tail = parseInt(argv[++i], 10);
        break;
      case '--head':
        args.head = parseInt(argv[++i], 10);
        break;
      case '--follow':
      case '-f':
        args.follow = true;
        break;
      case '--export':
        args.export = argv[++i];
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !args.file) {
          args.file = arg;
        }
        break;
    }
    i++;
  }

  return args;
}

// --- Help text ---

function printHelp(): void {
  const help = `
\x1b[1m\x1b[36mLogPilot\x1b[0m — Smart log file parser and analyzer

\x1b[1mUsage:\x1b[0m
  logpilot <file> [options]
  cat file.log | logpilot [options]

\x1b[1mOptions:\x1b[0m
  --level <level>       Filter by level (error, warn, info, debug)
                        Multiple: --level error,warn
  --since <duration>    Time filter: 5m, 1h, 2d, 1w, or a date
  --grep <text>         Case-insensitive text search
  --format <fmt>        Output: colored (default), table, json, compact
  --stats               Show log statistics
  --tail <n>            Last n entries
  --head <n>            First n entries
  --follow, -f          Follow file in real-time
  --export <file>       Export filtered results to JSON file
  --help, -h            Show this help

\x1b[1mExamples:\x1b[0m
  logpilot app.log
  logpilot app.log --level error --since 1h
  logpilot app.log --grep "timeout" --format table
  logpilot app.log --stats
  cat app.log | logpilot --level error
`;
  console.log(help);
}

// --- Main ---

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Build filter options
  const filterOpts: FilterOptions = {};
  if (args.levels) filterOpts.levels = parseLevels(args.levels);
  if (args.since) filterOpts.since = parseSince(args.since);
  if (args.grep) filterOpts.grep = args.grep;
  if (args.tail !== undefined) filterOpts.tail = args.tail;
  if (args.head !== undefined) filterOpts.head = args.head;

  const outputFormat: OutputFormat = (args.format as OutputFormat) || 'colored';

  // Follow mode
  if (args.follow) {
    if (!args.file) {
      console.error('\x1b[31mError: --follow requires a file path.\x1b[0m');
      process.exit(1);
    }
    followFile({ filePath: args.file, format: outputFormat, filters: filterOpts });
    return;
  }

  // Determine input source: file or stdin
  let entries: LogEntry[];

  if (args.file) {
    if (!fs.existsSync(args.file)) {
      console.error(`\x1b[31mError: File not found: ${args.file}\x1b[0m`);
      process.exit(1);
    }
    const result = await parseFile(args.file);
    entries = result.entries;
  } else if (!process.stdin.isTTY) {
    // Reading from pipe
    entries = [];
    await parseStream(process.stdin, entry => entries.push(entry));
  } else {
    printHelp();
    process.exit(0);
    return;
  }

  // Apply filters
  const filtered = applyFilters(entries, filterOpts);

  // Stats mode
  if (args.stats) {
    const stats = computeStats(filtered);
    console.log(formatStats(stats));
    return;
  }

  // Export mode
  if (args.export) {
    const jsonData = filtered.map(e => ({
      timestamp: e.timestamp?.toISOString() ?? null,
      level: e.level,
      message: e.message,
      ...e.extra,
    }));
    fs.writeFileSync(args.export, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`\x1b[32mExported ${filtered.length} entries to ${args.export}\x1b[0m`);
    return;
  }

  // Output
  if (filtered.length === 0) {
    console.log('\x1b[2mNo log entries match the given filters.\x1b[0m');
    return;
  }

  console.log(formatEntries(filtered, outputFormat));
}

main().catch(err => {
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
});
