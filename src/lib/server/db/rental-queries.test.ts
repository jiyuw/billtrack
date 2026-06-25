import test from 'node:test';
import assert from 'node:assert/strict';

// Node's test runner resolves the local TypeScript module with its explicit extension here.
// @ts-ignore allowImportingTsExtensions is not enabled for the app tsconfig.
import {
	userPreferences,
	assetTags,
	bills,
	rentalPaymentNotifications
} from './schema.ts';

test('rental schema exposes the new preference, asset, bill, and notification fields', () => {
	assert.equal(userPreferences.rentalManagementEnabled.name, 'rental_management_enabled');
	assert.equal(assetTags.isRental.name, 'is_rental');
	assert.equal(bills.chargeToTenant.name, 'charge_to_tenant');
	assert.equal(rentalPaymentNotifications.isNotified.name, 'is_notified');
	assert.equal(rentalPaymentNotifications.notifiedOn.name, 'notified_on');
});
