// Builds the offline demo (in-page server + NPCs) and writes dist-demo/artifact.html:
// the page body for publishing as a Claude artifact (the host adds <!doctype>/<head>).
//   node scripts/build-artifact.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';

execSync('npx vite build --mode demo', { stdio: 'inherit' });
const html = fs.readFileSync('dist-demo/index.html', 'utf8');
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
const page = `<title>Christmas World Seoul</title>
<meta name="theme-color" content="#0d1024">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Great+Vibes&display=swap">
<link rel="stylesheet" href="${css}">
<style>:root { color-scheme: dark; } html, body { background: #0b0d20; }</style>
<div id="game"></div>
<div id="labels"></div>
<div id="app"></div>
<script type="module" src="${js}"></script>
`;
fs.writeFileSync('dist-demo/artifact.html', page);
console.log('wrote dist-demo/artifact.html', { js, css });
