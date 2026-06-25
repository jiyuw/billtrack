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

test('settings and navigation expose rental controls conditionally', () => {
	const layoutServer = readFileSync(
		new URL('../../../../src/routes/+layout.server.ts', import.meta.url),
		'utf8'
	);
	const navigation = readFileSync(
		new URL('../../../../src/lib/components/Navigation.svelte', import.meta.url),
		'utf8'
	);
	const mobileNavigation = readFileSync(
		new URL('../../../../src/lib/components/MobileNavigation.svelte', import.meta.url),
		'utf8'
	);
	const settingsPage = readFileSync(
		new URL('../../../../src/routes/settings/+page.svelte', import.meta.url),
		'utf8'
	);
	const assetTagModal = readFileSync(
		new URL('../../../../src/lib/components/settings/AssetTagFormModal.svelte', import.meta.url),
		'utf8'
	);

	assert.match(layoutServer, /rentalManagementEnabled: preferences\.rentalManagementEnabled/);
	assert.match(navigation, /rentalManagementEnabled/);
	assert.match(navigation, /href: '\/rentals'/);
	assert.match(navigation, /const navItems = \$derived\.by/);
	assert.match(mobileNavigation, /grid-template-columns: repeat/);
	assert.match(mobileNavigation, /const navItems = \$derived\.by/);
	assert.match(settingsPage, /handleRentalManagementToggle/);
	assert.match(assetTagModal, /bind:checked=\{assetTagForm\.isRental\}/);
});

test('bill form exposes charge-to-tenant only for rental assets', () => {
	const billForm = readFileSync(
		new URL('../../../../src/lib/components/BillForm.svelte', import.meta.url),
		'utf8'
	);
	const dashboard = readFileSync(new URL('../../../../src/routes/+page.svelte', import.meta.url), 'utf8');
	const billDetail = readFileSync(
		new URL('../../../../src/routes/bills/[id]/+page.svelte', import.meta.url),
		'utf8'
	);

	assert.match(billForm, /const selectedAssetIsRental = \$derived\.by/);
	assert.match(billForm, /chargeToTenant: selectedAssetIsRental \? chargeToTenant : false/);
	assert.match(billForm, /Charge tenant for this bill/);
	assert.match(dashboard, /chargeToTenant: editingBill\.chargeToTenant/);
	assert.match(billDetail, /chargeToTenant: bill\.chargeToTenant/);
});

test('rentals page is wired to rental asset detail and notification rows', () => {
	const rentalPageServer = readFileSync(
		new URL('../../../../src/routes/rentals/+page.server.ts', import.meta.url),
		'utf8'
	);
	const rentalPage = readFileSync(
		new URL('../../../../src/routes/rentals/+page.svelte', import.meta.url),
		'utf8'
	);
	const notificationRow = readFileSync(
		new URL('../../../../src/lib/components/rentals/PaymentNotificationRow.svelte', import.meta.url),
		'utf8'
	);

	assert.match(rentalPageServer, /getRentalAssets/);
	assert.match(rentalPageServer, /getRentalAssetDetail/);
	assert.match(rentalPage, /RentalAssetSelector/);
	assert.match(rentalPage, /RentalBillGroup/);
	assert.match(notificationRow, /\/api\/rentals\/payments\/\$\{payment\.id\}\/notification/);
	assert.match(notificationRow, /notifiedOn/);
});

test('rental asset selector uses type-specific asset icons', () => {
	const rentalAssetSelector = readFileSync(
		new URL('../../../../src/lib/components/rentals/RentalAssetSelector.svelte', import.meta.url),
		'utf8'
	);

	assert.match(rentalAssetSelector, /import \{ Building2, Car, Home \} from 'lucide-svelte'/);
	assert.match(rentalAssetSelector, /asset\.type === 'vehicle' \? Car/);
	assert.match(rentalAssetSelector, /asset\.type === 'house' \? Home/);
	assert.match(rentalAssetSelector, /color: string \| null/);
	assert.match(rentalAssetSelector, /getAssetColor\(asset\)/);
	assert.match(rentalAssetSelector, /background-color: \{assetColor\}20; color: \{assetColor\}/);
	assert.doesNotMatch(rentalAssetSelector, /bg-blue-50|bg-blue-950/);
});

test('rental management toggle invalidates only layout preferences', () => {
	const layoutServer = readFileSync(
		new URL('../../../../src/routes/+layout.server.ts', import.meta.url),
		'utf8'
	);
	const settingsPage = readFileSync(
		new URL('../../../../src/routes/settings/+page.svelte', import.meta.url),
		'utf8'
	);
	const rentalToggleHandler = settingsPage.match(
		/async function handleRentalManagementToggle\(\) \{[\s\S]*?\n\t\}/
	)?.[0];

	assert.match(layoutServer, /depends\('app:preferences'\)/);
	assert.ok(rentalToggleHandler, 'Expected handleRentalManagementToggle to exist');
	assert.doesNotMatch(rentalToggleHandler, /invalidateAll\(\)/);
	assert.match(rentalToggleHandler, /invalidate\('app:preferences'\)/);
});
