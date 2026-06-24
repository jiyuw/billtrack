import type { PageServerLoad, Actions } from './$types';
import { getAllCategories, createBill, getAllPaymentMethods, getAllAssetTags } from '$lib/server/db/queries';
import { redirect } from '@sveltejs/kit';
import type { NewBill } from '$lib/server/db/schema';
import { formatDateForInput, normalizeDateForStorage } from '$lib/utils/dates';
import { createRequestLogger } from '$lib/server/api-logger';

export const load: PageServerLoad = async () => {
	const categories = getAllCategories();
	const assetTags = getAllAssetTags();
	const paymentMethods = getAllPaymentMethods();
	return { categories, assetTags, paymentMethods };
};

export const actions: Actions = {
	default: async (event) => {
		const logger = createRequestLogger(event, 'bill.form_create');
		const { request } = event;
		const formData = await request.formData();
		const data = Object.fromEntries(formData);
		logger.info('request', { body: data });

		// Parse and validate due date
		let dueDate: Date;
		try {
			dueDate = normalizeDateForStorage(data.dueDate as string, { kind: 'date', boundary: 'end' });
		} catch (error) {
			logger.warn('invalid_due_date_fallback', { dueDate: data.dueDate, error });
			// Fallback to today's local calendar day if parsing fails
			dueDate = normalizeDateForStorage(formatDateForInput(new Date()), { kind: 'date', boundary: 'end' });
		}

		const newBill: NewBill = {
			name: data.name as string,
			amount: parseFloat(data.amount as string),
			dueDate,
			paymentLink: (data.paymentLink as string) || null,
			categoryId: data.categoryId ? parseInt(data.categoryId as string) : null,
			assetTagId: data.assetTagId ? parseInt(data.assetTagId as string) : null,
			isRecurring: data.isRecurring === 'true',
			recurrenceInterval: data.recurrenceInterval ? parseInt(data.recurrenceInterval as string) : null,
			recurrenceUnit: (data.recurrenceUnit as any) || null,
			recurrenceDay: data.recurrenceDay ? parseInt(data.recurrenceDay as string) : null,
			isPaid: false,
			notes: (data.notes as string) || null,
			isAutopay: data.isAutopay === 'true',
			paymentMethodId: data.paymentMethodId ? parseInt(data.paymentMethodId as string) : null
		};

		const bill = createBill(newBill);
		logger.audit('success', { billId: bill.id, bill });

		throw redirect(303, '/');
	}
};
