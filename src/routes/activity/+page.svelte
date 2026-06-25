<script lang="ts">
	import type { PageData } from './$types';
	import { formatDistanceToNow, format } from 'date-fns';
	import { Activity, AlertTriangle, ChevronDown, ChevronRight, ShieldCheck, Siren } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	type ActivityFilter = 'all' | 'error' | 'warn' | 'audit';

	let activeFilter = $state<ActivityFilter>('all');
	let expandedLogId = $state<number | null>(null);

	const logs = $derived(data.logs);
	const summary = $derived(data.summary);
	const filteredLogs = $derived.by(() =>
		logs.filter((log) => {
			if (activeFilter === 'all') return true;
			if (activeFilter === 'audit') return log.logType === 'audit';
			return log.level === activeFilter;
		})
	);
	const filterOptions = $derived.by(() => [
		{ id: 'all' as const, label: 'All', count: summary.total },
		{ id: 'error' as const, label: 'Errors', count: summary.errors },
		{ id: 'warn' as const, label: 'Warnings', count: summary.warnings },
		{ id: 'audit' as const, label: 'Audit', count: summary.audits }
	]);

	function getFilterCardClasses(filterId: ActivityFilter) {
		const selectedRing = activeFilter === filterId ? ' ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : '';

		if (filterId === 'error') {
			return `border-red-200 bg-red-50/80 hover:border-red-300 dark:border-red-900 dark:bg-red-950/20 dark:hover:border-red-800${selectedRing} ring-red-300 dark:ring-red-700`;
		}

		if (filterId === 'warn') {
			return `border-amber-200 bg-amber-50/80 hover:border-amber-300 dark:border-amber-900 dark:bg-amber-950/20 dark:hover:border-amber-800${selectedRing} ring-amber-300 dark:ring-amber-700`;
		}

		if (filterId === 'audit') {
			return `border-blue-200 bg-blue-50/80 hover:border-blue-300 dark:border-blue-900 dark:bg-blue-950/20 dark:hover:border-blue-800${selectedRing} ring-blue-300 dark:ring-blue-700`;
		}

		return `border-gray-200 bg-gray-50/80 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-gray-600${selectedRing} ring-gray-300 dark:ring-gray-600`;
	}

	function getFilterLabelClasses(filterId: ActivityFilter) {
		if (filterId === 'error') return 'text-red-600 dark:text-red-300';
		if (filterId === 'warn') return 'text-amber-600 dark:text-amber-300';
		if (filterId === 'audit') return 'text-blue-600 dark:text-blue-300';
		return 'text-gray-500 dark:text-gray-400';
	}

	function getFilterCountClasses(filterId: ActivityFilter) {
		if (filterId === 'error') return 'text-red-800 dark:text-red-100';
		if (filterId === 'warn') return 'text-amber-800 dark:text-amber-100';
		if (filterId === 'audit') return 'text-blue-800 dark:text-blue-100';
		return 'text-gray-900 dark:text-gray-100';
	}

	function getLevelClasses(level: string) {
		if (level === 'error') {
			return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200';
		}

		if (level === 'warn') {
			return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
		}

		return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200';
	}

	function getRowAccent(level: string) {
		if (level === 'error') return 'border-l-red-500';
		if (level === 'warn') return 'border-l-amber-500';
		return 'border-l-blue-500';
	}

	function getTypeLabel(logType: string) {
		if (logType === 'audit') return 'Audit';
		return 'Activity';
	}

	function getEntityLabel(log: (typeof logs)[number]) {
		if (!log.entityType) return 'System';
		return log.entityId ? `${log.entityType} • ${log.entityId}` : log.entityType;
	}

	function summarizeDetails(details: Record<string, unknown> | null) {
		if (!details) return '';

		const priorityKeys = ['reason', 'action', 'billId', 'paymentId', 'categoryId', 'assetTagId', 'paymentMethodId'];
		const parts = priorityKeys
			.map((key) => {
				const value = details[key];
				return value === undefined || value === null ? null : `${key}: ${String(value)}`;
			})
			.filter(Boolean);

		return parts.slice(0, 3).join(' • ');
	}

	function toggleExpanded(logId: number) {
		expandedLogId = expandedLogId === logId ? null : logId;
	}
