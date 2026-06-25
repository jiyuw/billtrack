import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { formatDateForInput } from '$lib/utils/dates';
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

export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'export.generate');
	try {
		// Export all data
		const exportData = {
			version: '1.0',
			exportDate: new Date().toISOString(),
			data: {
				categories: db.select().from(categories).all(),
				assetTags: db.select().from(assetTags).all(),
				bills: db.select().from(bills).all(),
				billCycles: db.select().from(billCycles).all(),
				billPayments: db.select().from(billPayments).all(),
				rentalPaymentNotifications: db.select().from(rentalPaymentNotifications).all(),
				paymentMethods: db.select().from(paymentMethods).all(),
				userPreferences: db.select().from(userPreferences).all()
			}
		};

		// Create filename with timestamp
		const filename = `billtrack-backup-${formatDateForInput(new Date())}.json`;

		logger.audit('success', {
			filename,
			counts: {
				categories: exportData.data.categories.length,
				assetTags: exportData.data.assetTags.length,
				bills: exportData.data.bills.length,
				billCycles: exportData.data.billCycles.length,
				billPayments: exportData.data.billPayments.length,
				rentalPaymentNotifications: exportData.data.rentalPaymentNotifications.length,
				paymentMethods: exportData.data.paymentMethods.length,
				userPreferences: exportData.data.userPreferences.length
			}
		});

		// Return as downloadable JSON file
		return new Response(JSON.stringify(exportData, null, 2), {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to export data' }, { status: 500 });
	}
};
