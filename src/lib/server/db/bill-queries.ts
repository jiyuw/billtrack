import { db } from './index';
import { bills, billCycles, billPayments } from './schema';
import type {
	Bill,
	BillCycle,
	NewBillCycle,
	BillPayment,
	NewBillPayment
} from './schema';
import type { BillWithCycle, BillCycleWithComputed, BillUsageStats } from '$lib/types/bill';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import {
	calculateBillCycleDates,
	findCycleForPaymentDate,
	generateBillCyclesBetween
} from '../utils/bill-cycle-calculator';
import { isBefore, isAfter, endOfDay } from 'date-fns';

const cycleDueDateSql = sql`coalesce(${billCycles.dueDate}, ${billCycles.endDate})`;

/**
 * Get bill with current cycle
 */
export async function getBillWithCurrentCycle(id: number): Promise<BillWithCycle | undefined> {
	// Use existing getBillById from queries.ts
	const { getBillById } = await import('./queries');
	const bill = getBillById(id);
	if (!bill) return undefined;

	await ensureCyclesExist(bill);
	await dedupeCyclesForBill(bill);

	const currentCycle = await getCurrentCycle(bill.id);
	const focusCycle = await getFocusCycleForBill(bill.id);

	const usageStats = bill.isVariable ? await getBillUsageStats(bill.id) : null;

	return {
		...bill,
		currentCycle: currentCycle ? addComputedFields(currentCycle) : null,
		focusCycle: focusCycle ? addComputedFields(focusCycle) : null,
		usageStats
	};
}

/**
 * Get all bills with their current cycles
 */
export async function getAllBillsWithCurrentCycle(): Promise<BillWithCycle[]> {
	const { getAllBills } = await import('./queries');
	const allBills = getAllBills();

	const billsWithCycles = await Promise.all(
		allBills.map(async (bill) => {
			await ensureCyclesExist(bill);
			await dedupeCyclesForBill(bill);
			const currentCycle = await getCurrentCycle(bill.id);
			const focusCycle = await getFocusCycleForBill(bill.id);
			const usageStats = bill.isVariable ? await getBillUsageStats(bill.id) : null;

			return {
				...bill,
				currentCycle: currentCycle ? addComputedFields(currentCycle) : null,
				focusCycle: focusCycle ? addComputedFields(focusCycle) : null,
				usageStats
			};
		})
	);

	return billsWithCycles;
}

async function getBillUsageStats(billId: number, windowSize = 6): Promise<BillUsageStats | null> {
	const cycles = await db
		.select({
			totalPaid: billCycles.totalPaid,
			endDate: billCycles.endDate
		})
		.from(billCycles)
		.where(
			and(
				eq(billCycles.billId, billId),
				sql`${billCycles.totalPaid} > 0`
			)
		)
		.orderBy(desc(billCycles.endDate))
		.limit(windowSize);

	if (cycles.length === 0) return null;

	const amounts = cycles.map((cycle) => cycle.totalPaid);
	const total = amounts.reduce((sum, amount) => sum + amount, 0);
	const average = total / amounts.length;
	const min = Math.min(...amounts);
	const max = Math.max(...amounts);
	const lastAmount = amounts[0];

	return {
		count: amounts.length,
		average,
		min,
		max,
		lastAmount
	};
}

/**
 * Get current cycle for a bill
 */
export async function getCurrentCycle(billId: number): Promise<BillCycle | undefined> {
	const now = new Date();
	const nowTimestamp = Math.floor(now.getTime() / 1000);
	const result = await db
		.select()
		.from(billCycles)
		.where(
				and(
					eq(billCycles.billId, billId),
					sql`${billCycles.startDate} <= ${nowTimestamp}`,
					sql`${billCycles.endDate} >= ${nowTimestamp}`
				)
			)
		.orderBy(desc(billCycles.startDate), desc(billCycles.id))
		.limit(1);

	return result[0];
}

/**
 * Get all cycles for a bill
 */
export async function getCyclesForBill(billId: number): Promise<BillCycle[]> {
	const { getBillById } = await import('./queries');
	const bill = getBillById(billId);
	if (bill) {
		await dedupeCyclesForBill(bill);
	}

	return db
		.select()
		.from(billCycles)
		.where(eq(billCycles.billId, billId))
		.orderBy(desc(billCycles.startDate), desc(billCycles.id));
}

/**
 * Get the focus cycle for a bill.
 * Rule: pick the earliest unpaid cycle that is due on or before today.
 * If none, use the current cycle (today's cycle), even if paid.
 */
