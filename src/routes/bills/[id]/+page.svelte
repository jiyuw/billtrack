<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/format';
	import { getRecurrenceDescription } from '$lib/utils/recurrence';
	import { getAssetTagBannerStyle } from '$lib/utils/asset-tag-banner';
	import { format } from 'date-fns';
	import {
		ArrowLeft,
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
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import BillForm from '$lib/components/BillForm.svelte';
	import PaymentModal from '$lib/components/PaymentModal.svelte';
	import LineChart from '$lib/components/LineChart.svelte';
	import type { BillPayment } from '$lib/server/db/schema';
	import { getCyclePaymentStatus, getProgressBarClass } from '$lib/utils/bill-status';

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

	// Group payments by cycle
	const paymentsByCycle = $derived.by(() => payments.reduce((acc, payment) => {
		if (!acc[payment.cycleId]) {
			acc[payment.cycleId] = [];
		}
		acc[payment.cycleId].push(payment);
		return acc;
	}, {} as Record<number, typeof payments>));

	const historyChartPoints = $derived.by(() =>
		historyCycles.map((cycle, index) => {
			const cyclePayments = paymentsByCycle[cycle.id] ?? [];
			const paymentDates = cyclePayments.length > 0
				? cyclePayments
						.map((payment) => format(payment.paymentDate, 'MMM d, yyyy'))
						.join(', ')
				: 'No payment date';

			return {
				x: index + 1,
				y: cycle.totalPaid,
				meta: {
					cycleNumber: index + 1,
					cyclePeriod: `${format(cycle.startDate, 'MMM d, yyyy')} - ${format(cycle.endDate, 'MMM d, yyyy')}`,
					paymentDates,
					amountLabel: formatCurrency(cycle.totalPaid)
				}
			};
		})
	);

	const historyCycleOptions = $derived.by(() =>
		[...historyCycles]
			.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
			.map((cycle) => ({
				id: cycle.id,
				label: `${format(cycle.startDate, 'MMM d, yyyy')} - ${format(cycle.endDate, 'MMM d, yyyy')}`
			}))
	);

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

	function getCycleName(cycle: typeof cycles[0]) {
		const start = format(cycle.startDate, 'MMM d, yyyy');
		const end = format(cycle.endDate, 'MMM d, yyyy');
		return `${start} - ${end}`;
	}

	function getProgressPercentage(totalPaid: number, expectedAmount: number) {
		return expectedAmount > 0 ? Math.min((totalPaid / expectedAmount) * 100, 100) : 0;
	}

	const isCyclePaid = $derived.by(() => {
		const cycle = focusCycle ?? currentCycle;
		if (!cycle) return false;
		if (bill.isVariable) {
			return cycle.totalPaid > 0 || cycle.isPaid;
		}
		return cycle.isPaid || cycle.totalPaid >= cycle.expectedAmount;
	});
	const cyclePaymentStatus = $derived.by(() =>
		getCyclePaymentStatus({
			isVariable: bill.isVariable,
			isPaid: focusCycle?.isPaid ?? false,
			totalPaid: focusCycle?.totalPaid ?? 0,
			expectedAmount: focusCycle?.expectedAmount ?? bill.amount,
			dueDate: focusCycle?.dueDate ?? focusCycle?.endDate ?? bill.dueDate
		})
	);

	let showEditModal = $state(false);
	let showPaymentModal = $state(false);
	let editingPayment = $state<BillPayment | null>(null);
	let selectedHistoryCycleId = $state<number | null>(null);

	$effect(() => {
		const options = historyCycleOptions;
		if (options.length === 0) {
			selectedHistoryCycleId = null;
			return;
		}

		if (!options.some((option) => option.id === selectedHistoryCycleId)) {
			selectedHistoryCycleId = options[0].id;
		}
	});

	const selectedHistoryCycle = $derived.by(
		() => historyCycles.find((cycle) => cycle.id === selectedHistoryCycleId) ?? null
	);
	const selectedHistoryPayments = $derived.by(
		() => (selectedHistoryCycle ? paymentsByCycle[selectedHistoryCycle.id] ?? [] : [])
	);
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
					<StatusBadge status={bill.isRecurring ? 'recurring' : 'one-time'} />
					<StatusBadge status={bill.isAutopay ? 'autopay' : 'manual'} />
					<StatusBadge status={bill.isVariable ? 'variable' : 'fixed'} />
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
							class="h-3 rounded-full transition-all {getProgressBarClass(cyclePaymentStatus)}"
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

			{#if historyChartPoints.length > 0}
				<div class="mb-6">
					<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Recent {historyChartPoints.length} cycles
						</p>
					</div>
					<div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/30">
						<LineChart
							points={historyChartPoints}
							yLabel="Amount"
							showXAxis={false}
							showXAxisLabels={false}
							height={280}
						/>
					</div>
				</div>
			{/if}

			{#if historyCycleOptions.length > 0 && selectedHistoryCycle}
				<div class="space-y-4">
					<div class="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/20">
						<label for="historyCycleSelect" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							View Cycle Details
						</label>
						<select
							id="historyCycleSelect"
							bind:value={selectedHistoryCycleId}
							class="block w-full rounded-lg border-gray-300 bg-white text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						>
							{#each historyCycleOptions as option}
								<option value={option.id}>{option.label}</option>
							{/each}
						</select>
					</div>

					<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
						<div class="flex items-center justify-between mb-3">
							<div>
								<h3 class="font-medium text-gray-900 dark:text-gray-100">
									{getCycleName(selectedHistoryCycle)}
								</h3>
								{#if !bill.isVariable}
									<p class="text-sm text-gray-600 dark:text-gray-400">
										Expected: {formatCurrency(selectedHistoryCycle.expectedAmount)}
									</p>
								{/if}
							</div>
							<div class="text-right">
								<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
									{formatCurrency(selectedHistoryCycle.totalPaid)}
								</p>
								<StatusBadge
									status={getCyclePaymentStatus({
										isVariable: bill.isVariable,
										isPaid: selectedHistoryCycle.isPaid,
										totalPaid: selectedHistoryCycle.totalPaid,
										expectedAmount: selectedHistoryCycle.expectedAmount,
										dueDate: selectedHistoryCycle.dueDate ?? selectedHistoryCycle.endDate
									})}
									label={selectedHistoryCycle.totalPaid > 0 &&
									!selectedHistoryCycle.isPaid &&
									!bill.isVariable
										? `Partial (${getProgressPercentage(selectedHistoryCycle.totalPaid, selectedHistoryCycle.expectedAmount).toFixed(0)}%)`
										: undefined}
								/>
							</div>
						</div>

						{#if selectedHistoryPayments.length > 0}
							<div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
								<div class="space-y-1">
									{#each selectedHistoryPayments as payment}
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
						{:else}
							<div class="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
								No payments recorded in this cycle.
							</div>
						{/if}
					</div>
				</div>
			{/if}
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
