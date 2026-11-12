export default function manifest() {
  return {
    name: 'Fatto',
    short_name: 'Fatto',
    description: 'Bacheca personale dei task',
    start_url: '/',
    display: 'standalone',
    background_color: '#EEF2F1',
    theme_color: '#0B6E69',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
