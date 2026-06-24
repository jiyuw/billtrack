import type { PageServerLoad } from './$types';
import { getRecentActivityLogs } from '$lib/server/db/activity-queries';

function parseDetails(details: string | null) {
	if (!details) return null;

	try {
		return JSON.parse(details);
	} catch {
		return { raw: details };
	}
}

export const load: PageServerLoad = async () => {
	const rawLogs = getRecentActivityLogs(200);
	const logs = rawLogs.map((log) => ({
		...log,
		parsedDetails: parseDetails(log.details)
	}));

	const summary = logs.reduce(
		(acc, log) => {
			acc.total += 1;
			if (log.level === 'error') acc.errors += 1;
			if (log.level === 'warn') acc.warnings += 1;
			if (log.logType === 'audit') acc.audits += 1;
			return acc;
		},
		{ total: 0, errors: 0, warnings: 0, audits: 0 }
	);

	return {
		logs,
		summary
	};
};
