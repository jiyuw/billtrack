import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBillById, updateBill, deleteBill, markBillAsPaid } from '$lib/server/db/queries';
import {
	createPayment,
	createPaymentForCycle,
	getCurrentCycle,
	getFocusCycleForBill,
	rebuildCurrentAndFutureCycles
} from '$lib/server/db/bill-queries';
import { formatDateForInput, normalizeDateForStorage } from '$lib/utils/dates';

// GET /api/bills/[id] - Get a single bill
export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = parseInt(params.id);
		const bill = getBillById(id);

		if (!bill) {
			return json({ error: 'Bill not found' }, { status: 404 });
		}

		return json(bill);
	} catch (error) {
		console.error('Error fetching bill:', error);
		return json({ error: 'Failed to fetch bill' }, { status: 500 });
	}
};

// PUT /api/bills/[id] - Update a bill
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseInt(params.id);
		const data = await request.json();
		const existingBill = getBillById(id);
		if (!existingBill) {
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
				console.error('Error parsing due date:', { dueDate: data.dueDate, error });
				return json({ error: 'Invalid due date format. Expected YYYY-MM-DD' }, { status: 400 });
			}
		}

		const nextCycleStartDate = parsedCycleStartDate ?? existingBill.cycleStartDate ?? existingBill.dueDate;
		const nextCycleEndDate = parsedCycleEndDate ?? existingBill.cycleEndDate ?? existingBill.dueDate;
		const nextDueDate = parsedDueDate ?? existingBill.dueDate;

		if (nextCycleStartDate.getTime() > nextCycleEndDate.getTime()) {
			return json({ error: 'Cycle start date must be on or before cycle end date' }, { status: 400 });
		}

		if (nextDueDate.getTime() < nextCycleEndDate.getTime()) {
			return json({ error: 'Cycle due date must be on or after the cycle end date' }, { status: 400 });
		}

		const parsedPaymentMethodId = data.paymentMethodId ? parseInt(data.paymentMethodId) : undefined;
		const normalizedPaymentMethodId = Number.isNaN(parsedPaymentMethodId) ? undefined : parsedPaymentMethodId;

		const updateData: any = {
			name: data.name,
			amount: data.amount ? parseFloat(data.amount) : undefined,
			dueDate: parsedDueDate,
			cycleStartDate: parsedCycleStartDate,
			cycleEndDate: parsedCycleEndDate,
			paymentLink: data.paymentLink,
			categoryId: data.categoryId,
			assetTagId: data.assetTagId ? parseInt(data.assetTagId) : undefined,
			isRecurring: data.isRecurring,
			recurrenceInterval: data.recurrenceInterval ? parseInt(data.recurrenceInterval) : undefined,
			recurrenceUnit: data.recurrenceUnit,
			recurrenceDay: data.recurrenceDay ? parseInt(data.recurrenceDay) : nextDueDate.getDate(),
			isPaid: data.isPaid,
			isAutopay: data.isAutopay,
			paymentMethodId: normalizedPaymentMethodId,
			isVariable: data.isVariable,
			notes: data.notes
		};
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
		if (!bill) return json({ error: 'Bill not found' }, { status: 404 });

		if (dueDateChanged || cycleChanged || recurrenceChanged) {
			await rebuildCurrentAndFutureCycles(id, parsedRebuildFromCycleStartDate, rebuildScope);
		}

		return json(bill);
	} catch (error) {
		console.error('Error updating bill:', error);
		return json({ error: 'Failed to update bill' }, { status: 500 });
	}
};

// DELETE /api/bills/[id] - Delete a bill
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = parseInt(params.id);
		const bill = deleteBill(id);

		if (!bill) {
			return json({ error: 'Bill not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting bill:', error);
		return json({ error: 'Failed to delete bill' }, { status: 500 });
	}
};

// PATCH /api/bills/[id] - Mark bill as paid/unpaid
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseInt(params.id);
		const { isPaid, paymentAmount, paymentDate, paymentCycleId, paymentNotes } = await request.json();

		const currentBill = getBillById(id);
		if (!currentBill) {
			return json({ error: 'Bill not found' }, { status: 404 });
		}

		// If marking as paid, create payment in the current cycle
		if (isPaid) {
			const amountPaid = paymentAmount !== undefined ? parseFloat(paymentAmount) : currentBill.amount;
			const autoNote =
				amountPaid !== currentBill.amount
					? `Payment recorded. Original amount: $${currentBill.amount.toFixed(2)}`
					: 'Payment recorded';
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
			return json(bill);
		}

		// Do not auto-advance due dates. Just mark as unpaid.
		const bill = markBillAsPaid(id, false);
		return json(bill);
	} catch (error) {
		console.error('Error updating bill status:', error);
		return json({ error: 'Failed to update bill status' }, { status: 500 });
	}
};
