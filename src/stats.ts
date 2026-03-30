import { LogEntry, LogLevel } from './parser';

export interface LogStats {
  total: number;
  perLevel: Record<string, number>;
  perHour: Record<string, number>;
  errorRate: string;
  topErrors: { message: string; count: number }[];
}

export function computeStats(entries: LogEntry[]): LogStats {
  const perLevel: Record<string, number> = {};
  const perHour: Record<string, number> = {};
  const errorMessages = new Map<string, number>();

  for (const entry of entries) {
    // Per level
    perLevel[entry.level] = (perLevel[entry.level] ?? 0) + 1;

    // Per hour
    if (entry.timestamp) {
      const hour = entry.timestamp.toISOString().slice(0, 13) + ':00';
      perHour[hour] = (perHour[hour] ?? 0) + 1;
    }

    // Error messages
    if (entry.level === 'error') {
      const msg = entry.message.slice(0, 120);
      errorMessages.set(msg, (errorMessages.get(msg) ?? 0) + 1);
    }
  }

  const errorCount = perLevel['error'] ?? 0;
  const errorRate = entries.length > 0
    ? ((errorCount / entries.length) * 100).toFixed(1) + '%'
    : '0%';

  const topErrors = [...errorMessages.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));

  return { total: entries.length, perLevel, perHour, errorRate, topErrors };
}

export function formatStats(stats: LogStats): string {
  const lines: string[] = [];
  const BOLD = '\x1b[1m';
  const RESET = '\x1b[0m';
  const CYAN = '\x1b[36m';
  const RED = '\x1b[31m';
  const YELLOW = '\x1b[33m';
  const DIM = '\x1b[2m';

  lines.push(`${BOLD}${CYAN}=== Log Statistics ===${RESET}`);
  lines.push(`${BOLD}Total entries:${RESET} ${stats.total}`);
  lines.push('');

  // Per level
  lines.push(`${BOLD}Entries per level:${RESET}`);
  const levelColors: Record<string, string> = {
    error: RED, warn: YELLOW, info: CYAN, debug: DIM,
  };
  for (const [level, count] of Object.entries(stats.perLevel).sort((a, b) => b[1] - a[1])) {
    const color = levelColors[level] ?? '';
    const bar = '█'.repeat(Math.min(count, 40));
    lines.push(`  ${color}${level.padEnd(8)}${RESET} ${String(count).padStart(5)}  ${color}${bar}${RESET}`);
  }
  lines.push('');

  // Error rate
  lines.push(`${BOLD}Error rate:${RESET} ${RED}${stats.errorRate}${RESET}`);
  lines.push('');

  // Per hour
  if (Object.keys(stats.perHour).length > 0) {
    lines.push(`${BOLD}Entries per hour:${RESET}`);
    for (const [hour, count] of Object.entries(stats.perHour).sort()) {
      const bar = '▓'.repeat(Math.min(count, 40));
      lines.push(`  ${DIM}${hour}${RESET}  ${String(count).padStart(4)}  ${CYAN}${bar}${RESET}`);
    }
    lines.push('');
  }

  // Top errors
  if (stats.topErrors.length > 0) {
    lines.push(`${BOLD}Most common errors:${RESET}`);
    for (const { message, count } of stats.topErrors) {
      lines.push(`  ${RED}${count}x${RESET} ${message}`);
    }
  }

  return lines.join('\n');
}