export async function getFocusCycleForBill(billId: number): Promise<BillCycle | undefined> {
	const now = new Date();
	const todayEnd = endOfDay(now);
	const todayEndTimestamp = Math.floor(todayEnd.getTime() / 1000);

	const unpaidPast = await db
		.select()
		.from(billCycles)
		.where(
			and(
				eq(billCycles.billId, billId),
				eq(billCycles.isPaid, false),
				sql`${cycleDueDateSql} <= ${todayEndTimestamp}`
			)
		)
		.orderBy(asc(billCycles.startDate))
		.limit(1);

	if (unpaidPast.length > 0) return unpaidPast[0];

	const current = await getCurrentCycle(billId);
	if (current) return current;

	const latestPast = await db
		.select()
		.from(billCycles)
		.where(and(eq(billCycles.billId, billId), sql`${cycleDueDateSql} <= ${todayEndTimestamp}`))
		.orderBy(desc(cycleDueDateSql))
		.limit(1);

	return latestPast[0];
}

/**
 * Ensure cycles exist up to the current date
 */
async function ensureCyclesExist(bill: Bill): Promise<void> {
	const now = new Date();

	// Get the latest cycle
	const latestCycle = await db
		.select()
		.from(billCycles)
		.where(eq(billCycles.billId, bill.id))
		.orderBy(desc(cycleDueDateSql))
		.limit(1);

	let startFrom: Date;

	if (latestCycle.length === 0) {
		// No cycles exist
		// For recurring bills, start from the anchor cycle start
		// For non-recurring bills, create single cycle
		if (bill.isRecurring && bill.recurrenceUnit && bill.recurrenceInterval) {
			startFrom = bill.cycleStartDate ?? bill.dueDate;
		} else {
			const cycleDates = calculateBillCycleDates(bill);

			// Create single cycle for non-recurring bill
			await db.insert(billCycles).values({
				billId: bill.id,
				startDate: cycleDates.startDate,
				endDate: cycleDates.endDate,
				dueDate: cycleDates.dueDate,
				expectedAmount: bill.amount,
				totalPaid: 0,
				isPaid: bill.isPaid
			});
			return;
		}
	} else {
		const latest = latestCycle[0];

		// If current cycle exists, we're done
		const latestCycleEndDate = latest.endDate;
		if (isAfter(latestCycleEndDate, now) || latestCycleEndDate.getTime() === now.getTime()) {
			return;
		}

		// For non-recurring bills, don't create more cycles
		if (!bill.isRecurring || !bill.recurrenceUnit || !bill.recurrenceInterval) {
			return;
		}

		// Start from the next cycle after the latest
		const nextCycleDates = calculateBillCycleDates(
			bill,
			new Date(latestCycleEndDate.getTime() + 24 * 60 * 60 * 1000)
		);
		startFrom = nextCycleDates.startDate;
	}

	// Generate all missing cycles up to now (only for recurring bills)
	const cycles = generateBillCyclesBetween(bill, startFrom, now);

	for (const cycle of cycles) {
		await db.insert(billCycles).values({
			billId: bill.id,
			startDate: cycle.startDate,
			endDate: cycle.endDate,
			dueDate: cycle.dueDate,
			expectedAmount: bill.amount,
			totalPaid: 0,
			isPaid: false
		});
	}
}

