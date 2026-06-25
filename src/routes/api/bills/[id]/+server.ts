import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getBillById,
	updateBill,
	deleteBill,
	markBillAsPaid,
	getAssetTagById
} from '$lib/server/db/queries';
import {
	createPayment,
	createPaymentForCycle,
	getCurrentCycle,
	getFocusCycleForBill,
	rebuildCurrentAndFutureCycles
} from '$lib/server/db/bill-queries';
import { formatDateForInput, normalizeDateForStorage } from '$lib/utils/dates';
import { createRequestLogger } from '$lib/server/api-logger';

function parseOptionalId(value: unknown): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	const parsed = Number.parseInt(String(value), 10);
	return Number.isNaN(parsed) ? null : parsed;
}

// GET /api/bills/[id] - Get a single bill
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'bill.get');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		const bill = getBillById(id);

		if (!bill) {
			logger.warn('not_found', { billId: id });
			return json({ error: 'Bill not found' }, { status: 404 });
		}

		logger.info('success', { billId: id });
		return json(bill);
	} catch (error) {
		logger.error('error', { billId: event.params.id, error });
		return json({ error: 'Failed to fetch bill' }, { status: 500 });
	}
};

// PUT /api/bills/[id] - Update a bill
export const PUT: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'bill.update');
	try {
		const { params, request } = event;
		const id = parseInt(params.id);
		const data = await request.json();
		logger.info('request', {
			billId: id,
			body: data
		});
		const existingBill = getBillById(id);
		if (!existingBill) {
			logger.warn('not_found', { billId: id, body: data });
			return json({ error: 'Bill not found' }, { status: 404 });
		}
		const rebuildScope = data.rebuildScope === 'all' ? 'all' : 'future';

		let parsedDueDate: Date | undefined;
		let parsedCycleStartDate: Date | undefined;
		let parsedCycleEndDate: Date | undefined;
		let parsedRebuildFromCycleStartDate: Date | undefined;
		if (data.dueDate) {
			try {
				parsedDueDate = normalizeDateForStorage(data.dueDate, {
					kind: 'date',
					boundary: 'end'
				});
				parsedCycleStartDate = data.cycleStartDate
					? normalizeDateForStorage(data.cycleStartDate, { kind: 'date', boundary: 'start' })
					: undefined;
				parsedCycleEndDate = data.cycleEndDate
					? normalizeDateForStorage(data.cycleEndDate, { kind: 'date', boundary: 'end' })
					: undefined;
				parsedRebuildFromCycleStartDate = data.rebuildFromCycleStartDate
					? normalizeDateForStorage(data.rebuildFromCycleStartDate, { kind: 'date', boundary: 'start' })
					: undefined;
			} catch (error) {
				logger.warn('validation_failed', {
					billId: id,
					reason: 'invalid_date_format',
					dueDate: data.dueDate,
					cycleStartDate: data.cycleStartDate,
					cycleEndDate: data.cycleEndDate,
					error
				});
				return json({ error: 'Invalid due date format. Expected YYYY-MM-DD' }, { status: 400 });
			}
		}

		const nextCycleStartDate = parsedCycleStartDate ?? existingBill.cycleStartDate ?? existingBill.dueDate;
		const nextCycleEndDate = parsedCycleEndDate ?? existingBill.cycleEndDate ?? existingBill.dueDate;
		const nextDueDate = parsedDueDate ?? existingBill.dueDate;

		if (nextCycleStartDate.getTime() > nextCycleEndDate.getTime()) {
			logger.warn('validation_failed', {
				billId: id,
				reason: 'cycle_start_after_cycle_end',
				body: data,
				parsedDates: {
					nextDueDate,
					nextCycleStartDate,
					nextCycleEndDate
				}
			});
			return json({ error: 'Cycle start date must be on or before cycle end date' }, { status: 400 });
		}

		const categoryId = parseOptionalId(data.categoryId);
		const assetTagId = parseOptionalId(data.assetTagId);
		const paymentMethodId = parseOptionalId(data.paymentMethodId);
		const selectedAssetId = assetTagId !== undefined ? assetTagId : existingBill.assetTagId;
		const selectedAsset =
			selectedAssetId === null || selectedAssetId === undefined
				? null
				: getAssetTagById(selectedAssetId);
		const shouldNormalizeChargeToTenant =
			data.chargeToTenant !== undefined || assetTagId !== undefined;
		const requestedChargeToTenant =
			data.chargeToTenant === undefined ? existingBill.chargeToTenant : data.chargeToTenant === true;

		if (data.isAutopay === true && paymentMethodId === null) {
			logger.warn('validation_failed', {
				billId: id,
				reason: 'autopay_missing_payment_method',
				body: data
			});
			return json({ error: 'Autopay bills must include a payment method' }, { status: 400 });
		}

		const updateData: any = {
			name: data.name,
			amount: data.amount ? parseFloat(data.amount) : undefined,
			dueDate: parsedDueDate,
			cycleStartDate: parsedCycleStartDate,
			cycleEndDate: parsedCycleEndDate,
			paymentLink: data.paymentLink,
			categoryId,
			assetTagId,
			isRecurring: data.isRecurring,
			recurrenceInterval: data.recurrenceInterval ? parseInt(data.recurrenceInterval) : undefined,
			recurrenceUnit: data.recurrenceUnit,
			recurrenceDay: data.recurrenceDay ? parseInt(data.recurrenceDay) : nextDueDate.getDate(),
			isPaid: data.isPaid,
			isAutopay: data.isAutopay,
			paymentMethodId,
			isVariable: data.isVariable,
			notes: data.notes
		};
		if (shouldNormalizeChargeToTenant) {
			updateData.chargeToTenant = selectedAsset?.isRental && requestedChargeToTenant;
		}
		if (data.isRecurring === false) {
			updateData.recurrenceInterval = null;
			updateData.recurrenceUnit = null;
			updateData.recurrenceDay = null;
		}
		if (data.isAutopay === false) {
			updateData.paymentMethodId = null;
		}

		// Remove undefined values
		Object.keys(updateData).forEach(
			(key) => updateData[key] === undefined && delete updateData[key]
		);

		const dueDateChanged = parsedDueDate
			? parsedDueDate.getTime() !== existingBill.dueDate.getTime()
			: false;
		const cycleChanged =
			(parsedCycleStartDate
				? parsedCycleStartDate.getTime() !== (existingBill.cycleStartDate ?? existingBill.dueDate).getTime()
				: false) ||
			(parsedCycleEndDate
				? parsedCycleEndDate.getTime() !== (existingBill.cycleEndDate ?? existingBill.dueDate).getTime()
				: false);
		const recurrenceChanged =
			(updateData.isRecurring !== undefined && updateData.isRecurring !== existingBill.isRecurring) ||
			(updateData.recurrenceInterval !== undefined &&
				updateData.recurrenceInterval !== existingBill.recurrenceInterval) ||
			(updateData.recurrenceUnit !== undefined &&
				updateData.recurrenceUnit !== existingBill.recurrenceUnit);

		const bill = updateBill(id, updateData);
		if (!bill) {
			logger.warn('not_found_after_update', { billId: id, updateData });
			return json({ error: 'Bill not found' }, { status: 404 });
		}

		if (dueDateChanged || cycleChanged || recurrenceChanged) {
			await rebuildCurrentAndFutureCycles(id, parsedRebuildFromCycleStartDate, rebuildScope);
		}

		logger.audit('success', {
			billId: id,
			before: existingBill,
			after: bill,
			dueDateChanged,
			cycleChanged,
			recurrenceChanged,
			rebuildScope,
			bill
		});
		return json(bill);
	} catch (error) {
		logger.error('error', {
			billId: event.params.id,
			error
		});
		return json({ error: 'Failed to update bill' }, { status: 500 });
	}
};

