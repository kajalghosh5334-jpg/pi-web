# Local backend link

The frontend currently uses **local builds** of the backend packages instead of the registry versions:

- `@earendil-works/pi-coding-agent` → `../pi-backend/packages/coding-agent`
- `@earendil-works/pi-ai` → `../pi-backend/packages/ai`

This was set up so the new `final_output_started` event (and related backend changes) can be tested without publishing a new package version.

## How it was set up

```bash
cd pi-frontend
node scripts/link-local-backend.mjs
```

## How to undo

```bash
cd pi-frontend
rm -rf node_modules/@earendil-works/pi-coding-agent node_modules/@earendil-works/pi-ai
npm install
```

## Before releasing

1. Publish new versions of `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` from `pi-backend`.
2. Update their versions in `pi-frontend/package.json`.
3. Remove this file and `scripts/link-local-backend.mjs`.
4. Run `npm install` so the frontend consumes the packages from the registry again.
