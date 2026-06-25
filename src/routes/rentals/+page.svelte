<script lang="ts">
	import type { PageData } from './$types';
	import { Building2 } from 'lucide-svelte';
	import RentalAssetSelector from '$lib/components/rentals/RentalAssetSelector.svelte';
	import RentalBillGroup from '$lib/components/rentals/RentalBillGroup.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Rental Management - BillTrack</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<Building2 class="h-8 w-8 text-gray-900 dark:text-gray-100" />
			<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Rental Management</h1>
		</div>
		<p class="mt-2 text-gray-600 dark:text-gray-400">
			Track tenant notifications for chargeable rental bills.
		</p>
	</div>

	{#if data.assets.length === 0}
		<div class="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800">
			<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">No rental assets</p>
			<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Mark an asset as rental in Settings.</p>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[320px_1fr]">
			<aside>
				<RentalAssetSelector
					assets={data.assets}
					selectedAssetId={data.selectedAsset?.asset.id ?? null}
				/>
			</aside>

			<main class="space-y-4">
				{#if !data.selectedAsset}
					<div class="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-800">
						<p class="text-sm text-gray-500 dark:text-gray-400">Select a rental asset.</p>
					</div>
				{:else if data.selectedAsset.bills.length === 0}
					<div class="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-800">
						<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
							{data.selectedAsset.asset.name}
						</p>
						<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
							No chargeable bills are assigned to this rental asset.
						</p>
					</div>
				{:else}
					{#each data.selectedAsset.bills as bill (bill.id)}
						<RentalBillGroup {bill} />
					{/each}
				{/if}
			</main>
		</div>
	{/if}
</div>
