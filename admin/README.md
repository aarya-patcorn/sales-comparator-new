# Sales Comparator Admin

The admin SPA is built with Vite, React, strict TypeScript, Tailwind CSS, shadcn/ui, React Router, and TanStack Query.

## Setup

From this directory, install dependencies and create a local environment file:

```sh
npm install
copy .env.example .env
```

Set these values in `.env`:

- `VITE_API_URL` — the backend base URL, for example `http://localhost:3000`.
- `VITE_GOOGLE_CLIENT_ID` — the public Google OAuth client ID used by Google Identity Services.

The Google client secret never belongs in this project. Google proves identity, and the backend decides whether the account is an allowed admin.

## Run and build

```sh
npm run dev
```

Create a production build with:

```sh
npm run build
```

## Adding shadcn components

Use the configured shadcn MCP server to find or add components. Ask the MCP for the registry add command, run that command from `admin`, and keep generated UI files under `src/components/ui`. Do not hand-copy registry component code; use the MCP/CLI output so dependencies and theme conventions stay aligned.
