import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schemaModule = await import(new URL('./schema.ts', import.meta.url).href);
const {
	userPreferences,
	assetTags,
	bills,
	rentalPaymentNotifications
} = schemaModule;

test('rental schema exposes the new preference, asset, bill, and notification fields', () => {
	assert.equal(userPreferences.rentalManagementEnabled.name, 'rental_management_enabled');
	assert.equal(assetTags.isRental.name, 'is_rental');
	assert.equal(bills.chargeToTenant.name, 'charge_to_tenant');
	assert.equal(rentalPaymentNotifications.isNotified.name, 'is_notified');
	assert.equal(rentalPaymentNotifications.notifiedOn.name, 'notified_on');
});

test('fresh-db migration SQL includes the rental schema additions', () => {
	const migrationSql = readFileSync(
		new URL('../../../../drizzle/migrations/0000_initial.sql', import.meta.url),
		'utf8'
	);

	assert.match(migrationSql, /`is_rental` integer DEFAULT false NOT NULL/);
	assert.match(migrationSql, /`charge_to_tenant` integer DEFAULT false NOT NULL/);
	assert.match(migrationSql, /`rental_management_enabled` integer DEFAULT false NOT NULL/);
	assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS `rental_payment_notifications`/);
});

test('backup and reset flows include rental payment notifications', () => {
	const exportRoute = readFileSync(
		new URL('../../../../src/routes/api/export/+server.ts', import.meta.url),
		'utf8'
	);
	const settingsPage = readFileSync(
		new URL('../../../../src/routes/settings/+page.server.ts', import.meta.url),
		'utf8'
	);
	const resetScript = readFileSync(
		new URL('../../../../scripts/reset-db.ts', import.meta.url),
		'utf8'
	);

	assert.match(exportRoute, /rentalPaymentNotifications/);
	assert.match(settingsPage, /rentalPaymentNotifications/);
	assert.match(resetScript, /rental_payment_notifications/);
});
