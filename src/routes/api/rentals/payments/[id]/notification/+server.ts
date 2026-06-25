import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getChargeableRentalPayment,
	upsertRentalPaymentNotification
} from '$lib/server/db/rental-queries';
import { createRequestLogger } from '$lib/server/api-logger';
import { normalizeDateForStorage } from '$lib/utils/dates';

export const PATCH: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'rentals.payment_notification.update');
	try {
		const paymentId = Number.parseInt(event.params.id, 10);
		if (Number.isNaN(paymentId)) {
			logger.warn('validation_failed', { reason: 'invalid_payment_id', paymentId: event.params.id });
			return json({ error: 'Invalid payment id' }, { status: 400 });
		}

		const data = await event.request.json();
		if (typeof data.isNotified !== 'boolean') {
			logger.warn('validation_failed', { reason: 'invalid_is_notified', body: data });
			return json({ error: 'isNotified must be a boolean' }, { status: 400 });
		}

		if (data.isNotified && !data.notifiedOn) {
			logger.warn('validation_failed', { reason: 'missing_notified_on', body: data });
			return json({ error: 'notifiedOn is required when notifying a payment' }, { status: 400 });
		}

		const payment = getChargeableRentalPayment(paymentId);
		if (!payment) {
			logger.warn('not_found', { paymentId });
			return json({ error: 'Chargeable rental payment not found' }, { status: 404 });
		}

		const notifiedOn = data.isNotified
			? normalizeDateForStorage(data.notifiedOn, { kind: 'date', boundary: 'start' })
			: null;
		const notification = upsertRentalPaymentNotification({
			paymentId,
			isNotified: data.isNotified,
			notifiedOn
		});

		logger.audit('success', { paymentId, notification });
		return json(notification);
	} catch (error) {
		logger.error('error', { paymentId: event.params.id, error });
		return json({ error: 'Failed to update payment notification' }, { status: 500 });
	}
};
