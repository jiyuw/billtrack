import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllPaymentMethods, createPaymentMethod } from '$lib/server/db/queries';
import type { NewPaymentMethod } from '$lib/server/db/schema';
import { createRequestLogger } from '$lib/server/api-logger';

// GET /api/payment-methods - Get all payment methods
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'payment_methods.list');
	try {
		const methods = getAllPaymentMethods();
		logger.info('success', { count: methods.length });
		return json(methods);
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to fetch payment methods' }, { status: 500 });
	}
};

// POST /api/payment-methods - Create a payment method
export const POST: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'payment_method.create');
	try {
		const { request } = event;
		const data = await request.json();
		logger.info('request', {
			nickname: data.nickname,
			type: data.type ?? null,
			lastFour: data.lastFour
		});

		if (!data.nickname || !data.lastFour) {
			logger.warn('validation_failed', { reason: 'missing_required_fields' });
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		const newMethod: NewPaymentMethod = {
			nickname: data.nickname,
			lastFour: data.lastFour,
			type: data.type || null
		};

		const method = createPaymentMethod(newMethod);
		logger.audit('success', { paymentMethodId: method.id, paymentMethod: method });
		return json(method, { status: 201 });
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to create payment method' }, { status: 500 });
	}
};
