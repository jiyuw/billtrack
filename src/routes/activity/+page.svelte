<script lang="ts">
	import type { PageData } from './$types';
	import { formatDistanceToNow, format } from 'date-fns';
	import { Activity, AlertTriangle, ShieldCheck, Siren } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const logs = $derived(data.logs);
	const summary = $derived(data.summary);

	function getLevelClasses(level: string) {
		if (level === 'error') {
			return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200';
		}

		if (level === 'warn') {
			return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
		}

		return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200';
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
</script>

<svelte:head>
	<title>Activity - BillTrack</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8 rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
		<div class="border-b border-gray-200/80 px-6 py-6 dark:border-gray-700">
			<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<div class="flex items-center gap-3">
						<Activity class="h-6 w-6 text-blue-600 dark:text-blue-400" />
						<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Activity</h1>
					</div>
					<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						Recent app activity, validation warnings, and audit events captured from the server.
					</p>
				</div>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Showing the latest {summary.total} persisted entries
				</p>
			</div>
		</div>

		<div class="grid gap-3 px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
			<div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Total</p>
				<p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">{summary.total}</p>
			</div>
			<div class="rounded-2xl border border-red-200 bg-red-50/80 p-4 dark:border-red-900 dark:bg-red-950/20">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-300">Errors</p>
				<p class="mt-2 text-2xl font-semibold text-red-800 dark:text-red-100">{summary.errors}</p>
			</div>
			<div class="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/20">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">Warnings</p>
				<p class="mt-2 text-2xl font-semibold text-amber-800 dark:text-amber-100">{summary.warnings}</p>
			</div>
			<div class="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/20">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Audits</p>
				<p class="mt-2 text-2xl font-semibold text-blue-800 dark:text-blue-100">{summary.audits}</p>
			</div>
		</div>
	</div>

	{#if logs.length > 0}
		<div class="space-y-4">
			{#each logs as log}
				<div class="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
					<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getLevelClasses(log.level)}`}>
									{#if log.level === 'error'}
										<Siren class="mr-1 h-3.5 w-3.5" />
									{:else if log.level === 'warn'}
										<AlertTriangle class="mr-1 h-3.5 w-3.5" />
									{:else}
										<ShieldCheck class="mr-1 h-3.5 w-3.5" />
									{/if}
									{log.level.toUpperCase()}
								</span>
								<span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
									{getTypeLabel(log.logType)}
								</span>
								<span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
									{getEntityLabel(log)}
								</span>
							</div>

							<h2 class="mt-3 break-all text-lg font-semibold text-gray-900 dark:text-gray-100">
								{log.event}
							</h2>

							{#if summarizeDetails(log.parsedDetails)}
								<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
									{summarizeDetails(log.parsedDetails)}
								</p>
							{/if}

							{#if log.parsedDetails}
								<details class="mt-4 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-900/30">
									<summary class="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
										View event details
									</summary>
									<pre class="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-700 dark:text-gray-300">{JSON.stringify(log.parsedDetails, null, 2)}</pre>
								</details>
							{/if}
						</div>

						<div class="shrink-0 text-sm text-gray-500 dark:text-gray-400 lg:text-right">
							<p class="font-medium text-gray-700 dark:text-gray-200">{formatDistanceToNow(log.createdAt, { addSuffix: true })}</p>
							<p class="mt-1">{format(log.createdAt, 'MMM d, yyyy h:mm:ss a')}</p>
							{#if log.requestId}
								<p class="mt-2 font-mono text-xs">request {log.requestId}</p>
							{/if}
							{#if log.path}
								<p class="mt-1 font-mono text-xs">{log.method} {log.path}</p>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<p class="text-gray-600 dark:text-gray-400">No activity has been persisted yet.</p>
		</div>
	{/if}
</div>