async function dedupeCyclesForBill(bill: Bill): Promise<void> {
	const cycles = await db
		.select()
		.from(billCycles)
		.where(eq(billCycles.billId, bill.id))
		.orderBy(asc(billCycles.startDate), asc(billCycles.id));

	if (cycles.length < 2) return;

	const payments = await db
		.select({
			id: billPayments.id,
			cycleId: billPayments.cycleId
		})
		.from(billPayments)
		.where(eq(billPayments.billId, bill.id));

	const paymentCountByCycle = new Map<number, number>();
	for (const payment of payments) {
		paymentCountByCycle.set(
			payment.cycleId,
			(paymentCountByCycle.get(payment.cycleId) ?? 0) + 1
		);
	}

	const groups = new Map<string, BillCycle[]>();
	for (const cycle of cycles) {
		const key = [
			cycle.startDate.getTime(),
			cycle.endDate.getTime(),
			(cycle.dueDate ?? cycle.endDate).getTime()
		].join(':');

		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key)?.push(cycle);
	}

	let earliestAffectedStartDate: Date | null = null;

	for (const group of groups.values()) {
		if (group.length < 2) continue;

		const [keeper, ...duplicates] = [...group].sort((a, b) => {
			const paymentCountDiff =
				(paymentCountByCycle.get(b.id) ?? 0) - (paymentCountByCycle.get(a.id) ?? 0);
			if (paymentCountDiff !== 0) return paymentCountDiff;
			if (b.totalPaid !== a.totalPaid) return b.totalPaid - a.totalPaid;
			if (a.isPaid !== b.isPaid) return Number(b.isPaid) - Number(a.isPaid);
			return a.id - b.id;
		});

		const duplicateIds = duplicates.map((cycle) => cycle.id);
		if (duplicateIds.length === 0) continue;

		if (!earliestAffectedStartDate || keeper.startDate < earliestAffectedStartDate) {
			earliestAffectedStartDate = keeper.startDate;
		}

		await db
			.update(billPayments)
			.set({
				cycleId: keeper.id,
				updatedAt: new Date()
			})
			.where(inArray(billPayments.cycleId, duplicateIds));

		await db.delete(billCycles).where(inArray(billCycles.id, duplicateIds));
	}

	if (earliestAffectedStartDate) {
		await recalculateCyclesFrom(bill, earliestAffectedStartDate);
	}
}

/**
 * Add computed fields to a cycle
 */
function addComputedFields(cycle: BillCycle): BillCycleWithComputed {
	const remaining = cycle.expectedAmount - cycle.totalPaid;
	const percentPaid = cycle.expectedAmount > 0
		? Math.min((cycle.totalPaid / cycle.expectedAmount) * 100, 100)
		: 0;

	return {
		...cycle,
		remaining,
		percentPaid
	};
}

/**
 * Create a payment and update cycle totals
 */
export async function createPayment(
	data: Omit<NewBillPayment, 'cycleId'>
): Promise<BillPayment> {
	const { getBillById } = await import('./queries');
	const bill = getBillById(data.billId);
	if (!bill) throw new Error('Bill not found');

	// Ensure cycles exist
	await ensureCyclesExist(bill);

	// Find which cycle this payment belongs to
	const cycleDates = findCycleForPaymentDate(bill, data.paymentDate);

	// Get or create the cycle
	let cycle = await db
		.select()
		.from(billCycles)
		.where(
			and(
				eq(billCycles.billId, data.billId),
				eq(billCycles.startDate, cycleDates.startDate)
			)
		)
		.limit(1);

	if (cycle.length === 0) {
		// Create the cycle if it doesn't exist (for backdated payments)
		const newCycleResult = await db
			.insert(billCycles)
			.values({
				billId: data.billId,
				startDate: cycleDates.startDate,
				endDate: cycleDates.endDate,
				dueDate: cycleDates.dueDate,
				expectedAmount: bill.amount,
				totalPaid: 0,
				isPaid: false
			})
			.returning();

		cycle = newCycleResult;
	}

	const cycleId = cycle[0].id;

	// Insert the payment
	const result = await db
		.insert(billPayments)
		.values({
			...data,
			cycleId
		})
		.returning();

	// Recalculate cycles from this point forward
	await recalculateCyclesFrom(bill, cycleDates.startDate);

	return result[0];
}

/**
 * Create a payment for a specific cycle and update cycle totals
 */
export async function createPaymentForCycle(
	data: Omit<NewBillPayment, 'cycleId'>,
	cycleId: number
): Promise<BillPayment> {
	const { getBillById } = await import('./queries');
	const bill = getBillById(data.billId);
	if (!bill) throw new Error('Bill not found');

	// Ensure cycles exist
	await ensureCyclesExist(bill);

	const cycle = await db
		.select()
		.from(billCycles)
		.where(and(eq(billCycles.id, cycleId), eq(billCycles.billId, data.billId)))
		.limit(1);

	if (cycle.length === 0) {
		throw new Error('Cycle not found');
	}

	const result = await db
		.insert(billPayments)
		.values({
			...data,
			cycleId
		})
		.returning();

	// Recalculate cycles from this point forward
	await recalculateCyclesFrom(bill, cycle[0].startDate);

	return result[0];
}

/**
 * Update a payment and recalculate affected cycles
 */
