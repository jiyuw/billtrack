<script lang="ts">
	import { Check, Loader2 } from 'lucide-svelte';
	import { invalidateAll } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/format';
	import { formatDateForInput, formatStoredDate, formatStoredDateForInput } from '$lib/utils/dates';

	type PaymentRow = {
		id: number;
		amount: number;
		paymentDate: Date;
		notification: {
			isNotified: boolean;
			notifiedOn: Date | null;
		} | null;
	};

	let { payment }: { payment: PaymentRow } = $props();

	let isNotified = $state(payment.notification?.isNotified ?? false);
	let notifiedOn = $state(
		payment.notification?.notifiedOn
			? formatStoredDateForInput(payment.notification.notifiedOn)
			: formatDateForInput(new Date())
	);
	let isSaving = $state(false);
	let error = $state('');

	async function saveNotification(nextIsNotified = isNotified, nextNotifiedOn = notifiedOn) {
		isSaving = true;
		error = '';

		try {
			const response = await fetch(`/api/rentals/payments/${payment.id}/notification`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					isNotified: nextIsNotified,
					notifiedOn: nextIsNotified ? nextNotifiedOn : null
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save notification');
			}

			await invalidateAll();
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Failed to save notification';
		} finally {
			isSaving = false;
		}
	}

	async function handleToggle() {
		isNotified = !isNotified;
		if (isNotified && !notifiedOn) {
			notifiedOn = formatDateForInput(new Date());
		}
		await saveNotification();
	}

	async function handleDateChange() {
		if (isNotified) {
			await saveNotification(true, notifiedOn);
		}
	}
</script>

<div class="grid gap-3 border-t border-gray-100 px-4 py-4 first:border-t-0 dark:border-gray-700 md:grid-cols-[1fr_auto_auto] md:items-center">
	<div>
		<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(payment.amount)}</p>
		<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatStoredDate(payment.paymentDate)}</p>
	</div>

	<label class="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
		<input
			type="checkbox"
			checked={isNotified}
			onchange={handleToggle}
			disabled={isSaving}
			class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
		/>
		<span class="inline-flex items-center gap-1">
			{#if isSaving}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else if isNotified}
				<Check class="h-4 w-4 text-emerald-600" />
			{/if}
			Notified
		</span>
	</label>

	<input
		type="date"
		bind:value={notifiedOn}
		onchange={handleDateChange}
		disabled={!isNotified || isSaving}
		class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
	/>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400 md:col-span-3">{error}</p>
	{/if}
</div>
