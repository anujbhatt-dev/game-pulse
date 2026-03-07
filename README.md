# GamePulse

Server-side game health monitoring dashboard built with Next.js App Router.

## Tech Stack

- Next.js 16.1.6
- React 19
- TypeScript (strict)
- Tailwind CSS v4
- Framer Motion
- Playwright (Chromium checks)

## Run Locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/dashboard`.

## Monitoring Flow

1. URLs are loaded from `data/games.csv` (`url` column).
2. `POST /api/monitor` runs Playwright checks in Node.js runtime.
3. Failed URLs are written to `reports/failed-games-YYYY-MM-DD.csv`.
4. Dashboard lists reports and allows viewing/downloading each report.

## API Endpoints

- `POST /api/monitor`
- `GET /api/reports`
- `GET /api/reports/[date]`

## CSV Files

- Source URLs: `data/games.csv`
- Generated reports: `reports/failed-games-YYYY-MM-DD.csv`

## Cron Support

Example daily run at 3:00 AM:

```bash
0 3 * * * curl -X POST http://localhost:3000/api/monitor
```

## Notes

- Monitoring is server-side only.
- API routes explicitly run on Node.js runtime.
- A file lock (`data/monitor.lock`) prevents overlapping monitor runs.
