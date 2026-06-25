import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRentalAssets } from '$lib/server/db/rental-queries';
import { createRequestLogger } from '$lib/server/api-logger';

export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'rentals.assets.list');
	try {
		const assets = getRentalAssets();
		logger.info('success', { count: assets.length });
		return json(assets);
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to fetch rental assets' }, { status: 500 });
	}
};
