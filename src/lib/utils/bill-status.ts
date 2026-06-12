import { differenceInDays, endOfDay, isPast } from 'date-fns';

export type BillStatusKey =
	| 'paid'
	| 'partial'
	| 'overdue'
	| 'upcoming'
	| 'pending'
	| 'recurring'
	| 'one-time'
	| 'autopay'
	| 'manual'
	| 'variable'
	| 'fixed';

export function getDueStatus(dueDate: Date, isPaid: boolean): BillStatusKey {
	const dueAt = endOfDay(dueDate);

	if (isPaid) return 'paid';
	if (isPast(dueAt)) return 'overdue';

	const daysUntilDue = differenceInDays(dueAt, new Date());
	if (daysUntilDue <= 7) return 'upcoming';

	return 'pending';
}

export function getCyclePaymentStatus({
	isVariable,
	isPaid,
	totalPaid,
	expectedAmount,
	dueDate
}: {
	isVariable: boolean;
	isPaid: boolean;
	totalPaid: number;
	expectedAmount: number;
	dueDate?: Date | null;
}): BillStatusKey {
	if (isVariable) {
		if (totalPaid > 0 || isPaid) return 'paid';
		if (dueDate) return getDueStatus(dueDate, false);
		return 'pending';
	}

	if (isPaid || totalPaid >= expectedAmount) return 'paid';
	if (totalPaid > 0) return 'partial';
	if (dueDate) return getDueStatus(dueDate, false);
	return 'pending';
}

export function getProgressBarClass(status: BillStatusKey) {
	if (status === 'paid') return 'bg-green-500';
	if (status === 'partial') return 'bg-amber-500';
	return 'bg-gray-300 dark:bg-gray-600';
}
