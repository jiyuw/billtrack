import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPaymentMethodById, updatePaymentMethod, deletePaymentMethod } from '$lib/server/db/queries';
import type { NewPaymentMethod } from '$lib/server/db/schema';
import { createRequestLogger } from '$lib/server/api-logger';

// GET /api/payment-methods/[id]
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'payment_method.get');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		const method = getPaymentMethodById(id);

		if (!method) {
			logger.warn('not_found', { paymentMethodId: id });
			return json({ error: 'Payment method not found' }, { status: 404 });
		}

		logger.info('success', { paymentMethodId: id });
		return json(method);
	} catch (error) {
		logger.error('error', { paymentMethodId: event.params.id, error });
		return json({ error: 'Failed to fetch payment method' }, { status: 500 });
	}
};

// PUT /api/payment-methods/[id]
export const PUT: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'payment_method.update');
	try {
		const { params, request } = event;
		const id = parseInt(params.id);
		const data = await request.json();
		const before = getPaymentMethodById(id);
		logger.info('request', { paymentMethodId: id, body: data });

		const updateData: Partial<NewPaymentMethod> = {
			nickname: data.nickname,
			lastFour: data.lastFour,
			type: data.type ?? null
		};

		Object.keys(updateData).forEach(
			(key) => updateData[key as keyof NewPaymentMethod] === undefined && delete updateData[key as keyof NewPaymentMethod]
		);

		const method = updatePaymentMethod(id, updateData);
		if (!method) {
			logger.warn('not_found', { paymentMethodId: id, updateData });
			return json({ error: 'Payment method not found' }, { status: 404 });
		}

		logger.audit('success', {
			paymentMethodId: id,
			before,
			after: method
		});
		return json(method);
	} catch (error) {
		logger.error('error', { paymentMethodId: event.params.id, error });
		return json({ error: 'Failed to update payment method' }, { status: 500 });
	}
};

// DELETE /api/payment-methods/[id]
export const DELETE: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'payment_method.delete');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		const method = deletePaymentMethod(id);

		if (!method) {
			logger.warn('not_found', { paymentMethodId: id });
			return json({ error: 'Payment method not found' }, { status: 404 });
		}

		logger.audit('success', { paymentMethodId: id, deleted: method });
		return json({ success: true });
	} catch (error) {
		logger.error('error', { paymentMethodId: event.params.id, error });
		return json({ error: 'Failed to delete payment method' }, { status: 500 });
	}
};