export async function updatePayment(
	id: number,
	data: Partial<NewBillPayment>
): Promise<BillPayment | undefined> {
	const existing = await db
		.select()
		.from(billPayments)
		.where(eq(billPayments.id, id))
		.limit(1);

	if (existing.length === 0) return undefined;

	const oldPayment = existing[0];
	const { getBillById } = await import('./queries');
	const bill = getBillById(oldPayment.billId);
	if (!bill) throw new Error('Bill not found');

	let newCycleId = oldPayment.cycleId;
	let recalculationStartDate: Date | null = null;

	if (data.cycleId !== undefined) {
		const selectedCycle = await db
			.select()
			.from(billCycles)
			.where(and(eq(billCycles.id, data.cycleId), eq(billCycles.billId, bill.id)))
			.limit(1);

		if (selectedCycle.length === 0) {
			throw new Error('Cycle not found');
		}

		newCycleId = selectedCycle[0].id;
		recalculationStartDate = selectedCycle[0].startDate;
	}

	if (
		data.cycleId === undefined &&
		data.paymentDate &&
		data.paymentDate.getTime() !== oldPayment.paymentDate.getTime()
	) {
		const newCycleDates = findCycleForPaymentDate(bill, data.paymentDate);

		const newCycle = await db
			.select()
			.from(billCycles)
			.where(
				and(
					eq(billCycles.billId, bill.id),
					eq(billCycles.startDate, newCycleDates.startDate)
				)
			)
			.limit(1);

		if (newCycle.length > 0) {
			newCycleId = newCycle[0].id;
			recalculationStartDate = newCycle[0].startDate;
		}
	}

	const result = await db
		.update(billPayments)
		.set({
			...data,
			cycleId: newCycleId,
			updatedAt: new Date()
		})
		.where(eq(billPayments.id, id))
		.returning();

	// Recalculate all affected cycles
	const oldCycle = await db
		.select()
		.from(billCycles)
		.where(eq(billCycles.id, oldPayment.cycleId))
		.limit(1);

	if (oldCycle.length > 0) {
		const startDate =
			recalculationStartDate && recalculationStartDate < oldCycle[0].startDate
				? recalculationStartDate
				: oldCycle[0].startDate;

		await recalculateCyclesFrom(bill, startDate);
	}

	return result[0];
}

/**
 * Delete a payment and recalculate cycles
 */
export async function deletePayment(id: number): Promise<void> {
	const payment = await db
		.select()
		.from(billPayments)
		.where(eq(billPayments.id, id))
		.limit(1);

	if (payment.length === 0) return;

	const { getBillById } = await import('./queries');
	const bill = getBillById(payment[0].billId);
	if (!bill) return;

	const cycle = await db
		.select()
		.from(billCycles)
		.where(eq(billCycles.id, payment[0].cycleId))
		.limit(1);

	await db.delete(billPayments).where(eq(billPayments.id, id));

	if (cycle.length > 0) {
		await recalculateCyclesFrom(bill, cycle[0].startDate);
	}
}

/**
 * Rebuild current and future cycles after schedule changes (due date / recurrence).
 * Past cycles are preserved for history.
 */
