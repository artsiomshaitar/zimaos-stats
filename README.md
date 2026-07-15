# zimaos-stats

Historical resource monitoring for ZimaOS (or any Docker host). ZimaOS's built-in System
widget only shows the current moment — this app records CPU, RAM, temperature, power, and
per-app (container) CPU/RAM over time and shows them on a dashboard.

- **Lightweight**: one container, one process. Metrics are read straight from the host's
  `/proc` and `/sys` (a few file reads per sample) plus one cheap one-shot Docker API call
  per running container. Storage is a single SQLite file.
- **Self-pruning**: samples older than `HISTORY_DAYS` are deleted automatically.
- **No ZimaOS credentials needed**: it never talks to the ZimaOS API.

## Install on ZimaOS (App Store → Install a customized app)

**Fast way — import:** click the import icon in the top-right of the customized-app
dialog and paste the contents of [`zimaos-app.yml`](zimaos-app.yml). It prefills the
image, title, icon, port, all three volumes, and the env vars with their defaults —
review and hit Install.

**Manual way:** fill in the settings dialog like this:

| Field | Value |
| --- | --- |
| Docker image | `ghcr.io/artsiomshaitar/zimaos-stats` |
| Tag | `latest` |
| Title | ZimaOS Stats |
| Web UI | `http://<your-device>:3080/` |
| Network | bridge |
| Ports | host `3080` → container `3000` (TCP) |
| Volumes | host `/DATA/AppData/zimaos-stats` → container `/data` |
| Volumes | host `/var/run/docker.sock` → container `/var/run/docker.sock` |
| Volumes | host `/sys/devices/virtual/powercap` → container `/powercap` |
| Environment variables | optional, see below |
| Privileges / Memory limit / CPU shares | off / default / Low |

The Docker socket volume is what enables the per-app section. Without it the app still
records system metrics. Temperature comes from the host's `/sys` (visible inside
containers by default). Power needs the `/powercap` volume: Docker masks
`/sys/devices/virtual/powercap` inside containers as a side-channel mitigation, so the
host's RAPL counters (Intel CPUs — ZimaBoard/ZimaCube) must be bind-mounted in
explicitly.

## Updating

With the `latest` tag, ZimaOS's **Check then update** compares the local image digest
against the registry ([`NeedCheckDigestTags`](https://github.com/IceWhaleTech/CasaOS-AppManagement/blob/main/common/constants.go)
covers exactly `latest`), so it notices new pushes on its own — if it claims you're
up to date right after a release, the registry check hiccupped or the multi-arch push
hadn't finished; try again in a minute.

Versioned tags (`0.1.0`, `0.2.0`, …) are also published on git tags
(`git tag v0.2.0 && git push --tags`) if you'd rather pin an exact version and update
by editing the Tag field in the app's settings.

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `HISTORY_DAYS` | `7` | How many days of history to keep (1–365). |
| `POLL_INTERVAL_SECONDS` | `2` | Seconds between system samples (1–3600). These are a few `/proc`/`/sys` file reads — sub-millisecond — so a tight cadence is cheap. |
| `CONTAINER_POLL_INTERVAL_SECONDS` | `15` | Seconds between per-app samples (2–3600). Docker stats are an HTTP call per container, so they run on a slower cadence. |
| `PORT` | `3000` | HTTP port inside the container. |
| `DB_PATH` | `/data/zimaos-stats.db` | SQLite file location (point a volume at `/data`). |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path for per-app stats. |
| `DEVICE_NAME` | *(hostname)* | Display name in the heading and browser tab. Defaults to the hostname you open the app with (`t800.local` → `T800`). |
| `COLLECTOR_MODE` | `auto` | `auto` / `host` / `demo`. `auto` falls back to demo data when host metrics aren't readable (e.g. developing on macOS). |

Storage footprint: system samples at 2s for 7 days are ~300k rows, plus ~40k rows per
app at 15s — a few tens of MB. SQLite (WAL mode) handles this without noticing.

## Publishing your own image (ghcr.io)

1. Push this repo to GitHub.
2. The included workflow (`.github/workflows/publish.yml`) builds and pushes
   `ghcr.io/<you>/zimaos-stats:latest` (amd64 + arm64) on every push to `main`.
3. Make the package public: GitHub → your profile → Packages → zimaos-stats →
   Package settings → Change visibility → Public. ZimaOS pulls anonymously, so this
   step is required.

Or build and push by hand:

```sh
docker build -t ghcr.io/<you>/zimaos-stats:latest .
docker push ghcr.io/<you>/zimaos-stats:latest
```

## Run with docker compose

Edit the image name in `docker-compose.yml`, then:

```sh
docker compose up -d
```

## Development

```sh
bun install
bun run dev        # http://localhost:3000 — uses demo data on macOS
bun run build      # production build
bun run start      # serve the production build (node serve.mjs)
```

Requires Node 24 (built-in `node:sqlite`) and Bun.

## How it works

- `src/server/collector.ts` runs inside the web server process from boot (started by the
  custom TanStack Start entry `src/server.ts`), sampling every `POLL_INTERVAL_SECONDS`:
  - CPU: `/proc/stat` deltas · RAM: `/proc/meminfo`
  - Temperature: best thermal zone in `/sys/class/thermal` (falls back to hwmon)
  - Power: Intel RAPL energy counters in `/sys/class/powercap`
  - Per-app: Docker API one-shot stats over the socket, CPU% computed from deltas
- Samples land in SQLite (WAL). An hourly job prunes rows older than `HISTORY_DAYS`.
- The dashboard (TanStack Start + shadcn + Recharts) queries bucketed averages via
  server functions and refreshes every 30s.
