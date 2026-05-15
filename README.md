# SoulLink Tracker + ScreenShare

Web app for SoulLink runs with integrated screen sharing, team/box management, route tracking, battle analysis, run history, rules/trainer-caps editing, and admin tools.

Try it out: [SoullinkTracker](https://soullink.servegame.com)



## What the app can do

### Login / Run Management
- Create and join runs.
- Optional run password when creating a run.
- Join as `Player 1`, `Player 2`, `Player 3`, or `Spectator`.
- View active runs with online status.

### Stream Tab
- Screen sharing per active player.
- Live view of all player streams.
- Team bar with Pokemon status below each stream.
- Death counter per player.
- Gym/badge status including level caps.
- Run timer with start/pause/reset.
- Stream pop-out window.

### SoulLink Tab
- Edit team slots per player.
- Create/remove links between Pokemon.
- Shiny swap and link-related actions.
- Move between team/box/route with link consistency.

### Box Tab
- Manage multiple boxes per player.
- Move Pokemon between team and box.
- Edit status flags (e.g. dead / not caught).
- Graveyard view for dead/broken links.

### Routes Tab
- Select game edition and load routes.
- Track route catches per player.
- Automatic link logic when catches are complete.
- Mark routes as missed.
- Search for routes and Pokemon.

### Map Tab
- Maps for the selected edition.
- Thumbnail navigation, zoom, pan, reset.
- Additional interactive FRLG map mode.

### Battle Tab
- Type analysis for team or all Pokemon.
- Type table attacker -> defender.
- Battle view pop-out window.

### Run History Tab
- Timeline of all run events.
- Export as `PNG`, `TXT`, `JSON`.

### Rules Tab
- Shared two-column editor: `Rules` and `Trainer Caps`.
- Save, load, and delete rulesets (stored in DB).
- Import/export `.md` and `.txt` with correct column mapping.

### Admin Area
- Access via the gear icon on the login screen.
- List runs.
- Set/remove run passwords.
- Delete runs completely.

## Local Setup

### Requirements
- Node.js 18+ (20+ recommended)
- npm
- OpenSSL (only needed if `cert.pem` and `key.pem` are missing and should be auto-generated)

### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment
```bash
cp .env.example .env
```

Then adjust values in `.env`.

### 3) Certificates (`cert.pem` / `key.pem`)
On startup, the server tries to enable HTTPS:
- If `cert.pem` and `key.pem` exist in the project root, they are used.
- If missing, the server tries to generate them using OpenSSL.
- If OpenSSL is unavailable, the app runs HTTP-only.

Files in project root:
- `cert.pem`
- `key.pem`

Generate manually (if needed):
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

### 4) Start server
```bash
npm start
```

Default URLs:
- HTTP: `http://localhost:3000`
- HTTPS: `https://localhost:3443`

For browser screen capture, use HTTPS (except `localhost`, depending on browser rules).

## Map Data (Important)

The app serves maps from:
- `../maps` relative to `server.js`

If maps are missing, ensure a `maps` directory exists at that level.

## `.env` variables

Used variables:
- `ADMIN_PASSWORD` admin panel password (default: `admin`)

## Useful commands

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

## Persistence / Data

- SQLite file: `soullink.db`
- Stores runs, run state, and saved rulesets.
