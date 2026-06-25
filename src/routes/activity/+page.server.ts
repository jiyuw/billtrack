import type { PageServerLoad } from './$types';
import { getRecentActivityLogs } from '$lib/server/db/activity-queries';

const DEFAULT_ACTIVITY_LIMIT = 50;
const MAX_ACTIVITY_LIMIT = 200;

function parseDetails(details: string | null) {
	if (!details) return null;

	try {
		return JSON.parse(details);
	} catch {
		return { raw: details };
	}
}

export const load: PageServerLoad = async ({ url }) => {
	const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
	const limit = Number.isNaN(requestedLimit)
		? DEFAULT_ACTIVITY_LIMIT
		: Math.min(Math.max(requestedLimit, DEFAULT_ACTIVITY_LIMIT), MAX_ACTIVITY_LIMIT);
	const rawLogs = getRecentActivityLogs(limit);
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
		summary,
		limit,
		nextLimit: Math.min(limit + DEFAULT_ACTIVITY_LIMIT, MAX_ACTIVITY_LIMIT),
		hasMore: logs.length >= limit && limit < MAX_ACTIVITY_LIMIT
	};
};
