# Scopeboard Gantt

A clean, single-page project tracker with editable task and Gantt views. The repository contains only neutral demo data and runs entirely in browser state—no backend, database, or external services are required.

## Features

- spreadsheet-style task table with inline editing
- weekly Gantt timeline with status and progress bars
- configurable visible columns and custom fields
- automatic end-date calculation from start date and duration
- task detail panel with scope-change history
- developer and status filters
- project deadline and available-capacity controls
- Excel and PDF timeline export
- responsive layout

## Task model

Each task includes a ticket ID, name, developer, creation date, original estimate, current scope, calculated scope delta, start and end dates, completion percentage, status, notes, and optional custom fields.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed in the terminal.

## Validate a production build

```bash
npm run build
npm test
```

## Data and persistence

Demo tasks are defined in `app/page.tsx`. All changes made in the UI are held in memory and reset when the page reloads. Replace the demo task array or connect your own persistence layer if you need saved data.

## License

MIT
