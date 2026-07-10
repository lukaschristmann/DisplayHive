# Dev environment

## One-time setup

```bash
direnv allow
```

This loads `flake.nix`'s dev shell automatically whenever you `cd` into the repo
(needs `direnv` hooked into your shell — see `~/.bashrc`/`~/.zshrc`:
`eval "$(direnv hook bash)"`). Without direnv, enter the shell manually with
`nix develop` (or the older `nix-shell`, which still works — `flake.nix` just
wraps `shell.nix`).

Entering the shell prints the available commands and runs first-time setup
(installs JS deps, runs `alembic upgrade head`).

## Running everything

```bash
npm run dev
```

Runs the backend, admin frontend, and screen frontend together
(`dev:backend`, `dev:admin`, `dev:screen` under the hood — see below to run
them individually).

## Running individually

```bash
npm run dev:backend   # python app.py — Flask + Socket.IO on :5000
npm run dev:admin     # admin Vite dev server on :5173
npm run dev:screen    # screen frontend Vite dev server on :5174
```

## Tests

```bash
npm run test:e2e         # Playwright, headless
npm run test:e2e:headed  # Playwright, headed browser windows
npm run test:e2e:ui      # Playwright's interactive UI mode
```

## Notes

- No HTTPS/mkcert setup needed — the dev backend is plain HTTP.
- `frontends/admin` and `frontends/screen` each have their own dev port
  pinned in `vite.config.ts` (5173 / 5174) so they can't collide.
