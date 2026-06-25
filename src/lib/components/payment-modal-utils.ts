import { endOfDay } from 'date-fns';

type CycleLike = {
	id: number;
	startDate: Date | string | number;
	endDate: Date | string | number;
	dueDate?: Date | string | number | null;
	isPaid: boolean;
	totalPaid: number;
};

type NormalizedCycle<T extends CycleLike> = Omit<T, 'startDate' | 'endDate' | 'dueDate'> & {
	startDate: Date;
	endDate: Date;
	dueDate: Date | null;
};

function normalizeCycleDate(value: Date | string | number | null | undefined): Date | null {
	if (value === null || value === undefined) return null;
	return value instanceof Date ? value : new Date(value);
}

export function normalizePaymentCycles<T extends CycleLike>(input: T[]): Array<NormalizedCycle<T>> {
	const normalized = input.map((cycle) => ({
		...cycle,
		startDate: normalizeCycleDate(cycle.startDate) ?? new Date(cycle.startDate),
		endDate: normalizeCycleDate(cycle.endDate) ?? new Date(cycle.endDate),
		dueDate: normalizeCycleDate(cycle.dueDate)
	}));

	const groups = new Map<string, Array<NormalizedCycle<T>>>();
	for (const cycle of normalized) {
		const dueDate = cycle.dueDate ?? cycle.endDate;
		const key = [cycle.startDate.getTime(), cycle.endDate.getTime(), dueDate.getTime()].join(':');

		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key)?.push(cycle);
	}

	return [...groups.values()].map((group) =>
		[...group].sort((a, b) => {
			if (a.isPaid !== b.isPaid) return Number(b.isPaid) - Number(a.isPaid);
			if (a.totalPaid !== b.totalPaid) return b.totalPaid - a.totalPaid;
			return a.id - b.id;
		})[0]
	);
}

export function getInitialSelectedCycleId<T extends CycleLike>(params: {
	cycles: Array<NormalizedCycle<T>>;
	focusCycleId?: number | null;
	existingPaymentCycleId?: number | null;
	today?: Date;
}): number | null {
	const { cycles, focusCycleId = null, existingPaymentCycleId = null, today = new Date() } = params;

	if (existingPaymentCycleId !== null) {
		const matchingCycle = cycles.find((cycle) => cycle.id === existingPaymentCycleId);
		if (matchingCycle) return matchingCycle.id;
	}

	const todayEnd = endOfDay(today);
	const unpaidPast = cycles
		.filter((cycle) => cycle.endDate <= todayEnd && !cycle.isPaid)
		.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
	const current = cycles.find((cycle) => cycle.startDate <= todayEnd && cycle.endDate >= todayEnd);

	return focusCycleId ?? unpaidPast?.id ?? current?.id ?? cycles[0]?.id ?? null;
}
