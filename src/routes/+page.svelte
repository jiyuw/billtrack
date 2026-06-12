<script lang="ts">
	import type { PageData } from './$types';
	import BillCard from '$lib/components/BillCard.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import BillForm from '$lib/components/BillForm.svelte';
	import PaymentModal from '$lib/components/PaymentModal.svelte';
	import Button from '$lib/components/Button.svelte';
	import FloatingActionButton from '$lib/components/FloatingActionButton.svelte';
	import type { BillWithCategory, BillWithCycle } from '$lib/types/bill';
	import { invalidateAll } from '$app/navigation';
import { endOfDay } from 'date-fns';

	let { data }: { data: PageData } = $props();

	let filterStatus = $state<string>('all');
	let filterCategory = $state<number | null | 'uncategorized'>(null);
	let filterAssetTag = $state<number | null | 'none'>(null);
	let searchQuery = $state('');
	let sortField = $state<'assetTag' | 'name'>('assetTag');
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showPaymentModal = $state(false);
	let editingBillId = $state<number | null>(null);
	let payingBillId = $state<number | null>(null);

	const editingBill = $derived(
		editingBillId !== null ? data.bills.find((b) => b.id === editingBillId) : null
	);

	const payingBill = $derived(
		payingBillId !== null ? data.bills.find((b) => b.id === payingBillId) : null
	);
	const hasActiveFilters = $derived(
		filterStatus !== 'all' || filterCategory !== null || filterAssetTag !== null || searchQuery.trim().length > 0
	);

	const filteredBills = $derived.by(() => {
		let bills = data.bills as BillWithCategory[];

		const isBillPaid = (bill: BillWithCategory | BillWithCycle) => {
			if ('focusCycle' in bill) {
				const cycle = bill.focusCycle ?? bill.currentCycle;
				if (!cycle) return false;
				if ((bill as BillWithCycle).isVariable) {
					return cycle.totalPaid > 0 || cycle.isPaid;
				}
				return cycle.isPaid || cycle.totalPaid >= cycle.expectedAmount;
			}
			return false;
		};

		// Apply status filter
		if (filterStatus !== 'all') {
			const now = new Date();
			bills = bills.filter((bill) => {
				const paid = isBillPaid(bill);
				const cycleBill = ('focusCycle' in bill ? bill as BillWithCycle : null);
				const dueAt = endOfDay(
					(cycleBill
						? (cycleBill.focusCycle ?? cycleBill.currentCycle)?.dueDate ??
							(cycleBill.focusCycle ?? cycleBill.currentCycle)?.endDate
						: null) ?? bill.dueDate
				);
				if (filterStatus === 'paid') return paid;
				if (filterStatus === 'unpaid') return !paid;
				if (filterStatus === 'overdue') return !paid && dueAt <= now;
				return true;
			});
		}

		// Apply category filter
		if (filterCategory !== null) {
			if (filterCategory === 'uncategorized') {
				bills = bills.filter((bill) => bill.categoryId === null);
			} else {
				bills = bills.filter((bill) => bill.categoryId === filterCategory);
			}
		}

		// Apply asset tag filter
		if (filterAssetTag !== null) {
			if (filterAssetTag === 'none') {
				bills = bills.filter((bill) => bill.assetTagId === null);
			} else {
				bills = bills.filter((bill) => bill.assetTagId === filterAssetTag);
			}
		}

		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			bills = bills.filter(
				(bill) =>
					bill.name.toLowerCase().includes(query) ||
					bill.notes?.toLowerCase().includes(query)
			);
		}

		// Apply sorting
		bills = [...bills].sort((a, b) => {
			let aVal, bVal;

			if (sortField === 'assetTag') {
				const aTag = a.assetTag?.name?.toLowerCase() ?? '';
				const bTag = b.assetTag?.name?.toLowerCase() ?? '';
				aVal = aTag;
				bVal = bTag;
			} else {
				aVal = a.name.toLowerCase();
				bVal = b.name.toLowerCase();
			}

			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});

		return bills;
	});

	async function handleTogglePaid(id: number, isPaid: boolean) {
		if (isPaid) {
			// If marking as paid, show the payment modal
			payingBillId = id;
			showPaymentModal = true;
		} else {
			// If marking as unpaid, do it directly
			try {
				const response = await fetch(`/api/bills/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ isPaid })
				});

				if (response.ok) {
					await invalidateAll();
				}
			} catch (error) {
				console.error('Error toggling bill status:', error);
			}
		}
	}

	async function handleConfirmPayment(data: {
		amount: number;
		paymentDate: string;
		cycleId: number | null;
		notes?: string;
	}) {
		if (payingBillId === null) return;

		try {
			const response = await fetch(`/api/bills/${payingBillId}`, {
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
				payingBillId = null;
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
		payingBillId = null;
	}

	async function handleDelete(id: number) {
		try {
			const response = await fetch(`/api/bills/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error deleting bill:', error);
		}
	}

	function resetFilters() {
		filterStatus = 'all';
		filterCategory = null;
		filterAssetTag = null;
		searchQuery = '';
	}

	async function handleAddBill(billData: any) {
		try {
			const response = await fetch('/api/bills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(billData)
			});

			if (response.ok) {
				showAddModal = false;
				await invalidateAll();
			} else {
				alert('Failed to create bill. Please try again.');
			}
		} catch (error) {
			console.error('Error creating bill:', error);
			alert('Failed to create bill. Please try again.');
		}
	}

	function handleCloseModal() {
		showAddModal = false;
	}

	function handleEdit(id: number) {
		editingBillId = id;
		showEditModal = true;
	}

	async function handleUpdateBill(billData: any) {
		if (editingBillId === null) return;

		try {
			const response = await fetch(`/api/bills/${editingBillId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(billData)
			});

			if (response.ok) {
				showEditModal = false;
				editingBillId = null;
				await invalidateAll();
			} else {
				alert('Failed to update bill. Please try again.');
			}
		} catch (error) {
			console.error('Error updating bill:', error);
			alert('Failed to update bill. Please try again.');
		}
	}

	function handleCloseEditModal() {
		showEditModal = false;
		editingBillId = null;
	}
</script>

<svelte:head>
	<title>Billzzz - I Got Bills, They're Multiplying</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8">
		<div>
			<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Bills Dashboard</h1>
			<p class="mt-2 text-gray-600 dark:text-gray-400 italic">I got bills, they're multiplying</p>
		</div>
	</div>

	<!-- Filters and Actions -->
	<div class="mb-6 rounded-3xl border border-gray-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-gray-700/80 dark:bg-gray-800/85 sm:p-5">
		<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
			<div class="flex-1 space-y-4">
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 dark:text-gray-500">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="m21 21-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
					</div>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search bills or notes"
						class="w-full rounded-2xl border border-gray-200 bg-gray-50/80 py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-blue-500 dark:focus:bg-gray-900 dark:focus:ring-blue-950/60"
					/>
				</div>

				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<label class="space-y-1.5">
						<span class="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
							Status
						</span>
						<select
							bind:value={filterStatus}
							class="w-full rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-100 dark:focus:border-blue-500 dark:focus:bg-gray-900 dark:focus:ring-blue-950/60"
						>
							<option value="all">All Bills</option>
							<option value="unpaid">Unpaid</option>
							<option value="paid">Paid</option>
							<option value="overdue">Overdue</option>
						</select>
					</label>

					<label class="space-y-1.5">
						<span class="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
							Category
						</span>
						<select
							bind:value={filterCategory}
							class="w-full rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-100 dark:focus:border-blue-500 dark:focus:bg-gray-900 dark:focus:ring-blue-950/60"
						>
							<option value={null}>All Categories</option>
							<option value="uncategorized">Uncategorized</option>
							{#each data.categories as category}
								<option value={category.id}>{category.name}</option>
							{/each}
						</select>
					</label>

					<label class="space-y-1.5">
						<span class="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
							Asset
						</span>
						<select
							bind:value={filterAssetTag}
							class="w-full rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-100 dark:focus:border-blue-500 dark:focus:bg-gray-900 dark:focus:ring-blue-950/60"
						>
							<option value={null}>All Assets</option>
							<option value="none">Unknown Asset</option>
							{#each data.assetTags as tag}
								<option value={tag.id}>{tag.name}</option>
							{/each}
						</select>
					</label>

					<label class="space-y-1.5">
						<span class="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
							Sort
						</span>
						<div class="flex gap-2">
							<select
								bind:value={sortField}
								class="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-100 dark:focus:border-blue-500 dark:focus:bg-gray-900 dark:focus:ring-blue-950/60"
							>
								<option value="assetTag">Asset Tag</option>
								<option value="name">Name</option>
							</select>
							<button
								type="button"
								onclick={() => (sortDirection = sortDirection === 'asc' ? 'desc' : 'asc')}
								class="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl border border-gray-200 bg-gray-50/80 text-gray-600 transition hover:border-gray-300 hover:bg-white hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-900 dark:hover:text-gray-100"
								title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
							>
								{#if sortDirection === 'asc'}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
										/>
									</svg>
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"
										/>
									</svg>
								{/if}
							</button>
						</div>
					</label>
				</div>

				<div class="flex flex-wrap items-center gap-3">
					{#if hasActiveFilters}
						<button
							type="button"
							onclick={resetFilters}
							class="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-100"
						>
							Reset filters
						</button>
					{/if}
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Showing {filteredBills.length} of {data.bills.length} bills
					</p>
				</div>
			</div>

			<div class="hidden md:block">
				<Button variant="primary" size="md" onclick={() => (showAddModal = true)}>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					Add Bill
				</Button>
			</div>
		</div>
	</div>

		<!-- Mobile FAB for Add Bill -->
		<FloatingActionButton onclick={() => (showAddModal = true)} title="Add Bill">
			<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 4v16m8-8H4"
				/>
			</svg>
		</FloatingActionButton>

		<!-- Bills List -->
		{#if filteredBills.length === 0}
			<div class="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-12 text-center">
				<svg
					class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
				<h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">No bills found</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Get started by adding your first bill.</p>
				<div class="mt-6">
					<Button variant="primary" size="md" onclick={() => (showAddModal = true)}>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						Add Bill
					</Button>
				</div>
			</div>
		{:else}
			<div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
				{#each filteredBills as bill (bill.id)}
					<BillCard {bill} onTogglePaid={handleTogglePaid} onEdit={handleEdit} onDelete={handleDelete} />
				{/each}
			</div>
	{/if}
</div>

<!-- Add Bill Modal -->
{#if showAddModal}
	<Modal bind:isOpen={showAddModal} onClose={handleCloseModal} title="Add New Bill">
		<BillForm
			categories={data.categories}
			assetTags={data.assetTags}
			paymentMethods={data.paymentMethods}
			onSubmit={handleAddBill}
			onCancel={handleCloseModal}
			submitLabel="Add Bill"
		/>
	</Modal>
{/if}

<!-- Edit Bill Modal -->
{#if editingBill}
	<Modal bind:isOpen={showEditModal} onClose={handleCloseEditModal} title="Edit Bill">
		<BillForm
			categories={data.categories}
			assetTags={data.assetTags}
			paymentMethods={data.paymentMethods}
			initialData={{
				name: editingBill.name,
				amount: editingBill.amount,
				dueDate: editingBill.focusCycle?.dueDate ?? editingBill.currentCycle?.dueDate ?? editingBill.dueDate,
				cycleStartDate: editingBill.focusCycle?.startDate ?? editingBill.currentCycle?.startDate ?? editingBill.cycleStartDate ?? editingBill.dueDate,
				cycleEndDate: editingBill.focusCycle?.endDate ?? editingBill.currentCycle?.endDate ?? editingBill.cycleEndDate ?? editingBill.dueDate,
				paymentLink: editingBill.paymentLink || undefined,
				categoryId: editingBill.categoryId,
				assetTagId: editingBill.assetTagId ?? undefined,
				isRecurring: editingBill.isRecurring,
				recurrenceInterval: editingBill.recurrenceInterval || undefined,
				recurrenceUnit: editingBill.recurrenceUnit || undefined,
				recurrenceDay: editingBill.recurrenceDay || undefined,
				isAutopay: editingBill.isAutopay,
				paymentMethodId: editingBill.paymentMethodId ?? undefined,
				isVariable: editingBill.isVariable,
				notes: editingBill.notes || undefined
			}}
			onSubmit={handleUpdateBill}
			onCancel={handleCloseEditModal}
			submitLabel="Update Bill"
			isEditing={true}
		/>
	</Modal>
{/if}

<!-- Payment Confirmation Modal -->
{#if payingBill}
	<PaymentModal
		bind:isOpen={showPaymentModal}
		bill={payingBill}
		focusCycleId={payingBill.focusCycle?.id ?? null}
		onConfirm={handleConfirmPayment}
		onCancel={handleCancelPayment}
	/>
{/if}
