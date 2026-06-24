import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { formatDateForInput } from '$lib/utils/dates';
import {
	bills,
	billCycles,
	billPayments,
	categories,
	assetTags,
	paymentMethods,
	userPreferences
} from '$lib/server/db/schema';

export const GET: RequestHandler = async () => {
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
				paymentMethods: db.select().from(paymentMethods).all(),
				userPreferences: db.select().from(userPreferences).all()
			}
		};

		// Create filename with timestamp
		const filename = `billtrack-backup-${formatDateForInput(new Date())}.json`; 

		// Return as downloadable JSON file
		return new Response(JSON.stringify(exportData, null, 2), {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error) {
		console.error('Export error:', error);
		return json({ error: 'Failed to export data' }, { status: 500 });
	}
};
