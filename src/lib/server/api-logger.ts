import type { RequestEvent } from '@sveltejs/kit';
import { createActivityLog } from '$lib/server/db/activity-queries';

export type LogLevel = 'info' | 'warn' | 'error';

type Serializable = Record<string, unknown>;

function redactValue(key: string, value: unknown): unknown {
	if (value === undefined) return undefined;

	const lowerKey = key.toLowerCase();
	if (lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret')) {
		return '[REDACTED]';
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack
		};
	}

	if (Array.isArray(value)) {
		return value.map((item) => redactValue(key, item));
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([entryKey, entryValue]) => [
				entryKey,
				redactValue(entryKey, entryValue)
			])
		);
	}

	return value;
}

function sanitize(details: Serializable = {}): Serializable {
	return Object.fromEntries(
		Object.entries(details)
			.map(([key, value]) => [key, redactValue(key, value)])
			.filter(([, value]) => value !== undefined)
	);
}

function writeLog(level: LogLevel, payload: Serializable) {
	const message = `[app] ${JSON.stringify(payload)}`;

	if (level === 'error') {
		console.error(message);
		return;
	}

	if (level === 'warn') {
		console.warn(message);
		return;
	}

	console.info(message);
}

function inferEntityType(eventName: string): string | null {
	const entityType = eventName.split('.')[0];
	return entityType || null;
}

function inferEntityId(entityType: string | null, details: Serializable): string | null {
	if (!entityType) return null;

	const keyMap: Record<string, string> = {
		bill: 'billId',
		payment: 'paymentId',
		category: 'categoryId',
		asset_tag: 'assetTagId',
		payment_method: 'paymentMethodId',
		preferences: 'preferenceId',
		settings: 'requestId',
		export: 'requestId'
	};

	const key = keyMap[entityType];
	if (!key) return null;

	const value = details[key];
	if (value === undefined || value === null) return null;
	return String(value);
}

function shouldPersist(level: LogLevel, details: Serializable): boolean {
	return details.logType === 'audit' || level === 'warn' || level === 'error';
}

function persistActivityLog(level: LogLevel, event: string, details: Serializable) {
	if (!shouldPersist(level, details)) return;

	try {
		const entityType = inferEntityType(event);
		const entityId = inferEntityId(entityType, details);

		createActivityLog({
			level,
			event,
			logType: typeof details.logType === 'string' ? details.logType : 'activity',
			requestId: typeof details.requestId === 'string' ? details.requestId : null,
			method: typeof details.method === 'string' ? details.method : null,
			path: typeof details.path === 'string' ? details.path : null,
			routeId: typeof details.routeId === 'string' ? details.routeId : null,
			entityType,
			entityId,
			details: JSON.stringify(details)
		});
	} catch (error) {
		console.error(
			`[app] ${JSON.stringify({
				timestamp: new Date().toISOString(),
				event: 'activity_log.persist_error',
				error: redactValue('error', error)
			})}`
		);
	}
}

function getClientIp(event: RequestEvent): string | null {
	try {
		return event.getClientAddress();
	} catch {
		return event.request.headers.get('x-forwarded-for');
	}
}

export function logApiEvent(level: LogLevel, event: string, details: Serializable = {}) {
	const payload = {
		timestamp: new Date().toISOString(),
		event,
		...sanitize(details)
	};

	writeLog(level, payload);
	persistActivityLog(level, event, payload);
}

export function createRequestLogger(event: RequestEvent, namespace: string) {
	const context = sanitize({
		requestId: event.locals.requestId,
		method: event.request.method,
		path: event.url.pathname,
		routeId: event.route.id,
		ip: getClientIp(event),
		userAgent: event.request.headers.get('user-agent')
	});

	return {
		requestId: event.locals.requestId,
		info(action: string, details: Serializable = {}) {
			logApiEvent('info', `${namespace}.${action}`, {
				...context,
				...sanitize(details)
			});
		},
		warn(action: string, details: Serializable = {}) {
			logApiEvent('warn', `${namespace}.${action}`, {
				...context,
				...sanitize(details)
			});
		},
		error(action: string, details: Serializable = {}) {
			logApiEvent('error', `${namespace}.${action}`, {
				...context,
				...sanitize(details)
			});
		},
		audit(action: string, details: Serializable = {}) {
			logApiEvent('info', `${namespace}.${action}`, {
				...context,
				logType: 'audit',
				...sanitize(details)
			});
		}
	};
}
