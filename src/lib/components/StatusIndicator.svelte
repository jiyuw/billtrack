<script lang="ts">
	import { formatDistanceToNow, endOfDay } from 'date-fns';
	import StatusBadge from './StatusBadge.svelte';
	import { getDueStatus } from '$lib/utils/bill-status';

	interface Props {
		dueDate: Date;
		isPaid: boolean;
	}

	let { dueDate, isPaid }: Props = $props();

	const status = $derived(getDueStatus(dueDate, isPaid));

	const statusText = $derived.by(() => {
		const dueAt = endOfDay(dueDate);
		if (isPaid) return 'Paid';
		if (status === 'overdue') return `Overdue ${formatDistanceToNow(dueAt)}`;
		return `Due ${formatDistanceToNow(dueAt, { addSuffix: true })}`;
	});
</script>

<StatusBadge status={status} label={statusText} />
