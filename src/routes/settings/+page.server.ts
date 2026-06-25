import type { PageServerLoad, Actions } from './$types';
import { getAllCategories, getAllPaymentMethods, getAllAssetTags } from '$lib/server/db/queries';
import { getOrCreateUserPreferences } from '$lib/server/db/preference-queries';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { createRequestLogger } from '$lib/server/api-logger';
import {
	bills,
	billCycles,
	billPayments,
	rentalPaymentNotifications,
	categories,
	assetTags,
	paymentMethods,
	userPreferences
} from '$lib/server/db/schema';

interface ImportData {
	version: string;
	exportDate: string;
	data: {
		categories: any[];
		assetTags?: any[];
		bills: any[];
		billCycles: any[];
		billPayments: any[];
		rentalPaymentNotifications?: any[];
		paymentMethods?: any[];
		userPreferences?: any[];
	};
}

/**
 * Convert ISO date strings back to Date objects for Drizzle ORM
 * Drizzle with mode: 'timestamp' expects Date objects, not strings
 */
function convertDatesToObjects(data: any[]): any[] {
	return data.map((item) => {
		const converted = { ...item };
		for (const key in converted) {
			// Check if value is an ISO date string
			if (
				typeof converted[key] === 'string' &&
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(converted[key])
			) {
				converted[key] = new Date(converted[key]);
			}
		}
		return converted;
	});
}

export const load: PageServerLoad = async () => {
	const categoriesData = getAllCategories();
	const assetTagsData = getAllAssetTags();
	const paymentMethodsData = getAllPaymentMethods();
	const preferences = getOrCreateUserPreferences();

	return {
		categories: categoriesData,
		assetTags: assetTagsData,
		paymentMethods: paymentMethodsData,
		preferences
	};
};

export const actions: Actions = {
	importData: async (event) => {
		const logger = createRequestLogger(event, 'settings.import');
		try {
			const { request } = event;
			logger.info('request');
			const formData = await request.formData();
			const file = formData.get('file') as File;

			if (!file) {
				logger.warn('validation_failed', { reason: 'missing_file' });
				return fail(400, { error: 'No file provided' });
			}

			logger.info('file_received', { fileName: file.name, fileSize: file.size });

			// Read and parse the JSON file
			const content = await file.text();
			logger.info('file_read', { contentLength: content.length });
			let importData: ImportData;

			try {
				importData = JSON.parse(content);
				logger.info('json_parsed', { version: importData.version });
			} catch (error) {
				logger.warn('validation_failed', { reason: 'invalid_json', error });
				return fail(400, { error: 'Invalid JSON file' });
			}

			// Validate the data structure
			if (!importData.version || !importData.data) {
				logger.warn('validation_failed', { reason: 'invalid_backup_format' });
				return fail(400, { error: 'Invalid backup file format' });
			}

			// Clear existing data (in reverse order due to foreign key constraints)
			db.delete(rentalPaymentNotifications).run();
			db.delete(billPayments).run();
			db.delete(billCycles).run();
			db.delete(bills).run();
			db.delete(paymentMethods).run();
			db.delete(assetTags).run();
			db.delete(categories).run();
			db.delete(userPreferences).run();

			let importedCounts = {
				categories: 0,
				assetTags: 0,
				bills: 0,
				billCycles: 0,
				billPayments: 0,
				rentalPaymentNotifications: 0,
				paymentMethods: 0,
				userPreferences: 0
			};

			// Import data (in order to respect foreign key constraints)
			if (importData.data.categories?.length > 0) {
				const convertedCategories = convertDatesToObjects(importData.data.categories);
				db.insert(categories).values(convertedCategories).run();
				importedCounts.categories = importData.data.categories.length;
			}

			const importAssetTags = importData.data.assetTags ?? [];
			if (importAssetTags.length > 0) {
				const convertedAssetTags = convertDatesToObjects(importAssetTags);
				db.insert(assetTags).values(convertedAssetTags).run();
				importedCounts.assetTags = importAssetTags.length;
			}

			const importPaymentMethods = importData.data.paymentMethods ?? [];
			if (importPaymentMethods.length > 0) {
				const convertedPaymentMethods = convertDatesToObjects(importPaymentMethods);
				db.insert(paymentMethods).values(convertedPaymentMethods).run();
				importedCounts.paymentMethods = importPaymentMethods.length;
			}

			if (importData.data.bills?.length > 0) {
				const convertedBills = convertDatesToObjects(importData.data.bills);
				db.insert(bills).values(convertedBills).run();
				importedCounts.bills = importData.data.bills.length;
			}

			if (importData.data.billCycles?.length > 0) {
				const convertedBillCycles = convertDatesToObjects(importData.data.billCycles);
				db.insert(billCycles).values(convertedBillCycles).run();
				importedCounts.billCycles = importData.data.billCycles.length;
			}

			if (importData.data.billPayments?.length > 0) {
				const convertedBillPayments = convertDatesToObjects(importData.data.billPayments);
				db.insert(billPayments).values(convertedBillPayments).run();
				importedCounts.billPayments = importData.data.billPayments.length;
			}

			const importRentalPaymentNotifications = importData.data.rentalPaymentNotifications ?? [];
			if (importRentalPaymentNotifications.length > 0) {
				const convertedRentalPaymentNotifications = convertDatesToObjects(
					importRentalPaymentNotifications
				);
				db.insert(rentalPaymentNotifications).values(convertedRentalPaymentNotifications).run();
				importedCounts.rentalPaymentNotifications = importRentalPaymentNotifications.length;
			}

			const importUserPreferences = importData.data.userPreferences ?? [];
			if (importUserPreferences.length > 0) {
				const convertedPrefs = convertDatesToObjects(importUserPreferences);
				db.insert(userPreferences).values(convertedPrefs).run();
				importedCounts.userPreferences = importUserPreferences.length;
			}

			logger.audit('success', { importedCounts });

			return {
				success: true,
				message: 'Data imported successfully',
				imported: importedCounts
			};
		} catch (error) {
			logger.error('error', { error });
			return fail(500, {
				error: `Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	},

	resetData: async (event) => {
		const logger = createRequestLogger(event, 'settings.reset');
		try {
			const { request } = event;
			const formData = await request.formData();
			const confirmation = formData.get('confirmation');

			// Require explicit confirmation
			if (confirmation !== 'DELETE ALL DATA') {
				logger.warn('validation_failed', { reason: 'invalid_confirmation' });
				return fail(400, { error: 'Invalid confirmation. Please type "DELETE ALL DATA" exactly.' });
			}

			// Delete all data (in reverse order due to foreign key constraints)
			db.delete(rentalPaymentNotifications).run();
			db.delete(billPayments).run();
			db.delete(billCycles).run();
			db.delete(bills).run();
			db.delete(paymentMethods).run();
			db.delete(assetTags).run();
			db.delete(categories).run();
			db.delete(userPreferences).run();

			// Reset SQLite autoincrement sequences to start fresh
			db.run('DELETE FROM sqlite_sequence');

			logger.audit('success', { confirmation });

			return {
				success: true,
				message: 'All data has been deleted successfully'
			};
		} catch (error) {
			logger.error('error', { error });
			return fail(500, {
				error: `Failed to reset data: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	}
};
