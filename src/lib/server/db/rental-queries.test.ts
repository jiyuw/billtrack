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

test('preference defaults and bill query projections include rental fields', () => {
	const preferenceQueries = readFileSync(new URL('./preference-queries.ts', import.meta.url), 'utf8');
	const queries = readFileSync(new URL('./queries.ts', import.meta.url), 'utf8');

	assert.match(
		preferenceQueries,
		/createUserPreferences\(\{\s*themePreference: 'system',\s*rentalManagementEnabled: false\s*\}\)/
	);
	assert.match(queries, /chargeToTenant: bills\.chargeToTenant/);
	assert.match(queries, /isRental: assetTags\.isRental/);
});

test('preferences API validates and persists rentalManagementEnabled', () => {
	const preferencesRoute = readFileSync(
		new URL('../../../../src/routes/api/preferences/+server.ts', import.meta.url),
		'utf8'
	);

	assert.match(preferencesRoute, /typeof data\.rentalManagementEnabled !== 'boolean'/);
	assert.match(preferencesRoute, /rentalManagementEnabled: data\.rentalManagementEnabled/);
});

test('asset tag APIs map isRental in create and update payloads', () => {
	const createRoute = readFileSync(
		new URL('../../../../src/routes/api/asset-tags/+server.ts', import.meta.url),
		'utf8'
	);
	const updateRoute = readFileSync(
		new URL('../../../../src/routes/api/asset-tags/[id]/+server.ts', import.meta.url),
		'utf8'
	);

	assert.match(createRoute, /isRental: data\.isRental === true/);
	assert.match(updateRoute, /isRental: typeof data\.isRental === 'boolean' \? data\.isRental : undefined/);
});

test('bill APIs map chargeToTenant and force it off for non-rental assets', () => {
	const createRoute = readFileSync(
		new URL('../../../../src/routes/api/bills/+server.ts', import.meta.url),
		'utf8'
	);
	const updateRoute = readFileSync(
		new URL('../../../../src/routes/api/bills/[id]/+server.ts', import.meta.url),
		'utf8'
	);

	assert.match(createRoute, /getAssetTagById/);
	assert.match(createRoute, /chargeToTenant:/);
	assert.match(createRoute, /selectedAsset\?\.isRental && data\.chargeToTenant === true/);
	assert.match(updateRoute, /getAssetTagById/);
	assert.match(updateRoute, /updateData\.chargeToTenant =/);
	assert.match(updateRoute, /selectedAsset\?\.isRental && requestedChargeToTenant/);
});

test('rental query and api files expose notification helpers', () => {
	const rentalQueries = readFileSync(new URL('./rental-queries.ts', import.meta.url), 'utf8');
	const notificationRoute = readFileSync(
		new URL('../../../../src/routes/api/rentals/payments/[id]/notification/+server.ts', import.meta.url),
		'utf8'
	);

	assert.match(rentalQueries, /export function mergeNotificationState/);
	assert.match(rentalQueries, /export function getRentalAssets/);
	assert.match(rentalQueries, /export function getRentalAssetDetail/);
	assert.match(rentalQueries, /export function upsertRentalPaymentNotification/);
	assert.match(notificationRoute, /notifiedOn is required when notifying a payment/);
	assert.match(notificationRoute, /getChargeableRentalPayment/);
});
