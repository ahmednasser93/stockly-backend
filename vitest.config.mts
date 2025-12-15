import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'test/',
				'**/*.spec.ts',
				'**/*.test.ts',
				'scripts/',
			],
		},
		reporters: ['default', 'json', 'junit'],
		outputFile: {
			json: './test-results/results.json',
			junit: './test-results/junit.xml',
		},
	},
});
