import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRentalAssetDetail } from '$lib/server/db/rental-queries';
import { createRequestLogger } from '$lib/server/api-logger';

export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'rentals.asset.get');
	try {
		const id = Number.parseInt(event.params.id, 10);
		if (Number.isNaN(id)) {
			logger.warn('validation_failed', { reason: 'invalid_asset_id', assetId: event.params.id });
			return json({ error: 'Invalid rental asset id' }, { status: 400 });
		}

		const asset = getRentalAssetDetail(id);
		if (!asset) {
			logger.warn('not_found', { assetId: id });
			return json({ error: 'Rental asset not found' }, { status: 404 });
		}

		logger.info('success', { assetId: id, billCount: asset.bills.length });
		return json(asset);
	} catch (error) {
		logger.error('error', { assetId: event.params.id, error });
		return json({ error: 'Failed to fetch rental asset' }, { status: 500 });
	}
};
