<script lang="ts">
	import { Building2 } from 'lucide-svelte';

	type RentalAsset = {
		id: number;
		name: string;
		type: 'house' | 'vehicle' | null;
		chargeableBillCount: number;
		recentPaymentCount: number;
	};

	let {
		assets,
		selectedAssetId
	}: {
		assets: RentalAsset[];
		selectedAssetId: number | null;
	} = $props();
</script>

<div class="space-y-3">
	{#each assets as asset (asset.id)}
		<a
			href={`/rentals?asset=${asset.id}`}
			class={`flex items-center justify-between gap-3 rounded-lg border p-4 transition ${
				asset.id === selectedAssetId
					? 'border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-100'
					: 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-600'
			}`}
		>
			<span class="flex min-w-0 items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
					<Building2 class="h-5 w-5" />
				</span>
				<span class="min-w-0">
					<span class="block truncate text-sm font-semibold">{asset.name}</span>
					<span class="block text-xs opacity-75">{asset.type ?? 'asset'}</span>
				</span>
			</span>
			<span class="shrink-0 text-right text-xs opacity-75">
				<span class="block">{asset.chargeableBillCount} bills</span>
				<span class="block">{asset.recentPaymentCount} payments</span>
			</span>
		</a>
	{/each}
</div>
