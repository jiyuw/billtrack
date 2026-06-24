import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createBill, getAllBills } from '$lib/server/db/queries';
import type { NewBill } from '$lib/server/db/schema';
import { normalizeDateForStorage } from '$lib/utils/dates';
import { createRequestLogger } from '$lib/server/api-logger';

function parseOptionalId(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number.parseInt(String(value), 10);
	return Number.isNaN(parsed) ? null : parsed;
}

// GET /api/bills - Get all bills
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'bills.list');
	try {
		const { url } = event;
		logger.info('request', { query: Object.fromEntries(url.searchParams.entries()) });

		const status = url.searchParams.get('status') as any;
		const categoryId = url.searchParams.get('categoryId');
		const searchQuery = url.searchParams.get('search');
		const sortField = url.searchParams.get('sortField') as any;
		const sortDirection = url.searchParams.get('sortDirection') as any;

		const filters = {
			status: status || 'all',
			categoryId: categoryId ? parseInt(categoryId) : undefined,
			searchQuery: searchQuery || undefined
		};

		const sort = sortField
			? {
					field: sortField || 'dueDate',
					direction: sortDirection || 'asc'
				}
			: undefined;

		const bills = getAllBills(filters, sort);
		logger.info('success', {
			count: bills.length,
			filters,
			sort
		});
		return json(bills);
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to fetch bills' }, { status: 500 });
	}
};

// POST /api/bills - Create a new bill
export const POST: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'bill.create');
	try {
		const { request } = event;
		const data = await request.json();
		logger.info('request', { body: data });

		// Validate required fields
		if (!data.name || (!data.isVariable && !data.amount) || !data.dueDate) {
			logger.warn('validation_failed', {
				reason: 'missing_required_fields',
				body: data
			});
			return json({ error: 'Missing required fields' }, { status: 400 });
		}
		if (data.isRecurring && (!data.recurrenceInterval || !data.recurrenceUnit)) {
			logger.warn('validation_failed', {
				reason: 'missing_recurrence_fields',
				body: data
			});
			return json({ error: 'Missing recurrence interval or unit' }, { status: 400 });
		}

		let dueDate: Date;
		let cycleStartDate: Date;
		let cycleEndDate: Date;
		try {
			dueDate = normalizeDateForStorage(data.dueDate, { kind: 'date', boundary: 'end' });
			cycleStartDate = data.cycleStartDate
				? normalizeDateForStorage(data.cycleStartDate, { kind: 'date', boundary: 'start' })
				: normalizeDateForStorage(data.dueDate, { kind: 'date', boundary: 'start' });
			cycleEndDate = data.cycleEndDate
				? normalizeDateForStorage(data.cycleEndDate, { kind: 'date', boundary: 'end' })
				: dueDate;
		} catch (error) {
			logger.warn('validation_failed', {
				reason: 'invalid_date_format',
				dueDate: data.dueDate,
				cycleStartDate: data.cycleStartDate,
				cycleEndDate: data.cycleEndDate,
				error
			});
			return json({ error: 'Invalid due date format. Expected YYYY-MM-DD' }, { status: 400 });
		}

		if (cycleStartDate.getTime() > cycleEndDate.getTime()) {
			logger.warn('validation_failed', {
				reason: 'cycle_start_after_cycle_end',
				body: data,
				parsedDates: { dueDate, cycleStartDate, cycleEndDate }
			});
			return json({ error: 'Cycle start date must be on or before cycle end date' }, { status: 400 });
		}

		const categoryId = parseOptionalId(data.categoryId);
		const assetTagId = parseOptionalId(data.assetTagId);
		const paymentMethodId = parseOptionalId(data.paymentMethodId);

		if (data.isAutopay && paymentMethodId === null) {
			logger.warn('validation_failed', {
				reason: 'autopay_missing_payment_method',
				body: data
			});
			return json({ error: 'Autopay bills must include a payment method' }, { status: 400 });
		}

		const newBill: NewBill = {
			name: data.name,
			amount: data.isVariable ? 0 : parseFloat(data.amount),
			dueDate,
			cycleStartDate,
			cycleEndDate,
			paymentLink: data.paymentLink || null,
			categoryId,
			assetTagId,
			isRecurring: data.isRecurring || false,
			recurrenceInterval: data.recurrenceInterval ? parseInt(data.recurrenceInterval) : null,
			recurrenceUnit: data.recurrenceUnit || null,
			recurrenceDay: data.isRecurring
				? (data.recurrenceDay ? parseInt(data.recurrenceDay) : dueDate.getDate())
				: null,
			isPaid: data.isPaid || false,
			isAutopay: data.isAutopay || false,
			paymentMethodId: data.isAutopay ? paymentMethodId : null,
			isVariable: data.isVariable || false,
			notes: data.notes || null
		};

		const bill = createBill(newBill);
		logger.audit('success', {
			billId: bill.id,
			bill
		});
		return json(bill, { status: 201 });
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to create bill' }, { status: 500 });
	}
};