export async function rebuildCurrentAndFutureCycles(
	billId: number,
	rebuildFromOverride?: Date,
	scope: 'future' | 'all' = 'future'
): Promise<void> {
	const { getBillById, updateBill } = await import('./queries');
	const bill = getBillById(billId);
	if (!bill) {
		throw new Error('Bill not found');
	}

	const now = new Date();
	const currentCycleDates = calculateBillCycleDates(bill, now);
	const earliestCycle = await db
		.select({ startDate: billCycles.startDate })
		.from(billCycles)
		.where(eq(billCycles.billId, bill.id))
		.orderBy(asc(billCycles.startDate))
		.limit(1);

	const futureRebuildFrom =
		rebuildFromOverride && rebuildFromOverride.getTime() < currentCycleDates.startDate.getTime()
			? rebuildFromOverride
			: currentCycleDates.startDate;
	const rebuildFrom =
		scope === 'all'
			? (earliestCycle[0]?.startDate ?? currentCycleDates.startDate)
			: futureRebuildFrom;
	const rebuildFromTimestamp = Math.floor(rebuildFrom.getTime() / 1000);

	const cyclesToReplace = await db
		.select({ id: billCycles.id })
		.from(billCycles)
		.where(
			and(
				eq(billCycles.billId, bill.id),
				sql`${billCycles.startDate} >= ${rebuildFromTimestamp}`
			)
		);

	const cycleIdsToReplace = cyclesToReplace.map((cycle) => cycle.id);

	const paymentsSnapshot = cycleIdsToReplace.length > 0
		? await db
			.select()
			.from(billPayments)
			.where(
				and(
					eq(billPayments.billId, bill.id),
					inArray(billPayments.cycleId, cycleIdsToReplace)
				)
			)
			.orderBy(asc(billPayments.paymentDate))
		: [];

	// Remove current/future cycles and their payments (payments are restored below).
	await db
		.delete(billCycles)
		.where(
			and(
				eq(billCycles.billId, bill.id),
				sql`${billCycles.startDate} >= ${rebuildFromTimestamp}`
			)
		);

	const seedCycles =
		scope === 'future'
			? generateBillCyclesBetween(
					bill,
					bill.cycleStartDate ?? currentCycleDates.startDate,
					now
				).filter((cycle) => cycle.startDate.getTime() >= rebuildFromTimestamp * 1000)
			: generateBillCyclesBetween(bill, rebuildFrom, now);
	for (const cycle of seedCycles) {
		await db.insert(billCycles).values({
			billId: bill.id,
			startDate: cycle.startDate,
			endDate: cycle.endDate,
			dueDate: cycle.dueDate,
			expectedAmount: bill.amount,
			totalPaid: 0,
			isPaid: false
		});
	}

	const getOrCreateCycleId = async (startDate: Date, endDate: Date, dueDate: Date): Promise<number> => {
		const existing = await db
			.select({ id: billCycles.id })
			.from(billCycles)
			.where(and(eq(billCycles.billId, bill.id), eq(billCycles.startDate, startDate)))
			.limit(1);

		if (existing.length > 0) return existing[0].id;

		const inserted = await db
			.insert(billCycles)
			.values({
				billId: bill.id,
				startDate,
				endDate,
				dueDate,
				expectedAmount: bill.amount,
				totalPaid: 0,
				isPaid: false
			})
			.returning({ id: billCycles.id });

		return inserted[0].id;
	};

	for (const payment of paymentsSnapshot) {
		const cycleDates = findCycleForPaymentDate(bill, payment.paymentDate);
		const targetCycleId = await getOrCreateCycleId(
			cycleDates.startDate,
			cycleDates.endDate,
			cycleDates.dueDate
		);

		await db.insert(billPayments).values({
			billId: payment.billId,
			cycleId: targetCycleId,
			amount: payment.amount,
			paymentDate: payment.paymentDate,
			notes: payment.notes
		});
	}

	await recalculateCyclesFrom(bill, rebuildFrom);

	const focusCycle = await getFocusCycleForBill(bill.id);
	const isPaid = focusCycle
		? bill.isVariable
			? focusCycle.totalPaid > 0 || focusCycle.isPaid
			: focusCycle.isPaid || focusCycle.totalPaid >= focusCycle.expectedAmount
		: false;

	updateBill(bill.id, { isPaid });
}

/**
 * Get all payments for a bill
 */
export async function getPaymentsForBill(billId: number): Promise<BillPayment[]> {
	return db
		.select()
		.from(billPayments)
		.where(eq(billPayments.billId, billId))
		.orderBy(desc(billPayments.paymentDate));
}

/**
 * Get all payments for a cycle
 */
export async function getPaymentsForCycle(cycleId: number): Promise<BillPayment[]> {
	return db
		.select()
		.from(billPayments)
		.where(eq(billPayments.cycleId, cycleId))
		.orderBy(desc(billPayments.paymentDate));
}

/**
 * Recalculate all cycles from a starting date forward
 */
async function recalculateCyclesFrom(bill: Bill, startDate: Date): Promise<void> {
	// Get all cycles from the start date forward
	const startTimestamp = Math.floor(startDate.getTime() / 1000);
	const cycles = await db
		.select()
		.from(billCycles)
		.where(
			and(
				eq(billCycles.billId, bill.id),
				sql`${billCycles.startDate} >= ${startTimestamp}`
			)
		)
		.orderBy(asc(billCycles.startDate));

	for (const cycle of cycles) {
		// Calculate total paid for this cycle
		const payments = await getPaymentsForCycle(cycle.id);
		const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

		// Determine if cycle is paid
		const isPaid = bill.isVariable ? totalPaid > 0 : totalPaid >= cycle.expectedAmount;

		// Update the cycle
		await db
			.update(billCycles)
			.set({
				totalPaid,
				isPaid,
				updatedAt: new Date()
			})
			.where(eq(billCycles.id, cycle.id));
	}
}
