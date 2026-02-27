// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://got3nks.github.io',
	base: '/amutorrent',
	integrations: [
		starlight({
			title: 'aMuTorrent',
			description: 'Unified web interface for aMule, rTorrent, qBittorrent, Deluge, and Transmission with real-time updates',
			logo: {
				src: './src/assets/logo.png',
				replacesTitle: false,
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/got3nks/amutorrent' },
				{ icon: 'seti:docker', label: 'Docker Hub', href: 'https://hub.docker.com/r/got3nks/amutorrent' },
			],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Installation', slug: 'docs/installation' },
						{ label: 'Configuration', slug: 'docs/configuration' },
					],
				},
				{
					label: 'Download Clients',
					items: [
						{ label: 'aMule Setup', slug: 'docs/amule' },
						{ label: 'rTorrent Setup', slug: 'docs/rtorrent' },
						{ label: 'qBittorrent Setup', slug: 'docs/qbittorrent' },
						{ label: 'Deluge Setup', slug: 'docs/deluge' },
						{ label: 'Transmission Setup', slug: 'docs/transmission' },
					],
				},
				{
					label: 'Integrations',
					items: [
						{ label: '*arr Apps', slug: 'docs/integrations' },
						{ label: 'Prowlarr Search', slug: 'docs/prowlarr' },
						{ label: 'Notifications', slug: 'docs/notifications' },
						{ label: 'GeoIP Mapping', slug: 'docs/geoip' },
					],
				},
				{
					label: 'Advanced',
					items: [
						{ label: 'User Management', slug: 'docs/users' },
						{ label: 'Scripting', slug: 'docs/scripting' },
						{ label: 'API Reference', slug: 'docs/api' },
						{ label: 'Development', slug: 'docs/development' },
					],
				},
			],
		}),
	],
});
