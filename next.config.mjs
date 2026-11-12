import { readFileSync } from 'node:fs';

// La versione mostrata nel piè di pagina viene da package.json ("0.2.0" → "0.2").
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { APP_VERSION: version.replace(/\.0$/, '') },
};
export default nextConfig;
