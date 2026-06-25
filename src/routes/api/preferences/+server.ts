import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	updateUserPreferences,
	getOrCreateUserPreferences
} from '$lib/server/db/preference-queries';
import { createRequestLogger } from '$lib/server/api-logger';

// GET /api/preferences - Get user preferences
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'preferences.get');
	try {
		const preferences = getOrCreateUserPreferences();
		logger.info('success', { preferenceId: preferences.id });
		return json(preferences);
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to fetch user preferences' }, { status: 500 });
	}
};

// PUT /api/preferences - Update user preferences
export const PUT: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'preferences.update');
	try {
		const { request } = event;
		const data = await request.json();
		logger.info('request', { body: data });

		// Validate theme preference if provided
		if (data.themePreference && !['light', 'dark', 'system'].includes(data.themePreference)) {
			logger.warn('validation_failed', {
				reason: 'invalid_theme_preference',
				themePreference: data.themePreference
			});
			return json(
				{ error: 'Invalid theme preference. Must be "light", "dark", or "system"' },
				{ status: 400 }
			);
		}

		if (
			data.rentalManagementEnabled !== undefined &&
			typeof data.rentalManagementEnabled !== 'boolean'
		) {
			logger.warn('validation_failed', {
				reason: 'invalid_rental_management_enabled',
				rentalManagementEnabled: data.rentalManagementEnabled
			});
			return json(
				{ error: 'Invalid rentalManagementEnabled. Must be a boolean' },
				{ status: 400 }
			);
		}

		// Get or create preferences
		const existing = getOrCreateUserPreferences();

		// Update preferences
		const updated = updateUserPreferences(existing.id, {
			themePreference: data.themePreference,
			rentalManagementEnabled: data.rentalManagementEnabled
		});

		logger.audit('success', {
			preferenceId: existing.id,
			before: existing,
			after: updated
		});
		return json(updated);
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to update user preferences' }, { status: 500 });
	}
};
