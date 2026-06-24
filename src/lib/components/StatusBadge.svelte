<script lang="ts">
	import {
		AlertTriangle,
		CheckCircle2,
		Clock3,
		CreditCard,
		CircleDollarSign,
		CircleDot,
		RefreshCcw
	} from 'lucide-svelte';
	import type { BillStatusKey } from '$lib/utils/bill-status';

	interface Props {
		status: BillStatusKey;
		label?: string;
		title?: string;
		size?: 'sm' | 'md';
		iconOnly?: boolean;
	}

	let { status, label, title, size = 'sm', iconOnly = false }: Props = $props();

	const statusConfig = {
		paid: {
			label: 'Paid',
			classes:
				'border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-400',
			icon: CheckCircle2
		},
		partial: {
			label: 'Partial',
			classes:
				'border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400',
			icon: CircleDollarSign
		},
		overdue: {
			label: 'Overdue',
			classes:
				'border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
			icon: AlertTriangle
		},
		upcoming: {
			label: 'Due Soon',
			classes:
				'border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400',
			icon: Clock3
		},
		pending: {
			label: 'Pending',
			classes:
				'border-gray-200 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
			icon: CircleDot
		},
		recurring: {
			label: 'Recurring',
			classes:
				'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400',
			icon: RefreshCcw
		},
		'one-time': {
			label: 'One-Time',
			classes:
				'border-gray-200 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
			icon: CircleDot
		},
		autopay: {
			label: 'Autopay',
			classes:
				'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400',
			icon: CreditCard
		},
		manual: {
			label: 'Manual',
			classes:
				'border-gray-200 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
			icon: CircleDot
		},
		variable: {
			label: 'Variable',
			classes:
				'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400',
			icon: CircleDollarSign
		},
		fixed: {
			label: 'Fixed',
			classes:
				'border-gray-200 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
			icon: CircleDollarSign
		}
	} satisfies Record<
		BillStatusKey,
		{ label: string; classes: string; icon: typeof CheckCircle2 }
	>;

	const config = $derived(statusConfig[status]);
	const Icon = $derived(config.icon);
	const text = $derived(label ?? config.label);
</script>

<span
	class={`inline-flex items-center rounded-full border font-medium leading-none ${config.classes} ${
		iconOnly
			? size === 'md'
				? 'p-2 text-sm'
				: 'p-1.5 text-xs'
			: size === 'md'
				? 'gap-1.5 px-3 py-1 text-sm'
				: 'gap-1.5 px-2.5 py-0.5 text-xs'
	}`}
	title={title ?? text}
	aria-label={text}
>
	<Icon class={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
	{#if !iconOnly}
		{text}
	{/if}
</span>
