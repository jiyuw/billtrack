import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('activity page defaults to compact filtered activity browsing', () => {
	const pageServer = readFileSync(new URL('./+page.server.ts', import.meta.url), 'utf8');
	const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

	assert.match(pageServer, /const DEFAULT_ACTIVITY_LIMIT = 50/);
	assert.match(pageServer, /getRecentActivityLogs\(limit\)/);
	assert.match(page, /let activeFilter = \$state/);
	assert.match(page, /const filteredLogs = \$derived\.by/);
	assert.match(page, /expandedLogId/);
	assert.match(page, /View details/);
	assert.match(page, /Load more/);
});
