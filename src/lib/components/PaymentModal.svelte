<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { BillWithCategory } from '$lib/types/bill';
	import type { BillCycle, BillPayment } from '$lib/server/db/schema';
	import { format, endOfDay } from 'date-fns';
	import { formatDateForInput, formatStoredDate, formatStoredDateForInput } from '$lib/utils/dates';

	interface Props {
		isOpen: boolean;
		bill: BillWithCategory | null;
		cycles?: BillCycle[];
		focusCycleId?: number | null;
		existingPayment?: BillPayment | null;
		onConfirm: (data: {
			amount: number;
			paymentDate: string;
			cycleId: number | null;
			notes?: string;
		}) => Promise<void>;
		onCancel: () => void;
	}

	let {
		isOpen = $bindable(),
		bill,
		cycles = [],
		focusCycleId = null,
		existingPayment = null,
		onConfirm,
		onCancel
	}: Props = $props();

	let amount = $state(0);
	let isSubmitting = $state(false);
	let paymentDate = $state('');
	let notes = $state('');
	let availableCycles = $state<BillCycle[]>([]);
	let selectedCycleId = $state<number | null>(null);
	const isEditing = $derived(existingPayment !== null);

	function normalizeCycles(input: BillCycle[]): BillCycle[] {
		return input.map((cycle) => ({
			...cycle,
			startDate: cycle.startDate instanceof Date ? cycle.startDate : new Date(cycle.startDate),
			endDate: cycle.endDate instanceof Date ? cycle.endDate : new Date(cycle.endDate)
		}));
	}

	// Update amount when bill changes
	$effect(() => {
		if (!bill || !isOpen) return;

		if (existingPayment) {
			amount = existingPayment.amount;
			paymentDate = formatStoredDateForInput(existingPayment.paymentDate);
			notes = existingPayment.notes ?? '';
			selectedCycleId = existingPayment.cycleId;
			return;
		}

		amount = bill.amount;
		paymentDate = formatDateForInput(new Date());
		notes = '';
	});

	$effect(() => {
		if (!isOpen || !bill) return;

		if (cycles.length > 0) {
			const normalized = normalizeCycles(cycles);
			availableCycles = normalized;
			selectedCycleId = focusCycleId ?? normalized[0]?.id ?? null;
			return;
		}

		(async () => {
			try {
				const response = await fetch(`/api/bills/${bill.id}/cycles`);
				if (!response.ok) return;
				const data = (await response.json()) as BillCycle[];
				const normalized = normalizeCycles(data);
				availableCycles = normalized;

				const todayEnd = endOfDay(new Date());
				const unpaidPast = normalized
					.filter((cycle) => cycle.endDate <= todayEnd && !cycle.isPaid)
					.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
				const current = normalized.find(
					(cycle) => cycle.startDate <= todayEnd && cycle.endDate >= todayEnd
				);

				selectedCycleId =
					focusCycleId ?? unpaidPast?.id ?? current?.id ?? normalized[0]?.id ?? null;
			} catch (error) {
				console.error('Failed to load cycles', error);
			}
		})();
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		isSubmitting = true;

		try {
			await onConfirm({
				amount: parseFloat(amount.toString()),
				paymentDate,
				cycleId: selectedCycleId,
				notes: notes.trim() || undefined
			});
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if bill}
	<Modal bind:isOpen onClose={onCancel} title={isEditing ? 'Edit Payment' : 'Confirm Payment'}>
		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				{#if availableCycles.length > 0}
					<label for="paymentCycle" class="block text-sm font-medium text-gray-700 mb-1">
						{isEditing ? 'Payment Cycle' : 'Apply To Cycle'} <span class="text-red-500">*</span>
					</label>
					<select
						id="paymentCycle"
						bind:value={selectedCycleId}
						required
						class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-4"
					>
						{#each availableCycles as cycle}
							<option value={cycle.id}>
								{formatStoredDate(cycle.startDate)} – {format(cycle.endDate, 'MMM d, yyyy')}
								{cycle.isPaid ? ' (Paid)' : ''}
							</option>
						{/each}
					</select>
				{/if}

				<p class="text-sm text-gray-600 mb-4">
					{#if isEditing}
						Update the recorded payment for <span class="font-semibold text-gray-900">{bill.name}</span>.
					{:else}
						You're marking <span class="font-semibold text-gray-900">{bill.name}</span> as paid.
					{/if}
				</p>

				<label for="paymentAmount" class="block text-sm font-medium text-gray-700 mb-1">
					Payment Amount <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<span class="text-gray-500">$</span>
					</div>
					<input
						type="number"
						id="paymentAmount"
						bind:value={amount}
						required
						min="0"
						step="0.01"
						class="block w-full rounded-md border-gray-300 pl-7 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						placeholder="0.00"
					/>
				</div>
				<p class="mt-1 text-xs text-gray-500">
					Original bill amount: ${bill.amount.toFixed(2)}
				</p>
			</div>

			<div>
				<label for="paymentDate" class="block text-sm font-medium text-gray-700 mb-1">
					Payment Date <span class="text-red-500">*</span>
				</label>
				<input
					type="date"
					id="paymentDate"
					bind:value={paymentDate}
					required
					class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="paymentNotes" class="block text-sm font-medium text-gray-700 mb-1">
					Notes
				</label>
				<textarea
					id="paymentNotes"
					bind:value={notes}
					rows="3"
					class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					placeholder="Optional note about this payment"
				></textarea>
			</div>

			<!-- Actions -->
			<div class="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
				<Button
					variant="secondary"
					size="md"
					onclick={onCancel}
					disabled={isSubmitting}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="primary"
					size="md"
					disabled={isSubmitting}
				>
					{#if isSubmitting}
						{isEditing ? 'Saving...' : 'Confirming...'}
					{:else}
						{isEditing ? 'Save Payment' : 'Confirm Payment'}
					{/if}
				</Button>
			</div>
		</form>
	</Modal>
{/if}
