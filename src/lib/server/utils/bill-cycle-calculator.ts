import type { RecurrenceUnit } from '$lib/types/bill';
import type { Bill } from '../db/schema';
import {
	addDays,
	addWeeks,
	addMonths,
	addYears,
	startOfDay,
	endOfDay,
	isBefore,
	isAfter,
	isWithinInterval
} from 'date-fns';

export interface CycleDates {
	startDate: Date;
	endDate: Date;
	dueDate: Date;
}

function shiftDate(date: Date, recurrenceUnit: RecurrenceUnit, recurrenceInterval: number, direction = 1): Date {
	switch (recurrenceUnit) {
		case 'day':
			return addDays(date, recurrenceInterval * direction);
		case 'week':
			return addWeeks(date, recurrenceInterval * direction);
		case 'month':
			return addMonths(date, recurrenceInterval * direction);
		case 'year':
			return addYears(date, recurrenceInterval * direction);
	}
}

function getSingleCycleDates(bill: Bill): CycleDates {
	const dueDate = endOfDay(bill.dueDate);
	const cycleEndDate = bill.cycleEndDate ? endOfDay(bill.cycleEndDate) : dueDate;
	const fallbackStart = isAfter(startOfDay(bill.createdAt), startOfDay(cycleEndDate))
		? startOfDay(cycleEndDate)
		: startOfDay(bill.createdAt);
	const cycleStartDate = bill.cycleStartDate ? startOfDay(bill.cycleStartDate) : fallbackStart;

	return {
		startDate: cycleStartDate,
		endDate: cycleEndDate,
		dueDate
	};
}

function getAnchorCycleDates(bill: Bill): CycleDates {
	if (!bill.isRecurring || !bill.recurrenceUnit || !bill.recurrenceInterval) {
		return getSingleCycleDates(bill);
	}

	return {
		startDate: startOfDay(bill.cycleStartDate ?? bill.dueDate),
		endDate: endOfDay(bill.cycleEndDate ?? bill.dueDate),
		dueDate: endOfDay(bill.dueDate)
	};
}

function shiftCycle(cycle: CycleDates, recurrenceUnit: RecurrenceUnit, recurrenceInterval: number, direction = 1): CycleDates {
	return {
		startDate: shiftDate(cycle.startDate, recurrenceUnit, recurrenceInterval, direction),
		endDate: shiftDate(cycle.endDate, recurrenceUnit, recurrenceInterval, direction),
		dueDate: shiftDate(cycle.dueDate, recurrenceUnit, recurrenceInterval, direction)
	};
}

/**
 * Calculate the cycle dates for a bill based on recurrence pattern and due date.
 * For recurring bills, the stored cycle start/end/due dates act as the anchor cycle.
 */
export function calculateBillCycleDates(
	bill: Bill,
	referenceDate: Date = new Date()
): CycleDates {
	if (!bill.isRecurring || !bill.recurrenceUnit || !bill.recurrenceInterval) {
		return getSingleCycleDates(bill);
	}

	const ref = startOfDay(referenceDate);
	let cycle = getAnchorCycleDates(bill);

	while (isBefore(cycle.dueDate, ref)) {
		cycle = shiftCycle(cycle, bill.recurrenceUnit, bill.recurrenceInterval, 1);
	}

	while (isAfter(cycle.startDate, ref)) {
		cycle = shiftCycle(cycle, bill.recurrenceUnit, bill.recurrenceInterval, -1);
	}

	return cycle;
}

/**
 * Find which cycle a payment date belongs to.
 * Payments map into the cycle window between cycle start and cycle due date.
 */
export function findCycleForPaymentDate(
	bill: Bill,
	paymentDate: Date
): CycleDates {
	return calculateBillCycleDates(bill, paymentDate);
}

/**
 * Generate all cycles between two dates for a bill.
 */
export function generateBillCyclesBetween(
	bill: Bill,
	rangeStart: Date,
	rangeEnd: Date
): CycleDates[] {
	if (!bill.isRecurring || !bill.recurrenceUnit || !bill.recurrenceInterval) {
		return [getSingleCycleDates(bill)];
	}

	const cycles: CycleDates[] = [];
	let currentCycle = calculateBillCycleDates(bill, rangeStart);

	while (isBefore(currentCycle.startDate, rangeEnd) || currentCycle.startDate.getTime() === rangeEnd.getTime()) {
		cycles.push({ ...currentCycle });
		currentCycle = shiftCycle(currentCycle, bill.recurrenceUnit, bill.recurrenceInterval, 1);
	}

	return cycles;
}

/**
 * Check if a date is within a cycle window.
 */
export function isDateInCycle(
	date: Date,
	cycleStart: Date,
	cycleDueDate: Date
): boolean {
	return isWithinInterval(date, { start: cycleStart, end: cycleDueDate });
}
