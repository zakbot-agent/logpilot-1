# logpilot

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)

> Smart log file parser and analyzer. Filter, colorize, and analyze logs.

## Features

- CLI tool
- TypeScript support

## Tech Stack

**Runtime:**
- TypeScript v5.9.3

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## Installation

```bash
cd logpilot
npm install
```

Or install globally:

```bash
npm install -g logpilot
```

## Usage

### CLI

```bash
logpilot
```

### Available Scripts

| Script | Command |
|--------|---------|
| `npm run build` | `tsc` |
| `npm run start` | `node dist/index.js` |

## Project Structure

```
├── src
│   ├── filter.ts
│   ├── follower.ts
│   ├── formatter.ts
│   ├── index.ts
│   ├── parser.ts
│   └── stats.ts
├── package.json
├── README.md
└── tsconfig.json
```

## License

This project is licensed under the **MIT** license.

## Author

**Zakaria Kone**
