<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/format';
	import { getRecurrenceDescription } from '$lib/utils/recurrence';
	import { getAssetTagBannerStyle } from '$lib/utils/asset-tag-banner';
	import { format } from 'date-fns';
	import {
		ArrowLeft,
		ArrowDownRight,
		ArrowUpRight,
		Calendar,
		DollarSign,
		TrendingUp,
		Info,
		Home,
		Car,
		Zap,
		ShieldCheck,
		Receipt,
		ShoppingCart,
		Fuel,
		Utensils,
		Coffee,
		Popcorn,
		Dumbbell,
		Gamepad2,
		Smartphone,
		Shirt,
		Dog,
		Heart
	} from 'lucide-svelte';
	import StatusIndicator from '$lib/components/StatusIndicator.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import BillForm from '$lib/components/BillForm.svelte';
	import PaymentModal from '$lib/components/PaymentModal.svelte';
	import type { BillPayment } from '$lib/server/db/schema';

	let { data }: { data: PageData } = $props();

	const bill = $derived(data.bill);
	const currentCycle = $derived(bill.currentCycle);
	const focusCycle = $derived(bill.focusCycle ?? bill.currentCycle);
	const cycles = $derived(data.cycles);
	const payments = $derived(data.payments);
	const displayCycles = $derived.by(() => cycles.filter((cycle) => cycle.totalPaid > 0));
	const historyStats = $derived.by(() => {
		if (displayCycles.length === 0) return null;
		const values = displayCycles.map((cycle) => cycle.totalPaid);
		const total = values.reduce((sum, value) => sum + value, 0);
		const average = total / values.length;
		const min = Math.min(...values);
		const max = Math.max(...values);
		const lastAmount = values[values.length - 1];
		return { count: values.length, average, min, max, lastAmount };
	});
	const historyCycles = $derived.by(() =>
		[...displayCycles]
			.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
			.slice(-10)
	);

	const historyHighlights = $derived.by(() => {
		if (historyCycles.length === 0) {
			return { minAmount: 0, maxAmount: 0, minCycleId: null, maxCycleId: null };
		}

		let minCycle = historyCycles[0];
		let maxCycle = historyCycles[0];

		for (const cycle of historyCycles) {
			if (cycle.totalPaid < minCycle.totalPaid) minCycle = cycle;
			if (cycle.totalPaid > maxCycle.totalPaid) maxCycle = cycle;
		}

		return {
			minAmount: minCycle.totalPaid,
			maxAmount: maxCycle.totalPaid,
			minCycleId: minCycle.id,
			maxCycleId: maxCycle.id
		};
	});

	const historyCards = $derived.by(() => {
		const { minAmount, maxAmount, minCycleId, maxCycleId } = historyHighlights;
		const range = Math.max(maxAmount - minAmount, 1);

		return historyCycles.map((cycle, index) => {
			const previous = index > 0 ? historyCycles[index - 1] : null;
			const delta = previous ? cycle.totalPaid - previous.totalPaid : 0;
			const isLowest = cycle.id === minCycleId;
			const isHighest = cycle.id === maxCycleId;
			const toneStyle =
				isLowest
					? 'background-color: color-mix(in srgb, white 72%, rgb(16 185 129) 28%); border-color: color-mix(in srgb, white 60%, rgb(16 185 129) 40%);'
					: isHighest
						? 'background-color: color-mix(in srgb, white 72%, rgb(244 63 94) 28%); border-color: color-mix(in srgb, white 60%, rgb(244 63 94) 40%);'
						: 'background-color: rgb(255 255 255); border-color: rgb(229 231 235);';

			return {
				...cycle,
				delta,
				isLowest,
				isHighest,
				toneStyle,
				amountClass:
					isLowest
						? 'text-emerald-700'
						: isHighest
							? 'text-rose-700'
							: 'text-gray-900'
			};
		});
	});

	const AssetIcon = $derived.by(() => {
		if (bill.assetTag?.type === 'house') return Home;
		if (bill.assetTag?.type === 'vehicle') return Car;
		return null;
	});

	const CategoryIcon = $derived.by(() => {
		const iconMap = {
			utility: Zap,
			insurance: ShieldCheck,
			mortgage: Home,
			fee: Receipt,
			'shopping-cart': ShoppingCart,
			fuel: Fuel,
			utensils: Utensils,
			coffee: Coffee,
			popcorn: Popcorn,
			dumbbell: Dumbbell,
			gamepad: Gamepad2,
			smartphone: Smartphone,
			shirt: Shirt,
			home: Home,
			dog: Dog,
			heart: Heart
		};
		if (!bill.category?.icon) return null;
		return iconMap[bill.category.icon as keyof typeof iconMap] || null;
	});

	// Group payments by cycle
	const paymentsByCycle = $derived.by(() => payments.reduce((acc, payment) => {
		if (!acc[payment.cycleId]) {
			acc[payment.cycleId] = [];
		}
		acc[payment.cycleId].push(payment);
		return acc;
	}, {} as Record<number, typeof payments>));

	function getCycleName(cycle: typeof cycles[0]) {
		const start = format(cycle.startDate, 'MMM d, yyyy');
		const end = format(cycle.endDate, 'MMM d, yyyy');
		return `${start} - ${end}`;
	}

	function getProgressPercentage(totalPaid: number, expectedAmount: number) {
		return expectedAmount > 0 ? Math.min((totalPaid / expectedAmount) * 100, 100) : 0;
	}

	function getStatusColor(isPaid: boolean, totalPaid: number, expectedAmount: number) {
		if (isPaid || totalPaid >= expectedAmount) return 'bg-green-500';
		if (totalPaid > 0) return 'bg-yellow-500';
		return 'bg-gray-300 dark:bg-gray-600';
	}

	const isCyclePaid = $derived.by(() => {
		const cycle = focusCycle ?? currentCycle;
		if (!cycle) return false;
		if (bill.isVariable) {
			return cycle.totalPaid > 0 || cycle.isPaid;
		}
		return cycle.isPaid || cycle.totalPaid >= cycle.expectedAmount;
	});

	let showEditModal = $state(false);
	let showPaymentModal = $state(false);
	let editingPayment = $state<BillPayment | null>(null);
	let historyScrollContainer = $state<HTMLDivElement | null>(null);
	let canScrollHistoryLeft = $state(false);
	let canScrollHistoryRight = $state(false);

	function updateHistoryScrollHints() {
		if (!historyScrollContainer) {
			canScrollHistoryLeft = false;
			canScrollHistoryRight = false;
			return;
		}

		const { scrollLeft, scrollWidth, clientWidth } = historyScrollContainer;
		canScrollHistoryLeft = scrollLeft > 8;
		canScrollHistoryRight = scrollLeft + clientWidth < scrollWidth - 8;
	}

	$effect(() => {
		historyCards.length;
		queueMicrotask(() => {
			updateHistoryScrollHints();
		});
	});

	async function handleTogglePaid() {
		if (!isCyclePaid) {
			showPaymentModal = true;
			return;
		}
		try {
			const response = await fetch(`/api/bills/${bill.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isPaid: false })
			});
			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error toggling bill status:', error);
		}
	}

	async function handleConfirmPayment(data: {
		amount: number;
		paymentDate: string;
		cycleId: number | null;
		notes?: string;
	}) {
		try {
			const response = await fetch(`/api/bills/${bill.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					isPaid: true,
					paymentAmount: data.amount,
					paymentDate: data.paymentDate,
					paymentCycleId: data.cycleId,
					paymentNotes: data.notes
				})
			});
			if (response.ok) {
				showPaymentModal = false;
				editingPayment = null;
				await invalidateAll();
			} else {
				alert('Failed to record payment. Please try again.');
			}
		} catch (error) {
			console.error('Error recording payment:', error);
			alert('Failed to record payment. Please try again.');
		}
	}

	function handleCancelPayment() {
		showPaymentModal = false;
		editingPayment = null;
	}

	function handleEditPayment(payment: BillPayment) {
		editingPayment = payment;
		showPaymentModal = true;
	}

	async function handleUpdatePayment(data: {
		amount: number;
		paymentDate: string;
		cycleId: number | null;
		notes?: string;
	}) {
		if (!editingPayment) return;

		try {
			const response = await fetch(`/api/payments/${editingPayment.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (response.ok) {
				showPaymentModal = false;
				editingPayment = null;
				await invalidateAll();
			} else {
				alert('Failed to update payment. Please try again.');
			}
		} catch (error) {
			console.error('Error updating payment:', error);
			alert('Failed to update payment. Please try again.');
		}
	}

	async function handleDelete() {
		if (!confirm('Are you sure you want to delete this bill?')) return;
		try {
			const response = await fetch(`/api/bills/${bill.id}`, {
				method: 'DELETE'
			});
			if (response.ok) {
				goto('/');
			}
		} catch (error) {
			console.error('Error deleting bill:', error);
		}
	}

	async function handleUpdateBill(billData: any) {
		try {
			const response = await fetch(`/api/bills/${bill.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(billData)
			});
			if (response.ok) {
				showEditModal = false;
				await invalidateAll();
			} else {
				alert('Failed to update bill. Please try again.');
			}
		} catch (error) {
			console.error('Error updating bill:', error);
			alert('Failed to update bill. Please try again.');
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<!-- Header -->
	<div class="mb-6">
		<button
			onclick={() => goto('/')}
			class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4 cursor-pointer"
		>
			<ArrowLeft class="w-4 h-4" />
			Back to Bills
		</button>

		<div class="flex items-start justify-between gap-4">
			<div class="flex-1">
				<div class="flex flex-wrap items-center gap-3">
					<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">{bill.name}</h1>
					<StatusIndicator
						dueDate={(focusCycle ?? bill.currentCycle)?.dueDate ?? (focusCycle ?? bill.currentCycle)?.endDate ?? bill.dueDate}
						isPaid={isCyclePaid}
					/>
				</div>
				<p class="text-gray-600 dark:text-gray-400 mt-1">
					{#if bill.isRecurring}
						Recurring {getRecurrenceDescription(bill.recurrenceInterval ?? 1, bill.recurrenceUnit ?? 'month', bill.recurrenceDay)} • Due {format((focusCycle ?? bill.currentCycle)?.dueDate ?? (focusCycle ?? bill.currentCycle)?.endDate ?? bill.dueDate, 'MMM d, yyyy')}
					{:else}
						One-time bill • Due {format((focusCycle ?? bill.currentCycle)?.dueDate ?? (focusCycle ?? bill.currentCycle)?.endDate ?? bill.dueDate, 'MMM d, yyyy')}
					{/if}
				</p>
				{#if bill.notes}
					<div class="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-300/70 bg-slate-100 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-200">
						<Info size={14} class="shrink-0" />
						<p class="italic whitespace-pre-wrap break-words">{bill.notes}</p>
					</div>
				{/if}
				<div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
					<div class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
						<p class="text-xs text-gray-500 dark:text-gray-400">Autopay</p>
						<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
							{#if bill.isAutopay}
								On
								{#if bill.paymentMethod}
									<span class="text-xs text-gray-500 dark:text-gray-400">
										• {bill.paymentMethod.nickname} •••• {bill.paymentMethod.lastFour}
									</span>
								{/if}
							{:else}
								Off
							{/if}
						</p>
					</div>

					<div class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
						<p class="text-xs text-gray-500 dark:text-gray-400">Category</p>
						{#if bill.category}
							<div class="mt-1 flex items-center gap-2">
									{#if CategoryIcon}
										<CategoryIcon size={16} style="color: {bill.category.color}" />
									{:else if bill.category.icon}
										<span class="text-sm" style="color: {bill.category.color}">{bill.category.icon}</span>
									{/if}
								<p class="text-sm font-medium" style="color: {bill.category.color}">
									{bill.category.name}
								</p>
							</div>
						{:else}
							<p class="text-sm font-medium text-gray-900 dark:text-gray-100">Uncategorized</p>
						{/if}
					</div>

					<div class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
						<p class="text-xs text-gray-500 dark:text-gray-400">Asset Tag</p>
						{#if bill.assetTag}
							<div
								class="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-white"
								style={getAssetTagBannerStyle(bill.assetTag.color, bill.assetTag.bannerPattern)}
							>
								{#if AssetIcon}
									<AssetIcon size={14} />
								{:else}
									<Info size={14} />
								{/if}
								<p class="truncate">{bill.assetTag.name}</p>
							</div>
						{:else}
							<p class="text-sm font-medium text-gray-900 dark:text-gray-100">None</p>
						{/if}
					</div>
				</div>
			</div>
			<div class="flex items-center gap-3">
				<button
					onclick={handleTogglePaid}
					class="rounded-md p-2 min-h-9 min-w-9 transition-all text-gray-500 hover:bg-gray-100 hover:text-gray-700 hover:scale-105 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300 cursor-pointer"
					title={isCyclePaid ? 'Paid' : 'Mark as paid'}
				>
					{#if isCyclePaid}
						<svg
							class="h-6 w-6"
							viewBox="0 0 20 20"
							xmlns="http://www.w3.org/2000/svg"
							aria-hidden="true"
						>
							<circle cx="10" cy="10" r="8" fill="#16a34a" />
							<path
								d="M6.5 10.5l2 2 5-5"
								fill="none"
								stroke="#ffffff"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{:else}
						<svg
							class="h-6 w-6"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					{/if}
				</button>

				{#if bill.paymentLink}
					<a
						href={bill.paymentLink}
						target="_blank"
						rel="noopener noreferrer"
						class="rounded-md p-2 min-h-9 min-w-9 flex items-center justify-center text-gray-500 transition-all hover:bg-blue-50 hover:text-blue-600 hover:scale-105 dark:text-gray-400 dark:hover:bg-blue-950 dark:hover:text-blue-400 cursor-pointer"
						title="Pay bill"
					>
						<svg
							class="h-6 w-6"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/>
						</svg>
					</a>
				{/if}

				<button
					onclick={() => (showEditModal = true)}
					class="rounded-md p-2 min-h-9 min-w-9 text-gray-500 transition-all hover:bg-blue-50 hover:text-blue-600 hover:scale-105 dark:text-gray-400 dark:hover:bg-blue-950 dark:hover:text-blue-400 cursor-pointer"
					title="Edit bill"
				>
					<svg
						class="h-6 w-6"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
						/>
					</svg>
				</button>

				<button
					onclick={handleDelete}
					class="rounded-md p-2 min-h-9 min-w-9 text-gray-500 transition-all hover:bg-red-50 hover:text-red-600 hover:scale-105 dark:text-gray-400 dark:hover:bg-red-950 dark:hover:text-red-400 cursor-pointer"
					title="Delete bill"
				>
					<svg
						class="h-6 w-6"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						/>
					</svg>
				</button>
			</div>
		</div>
	</div>

	<!-- Current Cycle Card -->
	{#if focusCycle}
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
			<div class="flex items-center gap-2 mb-4">
				<Calendar class="w-5 h-5 text-blue-600 dark:text-blue-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Current Cycle</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Period</p>
					<p class="text-lg font-medium text-gray-900 dark:text-gray-100">
						{format(focusCycle.startDate, 'MMM d')} - {format(focusCycle.endDate, 'MMM d, yyyy')}
					</p>
				</div>
				<div>
					<p class="text-sm text-gray-600 dark:text-gray-400">Total Paid</p>
					<p class="text-lg font-medium text-gray-900 dark:text-gray-100">
						{bill.isVariable && focusCycle.totalPaid === 0
							? 'Unpaid'
							: formatCurrency(focusCycle.totalPaid)}
					</p>
				</div>
				{#if !bill.isVariable}
					<div>
						<p class="text-sm text-gray-600 dark:text-gray-400">Expected Amount</p>
						<p class="text-lg font-medium text-gray-900 dark:text-gray-100">
							{formatCurrency(focusCycle.expectedAmount)}
						</p>
					</div>
				{/if}
			</div>

			{#if !bill.isVariable}
				<!-- Progress Bar -->
				<div class="mb-2">
					<div class="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
						<span>Progress</span>
						<span>{focusCycle.percentPaid.toFixed(0)}%</span>
					</div>
					<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
						<div
							class="h-3 rounded-full transition-all {getStatusColor(
								focusCycle.isPaid,
								focusCycle.totalPaid,
								focusCycle.expectedAmount
							)}"
							style="width: {focusCycle.percentPaid}%"
						></div>
					</div>
				</div>
			{/if}

			<!-- Current Cycle Payments -->
			{#if paymentsByCycle[focusCycle.id]?.length > 0}
				<div class="mt-4">
					<h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
						Payments This Cycle
					</h3>
					<div class="space-y-2">
						{#each paymentsByCycle[focusCycle.id] as payment}
							<div
								class="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700 rounded"
							>
								<div class="flex items-center gap-3">
									<DollarSign class="w-4 h-4 text-green-600 dark:text-green-400" />
									<div>
										<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
											{formatCurrency(payment.amount)}
										</p>
										{#if payment.notes}
											<p class="text-xs text-gray-600 dark:text-gray-400">{payment.notes}</p>
										{/if}
									</div>
								</div>
								<div class="flex items-center gap-3">
									<p class="text-sm text-gray-600 dark:text-gray-400">
										{format(payment.paymentDate, 'MMM d, yyyy')}
									</p>
									<button
										type="button"
										onclick={() => handleEditPayment(payment)}
										class="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
									>
										Edit
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
			<p class="text-sm text-yellow-800 dark:text-yellow-200">
				No current billing cycle. Cycles will be generated automatically when payments are recorded.
			</p>
		</div>
	{/if}

	<!-- Cycle History -->
	{#if displayCycles.length > 0}
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
			<div class="flex items-center gap-2 mb-4">
				<TrendingUp class="w-5 h-5 text-purple-600 dark:text-purple-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Payment History</h2>
			</div>

			{#if bill.isVariable && historyStats}
				<div class="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
					<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
						<p class="text-xs text-gray-500 dark:text-gray-400">Avg</p>
						<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(historyStats.average)}</p>
					</div>
					<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
						<p class="text-xs text-gray-500 dark:text-gray-400">Min</p>
						<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(historyStats.min)}</p>
					</div>
					<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
						<p class="text-xs text-gray-500 dark:text-gray-400">Max</p>
						<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(historyStats.max)}</p>
					</div>
					<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
						<p class="text-xs text-gray-500 dark:text-gray-400">Last</p>
						<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(historyStats.lastAmount)}</p>
					</div>
					<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
						<p class="text-xs text-gray-500 dark:text-gray-400">Cycles</p>
						<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">{historyStats.count}</p>
					</div>
				</div>
			{/if}

			{#if historyCards.length > 0}
				<div class="mb-6">
					<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Recent {historyCards.length} cycles
						</p>
						<div class="flex flex-wrap items-center gap-3 text-xs">
							<div class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
								<ArrowDownRight class="h-3.5 w-3.5" />
								Lowest
							</div>
							<div class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
								<ArrowUpRight class="h-3.5 w-3.5" />
								Highest
							</div>
						</div>
					</div>

					<div class="relative overflow-hidden rounded-3xl">
						{#if canScrollHistoryLeft}
							<div class="pointer-events-none absolute left-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-gray-600 shadow-sm dark:bg-gray-900/90 dark:text-gray-300">
								← More
							</div>
						{/if}
						{#if canScrollHistoryRight}
							<div class="pointer-events-none absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-gray-600 shadow-sm dark:bg-gray-900/90 dark:text-gray-300">
								More →
							</div>
						{/if}
						<div
							bind:this={historyScrollContainer}
							onscroll={updateHistoryScrollHints}
							class="overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						>
							<div class="mx-auto flex w-max min-w-full justify-center gap-3 py-1">
								{#each historyCards as cycle}
									<div
										class="w-[204px] shrink-0 rounded-2xl border p-4 shadow-sm transition-colors"
										style={cycle.toneStyle}
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p class="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
													Cycle
												</p>
												<div class="mt-1 space-y-1">
													<p class="text-sm font-semibold text-gray-900">
														{format(cycle.startDate, 'MMM d, yyyy')}
													</p>
													<p class="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
														through
													</p>
													<p class="text-sm font-semibold text-gray-900">
														{format(cycle.endDate, 'MMM d, yyyy')}
													</p>
												</div>
											</div>

											<div class="flex flex-col items-end gap-1">
												{#if cycle.isLowest}
													<div
														class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
														title="Lowest payment"
													>
														<ArrowDownRight class="h-3.5 w-3.5" />
													</div>
												{:else if cycle.isHighest}
													<div
														class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700"
														title="Highest payment"
													>
														<ArrowUpRight class="h-3.5 w-3.5" />
													</div>
												{/if}
											</div>
										</div>

										<div class="mt-5">
											<div>
												<p class="text-xs text-gray-500">Paid</p>
												<p class={`text-2xl font-bold ${cycle.amountClass}`}>
													{formatCurrency(cycle.totalPaid)}
												</p>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{/if}

			<div class="space-y-4">
				{#each displayCycles as cycle}
					<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
						<div class="flex items-center justify-between mb-3">
							<div>
								<h3 class="font-medium text-gray-900 dark:text-gray-100">
									{getCycleName(cycle)}
								</h3>
								{#if !bill.isVariable}
									<p class="text-sm text-gray-600 dark:text-gray-400">
										Expected: {formatCurrency(cycle.expectedAmount)}
									</p>
								{/if}
							</div>
							<div class="text-right">
								<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
									{formatCurrency(cycle.totalPaid)}
								</p>
								{#if cycle.isPaid}
									<span class="text-xs text-green-600 dark:text-green-400 font-medium">Paid</span>
								{:else if cycle.totalPaid > 0}
									<span class="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
										Partial ({getProgressPercentage(cycle.totalPaid, cycle.expectedAmount).toFixed(0)}%)
									</span>
								{:else}
									<span class="text-xs text-gray-500 dark:text-gray-400">Unpaid</span>
								{/if}
							</div>
						</div>

						<!-- Payments in this cycle -->
						{#if paymentsByCycle[cycle.id]?.length > 0}
							<div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
								<div class="space-y-1">
									{#each paymentsByCycle[cycle.id] as payment}
										<div class="flex items-center justify-between gap-3 text-sm">
											<span class="min-w-0 text-gray-600 dark:text-gray-400">
												{format(payment.paymentDate, 'MMM d, yyyy')}
												{#if payment.notes}
													<span class="text-xs">• {payment.notes}</span>
												{/if}
											</span>
											<div class="flex items-center gap-3 shrink-0">
												<span class="font-medium text-gray-900 dark:text-gray-100">
													{formatCurrency(payment.amount)}
												</span>
												<button
													type="button"
													onclick={() => handleEditPayment(payment)}
													class="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
												>
													Edit
												</button>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
			<p class="text-gray-600 dark:text-gray-400">No payment history yet</p>
		</div>
	{/if}
</div>

<!-- Edit Bill Modal -->
{#if showEditModal}
	<Modal bind:isOpen={showEditModal} onClose={() => (showEditModal = false)} title="Edit Bill">
		<BillForm
			categories={data.categories}
			assetTags={data.assetTags}
			paymentMethods={data.paymentMethods}
			initialData={{
				name: bill.name,
				amount: bill.amount,
				dueDate: bill.focusCycle?.dueDate ?? bill.currentCycle?.dueDate ?? bill.dueDate,
				cycleStartDate: bill.focusCycle?.startDate ?? bill.currentCycle?.startDate ?? bill.cycleStartDate ?? bill.dueDate,
				cycleEndDate: bill.focusCycle?.endDate ?? bill.currentCycle?.endDate ?? bill.cycleEndDate ?? bill.dueDate,
				paymentLink: bill.paymentLink || undefined,
				categoryId: bill.categoryId,
				assetTagId: bill.assetTagId ?? undefined,
				isRecurring: bill.isRecurring,
				recurrenceInterval: bill.recurrenceInterval || undefined,
				recurrenceUnit: bill.recurrenceUnit || undefined,
				recurrenceDay: bill.recurrenceDay || undefined,
				isAutopay: bill.isAutopay,
				paymentMethodId: bill.paymentMethodId ?? undefined,
				isVariable: bill.isVariable,
				notes: bill.notes || undefined
			}}
			onSubmit={handleUpdateBill}
			onCancel={() => (showEditModal = false)}
			submitLabel="Update Bill"
			isEditing={true}
		/>
	</Modal>
{/if}

<!-- Payment Confirmation Modal -->
<PaymentModal
	bind:isOpen={showPaymentModal}
	bill={bill}
	cycles={cycles}
	focusCycleId={bill.focusCycle?.id ?? null}
	existingPayment={editingPayment}
	onConfirm={editingPayment ? handleUpdatePayment : handleConfirmPayment}
	onCancel={handleCancelPayment}
/>
