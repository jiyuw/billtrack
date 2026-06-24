import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updatePayment, deletePayment } from '$lib/server/db/bill-queries';
import { normalizeDateForStorage } from '$lib/utils/dates';
import { createRequestLogger } from '$lib/server/api-logger';

export const PUT: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'payment.update');
	try {
		const { params, request } = event;
		const id = parseInt(params.id);
		const data = await request.json();
		logger.info('request', { paymentId: id, body: data });

		const updateData: any = {};
		if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
		if (data.paymentDate) {
			updateData.paymentDate = normalizeDateForStorage(data.paymentDate, {
				kind: 'date',
				boundary: 'start'
			});
		}
		if (data.cycleId !== undefined && data.cycleId !== null) {
			updateData.cycleId = parseInt(data.cycleId);
		}
		if (data.notes !== undefined) updateData.notes = data.notes;

		const payment = await updatePayment(id, updateData);

		if (!payment) {
			logger.warn('not_found', { paymentId: id, updateData });
			return json({ error: 'Payment not found' }, { status: 404 });
		}

		logger.audit('success', { paymentId: id, after: payment });
		return json(payment);
	} catch (error) {
		logger.error('error', { paymentId: event.params.id, error });
		return json({ error: 'Failed to update payment' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'payment.patch');
	try {
		const { params, request } = event;
		const id = parseInt(params.id);
		const data = await request.json();
		logger.info('request', { paymentId: id, body: data });

		const updateData: any = {};
		if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
		if (data.paymentDate) {
			updateData.paymentDate = normalizeDateForStorage(data.paymentDate, {
				kind: 'date',
				boundary: 'start'
			});
		}
		if (data.cycleId !== undefined && data.cycleId !== null) {
			updateData.cycleId = parseInt(data.cycleId);
		}
		if (data.notes !== undefined) updateData.notes = data.notes;

		const payment = await updatePayment(id, updateData);

		if (!payment) {
			logger.warn('not_found', { paymentId: id, updateData });
			return json({ error: 'Payment not found' }, { status: 404 });
		}

		logger.audit('success', { paymentId: id, after: payment });
		return json(payment);
	} catch (error) {
		logger.error('error', { paymentId: event.params.id, error });
		return json({ error: 'Failed to update payment' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'payment.delete');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		await deletePayment(id);
		logger.audit('success', { paymentId: id });
		return json({ success: true });
	} catch (error) {
		logger.error('error', { paymentId: event.params.id, error });
		return json({ error: 'Failed to delete payment' }, { status: 500 });
	}
};
