import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCyclesForBill } from '$lib/server/db/bill-queries';
import { createRequestLogger } from '$lib/server/api-logger';

// GET /api/bills/[id]/cycles
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'bill_cycles.list');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		if (Number.isNaN(id)) {
			logger.warn('validation_failed', { reason: 'invalid_bill_id', billId: params.id });
			return json({ error: 'Invalid bill ID' }, { status: 400 });
		}

		const cycles = await getCyclesForBill(id);
		logger.info('success', { billId: id, count: cycles.length });
		return json(cycles);
	} catch (error) {
		logger.error('error', { billId: event.params.id, error });
		return json({ error: 'Failed to fetch bill cycles' }, { status: 500 });
	}
};