// DELETE /api/bills/[id] - Delete a bill
export const DELETE: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'bill.delete');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		logger.info('request', { billId: id });
		const bill = deleteBill(id);

		if (!bill) {
			logger.warn('not_found', { billId: id });
			return json({ error: 'Bill not found' }, { status: 404 });
		}

		logger.audit('success', { billId: id, deleted: bill });
		return json({ success: true });
	} catch (error) {
		logger.error('error', { billId: event.params.id, error });
		return json({ error: 'Failed to delete bill' }, { status: 500 });
	}
};

// PATCH /api/bills/[id] - Mark bill as paid/unpaid
export const PATCH: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'bill.payment_toggle');
	try {
		const { params, request } = event;
		const id = parseInt(params.id);
		const { isPaid, paymentAmount, paymentDate, paymentCycleId, paymentNotes } = await request.json();
		logger.info('request', {
			billId: id,
			isPaid,
			paymentAmount,
			paymentDate,
			paymentCycleId,
			paymentNotes
		});

		const currentBill = getBillById(id);
		if (!currentBill) {
			logger.warn('not_found', { billId: id });
			return json({ error: 'Bill not found' }, { status: 404 });
		}

		// If marking as paid, create payment in the current cycle
		if (isPaid) {
			const amountPaid = paymentAmount !== undefined ? parseFloat(paymentAmount) : currentBill.amount;
			const autoNote = 'Payment recorded';
			const note = paymentNotes?.trim() || autoNote;
			const parsedPaymentDate = paymentDate
				? normalizeDateForStorage(paymentDate, { kind: 'date', boundary: 'start' })
				: normalizeDateForStorage(formatDateForInput(new Date()), { kind: 'date', boundary: 'start' });
			const cycleId = paymentCycleId ? parseInt(paymentCycleId) : null;
			if (cycleId) {
				await createPaymentForCycle(
					{
						billId: id,
						amount: amountPaid,
						paymentDate: parsedPaymentDate,
						notes: note
					},
					cycleId
				);
			} else {
				await createPayment({
					billId: id,
					amount: amountPaid,
					paymentDate: parsedPaymentDate,
					notes: note
				});
			}
		}

		if (isPaid) {
			const focusCycle = await getFocusCycleForBill(id);
			let shouldMarkPaid = false;
			if (focusCycle) {
				if (currentBill.isVariable) {
					shouldMarkPaid = focusCycle.totalPaid > 0 || focusCycle.isPaid;
				} else {
					shouldMarkPaid = focusCycle.isPaid || focusCycle.totalPaid >= focusCycle.expectedAmount;
				}
			}
			const bill = updateBill(id, { isPaid: shouldMarkPaid });
			logger.audit('success', {
				billId: id,
				action: 'mark_paid',
				shouldMarkPaid
			});
			return json(bill);
		}

		// Do not auto-advance due dates. Just mark as unpaid.
		const bill = markBillAsPaid(id, false);
		logger.audit('success', {
			billId: id,
			action: 'mark_unpaid'
		});
		return json(bill);
	} catch (error) {
		logger.error('error', { billId: event.params.id, error });
		return json({ error: 'Failed to update bill status' }, { status: 500 });
	}
};
