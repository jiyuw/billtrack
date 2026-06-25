<script lang="ts">
	import { ReceiptText } from 'lucide-svelte';
	import { formatCurrency } from '$lib/utils/format';
	import PaymentNotificationRow from './PaymentNotificationRow.svelte';

	type RentalPayment = {
		id: number;
		amount: number;
		paymentDate: Date;
		notification: {
			isNotified: boolean;
			notifiedOn: Date | null;
		} | null;
	};

	type RentalBill = {
		id: number;
		name: string;
		amount: number;
		payments: RentalPayment[];
	};

	let { bill }: { bill: RentalBill } = $props();
</script>

<section class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
	<div class="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex min-w-0 items-center gap-3">
			<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
				<ReceiptText class="h-5 w-5" />
			</span>
			<div class="min-w-0">
				<h2 class="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{bill.name}</h2>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{formatCurrency(bill.amount)}</p>
			</div>
		</div>
		<span class="text-sm text-gray-500 dark:text-gray-400">{bill.payments.length} recent payments</span>
	</div>

	{#if bill.payments.length === 0}
		<div class="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">No payments yet.</div>
	{:else}
		<div>
			{#each bill.payments as payment (payment.id)}
				<PaymentNotificationRow {payment} />
			{/each}
		</div>
	{/if}
</section>
