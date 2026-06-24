<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/format';
	import { getRecurrenceDescription } from '$lib/utils/recurrence';
	import { getAssetTagBannerStyle } from '$lib/utils/asset-tag-banner';
	import { format } from 'date-fns';
	import { formatStoredDate } from '$lib/utils/dates';
	import {
		ArrowLeft,
		AlertTriangle,
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
		const paidCyclesByDate = [...displayCycles].sort(
			(a, b) => a.startDate.getTime() - b.startDate.getTime()
		);
		const values = paidCyclesByDate.map((cycle) => cycle.totalPaid);
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
						.map((payment) => formatStoredDate(payment.paymentDate))
						.join(', ')
				: 'No payment date';

			return {
				x: index + 1,
				y: cycle.totalPaid,
				meta: {
					cycleNumber: index + 1,
					cyclePeriod: `${formatStoredDate(cycle.startDate)} - ${format(cycle.endDate, 'MMM d, yyyy')}`,
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
				label: `${formatStoredDate(cycle.startDate)} - ${format(cycle.endDate, 'MMM d, yyyy')}`
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
		const start = formatStoredDate(cycle.startDate);
		const end = format(cycle.endDate, 'MMM d, yyyy');
		return `${start} - ${end}`;
	}

	function getProgressPercentage(totalPaid: number, expectedAmount: number) {
		return expectedAmount > 0 ? Math.min((totalPaid / expectedAmount) * 100, 100) : 0;
	}

	const focusDueDate = $derived(
		focusCycle?.dueDate ?? focusCycle?.endDate ?? bill.currentCycle?.dueDate ?? bill.currentCycle?.endDate ?? bill.dueDate
	);

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
	const cycleRemaining = $derived.by(() => {
		if (!focusCycle || bill.isVariable) return null;
		return Math.max(focusCycle.expectedAmount - focusCycle.totalPaid, 0);
	});
	const currentCycleAlert = $derived.by(() => {
		if (!focusCycle) return null;
		if (cyclePaymentStatus === 'overdue') {
			return {
				tone: 'red',
				title: 'Payment overdue',
				message: `This cycle was due ${format(focusDueDate, 'MMM d, yyyy')} and still needs attention.`
			};
		}
		if (cyclePaymentStatus === 'partial' && !bill.isVariable) {
			return {
				tone: 'yellow',
				title: 'Partial payment recorded',
				message: `${formatCurrency(cycleRemaining ?? 0)} remains in this cycle.`
			};
		}
		if (bill.isVariable && focusCycle.totalPaid > 0) {
			return {
				tone: 'green',
				title: 'Payment recorded',
				message: `Latest payment for this cycle is ${formatCurrency(focusCycle.totalPaid)}.`
			};
		}
		return null;
	});

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
	<div class="mb-8">
		<button
			onclick={() => goto('/')}
			class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4 cursor-pointer"
		>
			<ArrowLeft class="w-4 h-4" />
			Back to Bills
		</button>

		<div class="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<div class="border-b border-gray-200/80 bg-gradient-to-r from-white via-slate-50 to-blue-50/70 px-6 py-6 dark:border-gray-700 dark:from-gray-800 dark:via-gray-800 dark:to-blue-950/20">
				<div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
					<div class="flex-1">
						<div class="flex flex-wrap items-center gap-3">
							<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">{bill.name}</h1>
							<StatusIndicator dueDate={focusDueDate} isPaid={isCyclePaid} />
						</div>
						<div class="mt-3 flex flex-wrap items-center gap-2">
							<StatusBadge status={bill.isRecurring ? 'recurring' : 'one-time'} />
							<StatusBadge status={bill.isAutopay ? 'autopay' : 'manual'} />
							<StatusBadge status={bill.isVariable ? 'variable' : 'fixed'} />
						</div>
						<p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
							{#if bill.isRecurring}
								Recurring {getRecurrenceDescription(bill.recurrenceInterval ?? 1, bill.recurrenceUnit ?? 'month', bill.recurrenceDay)} • Due {format(focusDueDate, 'MMM d, yyyy')}
							{:else}
								One-time bill • Due {format(focusDueDate, 'MMM d, yyyy')}
							{/if}
						</p>
						{#if bill.notes}
							<div class="mt-4 inline-flex max-w-full items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
								<Info size={15} class="mt-0.5 shrink-0" />
								<p class="whitespace-pre-wrap break-words italic">{bill.notes}</p>
							</div>
						{/if}
					</div>

					<div class="flex flex-wrap items-center gap-2 lg:justify-end">
						<button
							onclick={handleTogglePaid}
							class="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black dark:border-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white cursor-pointer"
							title={isCyclePaid ? 'Mark as unpaid' : 'Mark as paid'}
						>
							{#if isCyclePaid}
								<svg
									class="h-4 w-4"
									viewBox="0 0 20 20"
									xmlns="http://www.w3.org/2000/svg"
									aria-hidden="true"
								>
									<circle cx="10" cy="10" r="8" fill="currentColor" class="text-green-500" />
									<path
										d="M6.5 10.5l2 2 5-5"
										fill="none"
										stroke="#ffffff"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span>Mark Unpaid</span>
							{:else}
								<svg
									class="h-4 w-4"
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
								<span>Add Payment</span>
							{/if}
						</button>
						{#if bill.paymentLink}
							<a
								href={bill.paymentLink}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950"
								title="Pay bill"
							>
								<svg
									class="h-4 w-4"
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
								<span>Open Payment Link</span>
							</a>
						{/if}
						<button
							onclick={() => (showEditModal = true)}
							class="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-950 cursor-pointer"
							title="Edit bill"
						>
							<svg
								class="h-4 w-4"
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
							<span>Edit</span>
						</button>
						<button
							onclick={handleDelete}
							class="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950 cursor-pointer"
							title="Delete bill"
						>
							<svg
								class="h-4 w-4"
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
							<span>Delete</span>
						</button>
					</div>
				</div>
			</div>

			<div class="grid gap-3 px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Current Due</p>
					<p class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{format(focusDueDate, 'MMM d, yyyy')}</p>
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Anchor for the current billing cycle</p>
				</div>
				<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Autopay</p>
					<p class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
						{#if bill.isAutopay}On{:else}Off{/if}
					</p>
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{#if bill.paymentMethod}
							{bill.paymentMethod.nickname} •••• {bill.paymentMethod.lastFour}
						{:else if bill.isAutopay}
							Payment method not linked
						{:else}
							Paid manually
						{/if}
					</p>
				</div>
				<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Category</p>
					{#if bill.category}
						<div class="mt-2 flex items-center gap-2">
							{#if CategoryIcon}
								<CategoryIcon size={16} style="color: {bill.category.color}" />
							{:else if bill.category.icon}
								<span class="text-sm" style="color: {bill.category.color}">{bill.category.icon}</span>
							{/if}
							<p class="text-lg font-semibold" style="color: {bill.category.color}">
								{bill.category.name}
							</p>
						</div>
					{:else}
						<p class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">Uncategorized</p>
					{/if}
				</div>
				<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Asset Tag</p>
					{#if bill.assetTag}
						<div
							class="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium text-white"
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
						<p class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">None</p>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Current Cycle Card -->
	{#if focusCycle}
		<div class="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<div class="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<div class="flex items-center gap-2">
						<Calendar class="w-5 h-5 text-blue-600 dark:text-blue-400" />
						<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Current Cycle</h2>
					</div>
					<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						This is the cycle that matters most right now for this bill.
					</p>
				</div>
				<StatusBadge
					status={cyclePaymentStatus}
					size="md"
					label={cyclePaymentStatus === 'partial'
						? `Partial • ${getProgressPercentage(focusCycle.totalPaid, focusCycle.expectedAmount).toFixed(0)}%`
						: undefined}
				/>
			</div>

			{#if currentCycleAlert}
				<div class={`mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
					currentCycleAlert.tone === 'red'
						? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
						: currentCycleAlert.tone === 'yellow'
							? 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200'
							: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200'
				}`}>
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
					<div>
						<p class="text-sm font-semibold">{currentCycleAlert.title}</p>
						<p class="mt-1 text-sm opacity-90">{currentCycleAlert.message}</p>
					</div>
				</div>
			{/if}

			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Period</p>
					<p class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
						{formatStoredDate(focusCycle.startDate, 'MMM d')} - {format(focusCycle.endDate, 'MMM d, yyyy')}
					</p>
				</div>
				<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Due Date</p>
					<p class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{format(focusDueDate, 'MMM d, yyyy')}</p>
				</div>
				<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Paid So Far</p>
					<p class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
						{bill.isVariable && focusCycle.totalPaid === 0 ? 'Unpaid' : formatCurrency(focusCycle.totalPaid)}
					</p>
				</div>
				<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
						{bill.isVariable ? 'Payment Pattern' : 'Remaining'}
					</p>
					<p class="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
						{#if bill.isVariable}
							Usage-based
						{:else}
							{formatCurrency(cycleRemaining ?? 0)}
						{/if}
					</p>
				</div>
			</div>

			{#if !bill.isVariable}
				<div class="mt-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/20">
					<div class="mb-3 flex items-center justify-between gap-3">
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-gray-100">Cycle Progress</p>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Expected {formatCurrency(focusCycle.expectedAmount)}
							</p>
						</div>
						<p class="text-sm font-semibold text-gray-700 dark:text-gray-300">
							{focusCycle.percentPaid.toFixed(0)}%
						</p>
					</div>
					<div class="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
						<div
							class="h-3 rounded-full transition-all {getProgressBarClass(cyclePaymentStatus)}"
							style="width: {focusCycle.percentPaid}%"
						></div>
					</div>
				</div>
			{/if}

			{#if paymentsByCycle[focusCycle.id]?.length > 0}
				<div class="mt-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/20">
					<h3 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
						Payments This Cycle
					</h3>
					<div class="space-y-2">
						{#each paymentsByCycle[focusCycle.id] as payment}
							<div
								class="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50 sm:flex-row sm:items-center sm:justify-between"
							>
								<div class="flex items-center gap-3">
									<DollarSign class="h-4 w-4 text-green-600 dark:text-green-400" />
									<div>
										<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
											{formatCurrency(payment.amount)}
										</p>
										<p class="text-xs text-gray-500 dark:text-gray-400">
											{formatStoredDate(payment.paymentDate)}
										</p>
										{#if payment.notes}
											<p class="mt-1 text-xs text-gray-600 dark:text-gray-400">{payment.notes}</p>
										{/if}
									</div>
								</div>
								<button
									type="button"
									onclick={() => handleEditPayment(payment)}
									class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950 cursor-pointer"
								>
									Edit Payment
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="mb-6 rounded-3xl border border-yellow-200 bg-yellow-50 p-5 dark:border-yellow-800 dark:bg-yellow-900/20">
			<p class="text-sm text-yellow-800 dark:text-yellow-200">
				No current billing cycle. Cycles will be generated automatically when payments are recorded.
			</p>
		</div>
	{/if}

	<!-- Cycle History -->
	{#if displayCycles.length > 0}
		<div class="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<div class="mb-4 flex items-center gap-2">
				<TrendingUp class="w-5 h-5 text-purple-600 dark:text-purple-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Payment History</h2>
			</div>
			<p class="mb-5 text-sm text-gray-600 dark:text-gray-400">
				Review recent cycles and drill into any payment you need to verify or edit.
			</p>

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

					<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
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
												{formatStoredDate(payment.paymentDate)}
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
