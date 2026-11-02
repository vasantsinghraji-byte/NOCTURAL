import type { MetadataRoute } from 'next';

/** Home-screen install: name, colours and the Nabz icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nabz · Care that comes home',
    short_name: 'Nabz',
    description: 'Verified nurses, physiotherapists and medicines at home in Jaipur.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf8f3',
    theme_color: '#b83a50',
    icons: [
      { src: '/brand/nabz-icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
      { src: '/brand/nabz-icon-512.png?v=2', sizes: '512x512', type: 'image/png' },
      { src: '/brand/nabz-icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
