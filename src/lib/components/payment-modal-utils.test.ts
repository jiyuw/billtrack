import test from 'node:test';
import assert from 'node:assert/strict';

const { getInitialSelectedCycleId, normalizePaymentCycles } = await import(
	new URL('./payment-modal-utils.ts', import.meta.url).href
);

const janCycle = {
	id: 10,
	startDate: new Date('2026-01-01T00:00:00.000Z'),
	endDate: new Date('2026-01-31T00:00:00.000Z'),
	dueDate: new Date('2026-01-31T00:00:00.000Z'),
	isPaid: true,
	totalPaid: 100
};

const febCycle = {
	id: 20,
	startDate: new Date('2026-02-01T00:00:00.000Z'),
	endDate: new Date('2026-02-28T00:00:00.000Z'),
	dueDate: new Date('2026-02-28T00:00:00.000Z'),
	isPaid: false,
	totalPaid: 0
};

test('editing a payment keeps its original cycle selection', () => {
	const cycles = normalizePaymentCycles([janCycle, febCycle]);

	const selectedCycleId = getInitialSelectedCycleId({
		cycles,
		existingPaymentCycleId: janCycle.id,
		today: new Date('2026-02-15T00:00:00.000Z')
	});

	assert.equal(selectedCycleId, janCycle.id);
});

test('new payments still prefer the oldest unpaid past cycle', () => {
	const cycles = normalizePaymentCycles([janCycle, febCycle]);

	const selectedCycleId = getInitialSelectedCycleId({
		cycles,
		today: new Date('2026-03-02T00:00:00.000Z')
	});

	assert.equal(selectedCycleId, febCycle.id);
});