</script>

<svelte:head>
	<title>Activity - BillTrack</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-6 rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
		<div class="border-b border-gray-200/80 px-5 py-5 dark:border-gray-700 sm:px-6">
			<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<div class="flex items-center gap-3">
						<Activity class="h-6 w-6 text-blue-600 dark:text-blue-400" />
						<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Activity</h1>
					</div>
					<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						Compact server activity, validation warnings, and audit events.
					</p>
				</div>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Showing latest {logs.length} entries
				</p>
			</div>
		</div>

		<div class="grid gap-3 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4 sm:px-6">
			{#each filterOptions as filter}
				<button
					type="button"
					onclick={() => {
						activeFilter = filter.id;
						expandedLogId = null;
					}}
					class={`rounded-2xl border p-4 text-left transition ${getFilterCardClasses(filter.id)}`}
				>
					<p class={`text-xs font-semibold uppercase tracking-[0.18em] ${getFilterLabelClasses(filter.id)}`}>{filter.label}</p>
					<p class={`mt-2 text-2xl font-semibold ${getFilterCountClasses(filter.id)}`}>{filter.count}</p>
				</button>
			{/each}
		</div>
	</div>

	{#if logs.length > 0}
		<div class="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<div class="border-b border-gray-200 bg-gray-50/80 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400 sm:px-6">
				{filteredLogs.length} matching entries
			</div>

			{#if filteredLogs.length === 0}
				<div class="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
					No entries match this filter.
				</div>
			{:else}
				<div class="divide-y divide-gray-200 dark:divide-gray-700">
					{#each filteredLogs as log}
						{@const isExpanded = expandedLogId === log.id}
						<div class={`border-l-4 px-5 py-4 ${getRowAccent(log.level)} sm:px-6`}>
							<div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<span class={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getLevelClasses(log.level)}`}>
											{#if log.level === 'error'}
												<Siren class="mr-1 h-3.5 w-3.5" />
											{:else if log.level === 'warn'}
												<AlertTriangle class="mr-1 h-3.5 w-3.5" />
											{:else}
												<ShieldCheck class="mr-1 h-3.5 w-3.5" />
											{/if}
											{log.level.toUpperCase()}
										</span>
										<span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
											{getTypeLabel(log.logType)}
										</span>
										<span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
											{getEntityLabel(log)}
										</span>
									</div>

									<div class="mt-2 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
										<h2 class="min-w-0 break-all text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">
											{log.event}
										</h2>
										{#if summarizeDetails(log.parsedDetails)}
											<p class="min-w-0 truncate text-sm text-gray-500 dark:text-gray-400">
												{summarizeDetails(log.parsedDetails)}
											</p>
										{/if}
									</div>

									<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
										<span>{formatDistanceToNow(log.createdAt, { addSuffix: true })}</span>
										<span>{format(log.createdAt, 'MMM d, h:mm:ss a')}</span>
										{#if log.path}
											<span class="font-mono">{log.method} {log.path}</span>
										{/if}
										{#if log.requestId}
											<span class="font-mono">request {log.requestId}</span>
										{/if}
									</div>
								</div>

								{#if log.parsedDetails}
									<button
										type="button"
										onclick={() => toggleExpanded(log.id)}
										class="inline-flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-900/40"
									>
										{#if isExpanded}
											<ChevronDown class="h-4 w-4" />
											Hide details
										{:else}
											<ChevronRight class="h-4 w-4" />
											View details
										{/if}
									</button>
								{/if}
							</div>

							{#if isExpanded && log.parsedDetails}
								<div class="mt-4 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-900/30">
									<pre class="overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-700 dark:text-gray-300">{JSON.stringify(log.parsedDetails, null, 2)}</pre>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if data.hasMore}
			<div class="mt-6 flex justify-center">
				<a
					href={`/activity?limit=${data.nextLimit}`}
					class="inline-flex items-center rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
				>
					Load more
				</a>
			</div>
		{/if}
	{:else}
		<div class="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<p class="text-gray-600 dark:text-gray-400">No activity has been persisted yet.</p>
		</div>
	{/if}
</div>
