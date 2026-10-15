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
      --scalar-background-1: #0e1122; --scalar-background-2: #161a30; --scalar-background-3: #1f2441;
      --scalar-border-color: #2a3052;
      --scalar-color-1: #ecedf5; --scalar-color-2: #9ca1be; --scalar-color-3: #5f6485;
      --scalar-color-accent: #f25c70; --scalar-background-accent: #f25c701f;
    }
    .light-mode {
      --scalar-background-1: #f4f5fa; --scalar-background-2: #ffffff; --scalar-background-3: #daddeb;
      --scalar-border-color: #daddeb;
      --scalar-color-1: #0e1122; --scalar-color-2: #5f6485; --scalar-color-3: #9ca1be;
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
