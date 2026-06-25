import { getOrCreateUserPreferences } from '$lib/server/db/preference-queries';
import type { LayoutServerLoad } from './$types';
import packageJson from '../../package.json';

export const load: LayoutServerLoad = async () => {
	// Load theme preference from database on server side
	const preferences = getOrCreateUserPreferences();

	return {
		themePreference: preferences.themePreference,
		rentalManagementEnabled: preferences.rentalManagementEnabled,
		appVersion: packageJson.version
	};
};
