import { defineEventHandler, useRuntimeConfig } from 'nuxt/server';

// The API reference, rendered by Scalar from /api/openapi.json. The script is served by this
// site (modules/scalar.ts), and the options below keep the page from calling Scalar's services.
const config = {
  url: '/api/openapi.json',
  theme: 'none',
  darkMode: true,
  withDefaultFonts: false,
  telemetry: false,
  showDeveloperTools: 'never',
  agent: { disabled: true },
  mcp: { disabled: true },
  documentDownloadType: 'json',
  // The "Soft night" palette (docs/design.md), on Scalar's own variables.
  customCss: `
    :root { --scalar-font: 'Figtree', ui-sans-serif, system-ui, sans-serif; --scalar-radius: 0.375rem; }
    .dark-mode {
      --scalar-background-1: #0b0e27; --scalar-background-2: #13173a; --scalar-background-3: #1c2150;
      --scalar-border-color: #282f66;
      --scalar-color-1: #e9ebf8; --scalar-color-2: #a0a6d0; --scalar-color-3: #565c8c;
      --scalar-color-accent: #f25c70; --scalar-background-accent: #f25c701f;
    }
    .light-mode {
      --scalar-background-1: #eff1fb; --scalar-background-2: #ffffff; --scalar-background-3: #d6daf0;
      --scalar-border-color: #d6daf0;
      --scalar-color-1: #0b0e27; --scalar-color-2: #565c8c; --scalar-color-3: #a0a6d0;
      --scalar-color-accent: #a51f33; --scalar-background-accent: #a51f331f;
    }
  `,
};

export default defineEventHandler((event) => {
  event.res.headers.set('Content-Type', 'text/html; charset=utf-8');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>La Nuit Blanche API</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${useRuntimeConfig().scalarScript}"></script>
    <script>Scalar.createApiReference('#app', ${JSON.stringify(config)});</script>
  </body>
</html>`;
});
