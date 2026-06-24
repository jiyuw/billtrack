import type { Handle } from '@sveltejs/kit';
import { logApiEvent } from '$lib/server/api-logger';

function shouldLogRequest(pathname: string) {
	return !pathname.startsWith('/_app/') && pathname !== '/favicon.ico';
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = crypto.randomUUID();

	const start = performance.now();
	const pathname = event.url.pathname;
	const shouldLog = shouldLogRequest(pathname);

	if (shouldLog) {
		logApiEvent('info', 'request.start', {
			requestId: event.locals.requestId,
			method: event.request.method,
			path: pathname,
			routeId: event.route.id,
			search: event.url.search
		});
	}

	try {
		const response = await resolve(event);

		if (shouldLog) {
			logApiEvent('info', 'request.complete', {
				requestId: event.locals.requestId,
				method: event.request.method,
				path: pathname,
				routeId: event.route.id,
				status: response.status,
				durationMs: Math.round(performance.now() - start)
			});
		}

		return response;
	} catch (error) {
		if (shouldLog) {
			logApiEvent('error', 'request.unhandled_error', {
				requestId: event.locals.requestId,
				method: event.request.method,
				path: pathname,
				routeId: event.route.id,
				durationMs: Math.round(performance.now() - start),
				error
			});
		}

		throw error;
	}
};
