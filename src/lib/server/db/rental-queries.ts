import { and, desc, eq } from 'drizzle-orm';
import { db } from './index';
import {
	assetTags,
	billPayments,
	bills,
	rentalPaymentNotifications,
	type AssetTag,
	type Bill,
	type BillPayment,
	type RentalPaymentNotification
} from './schema';

export type RentalPaymentWithNotification = BillPayment & {
	notification: RentalPaymentNotification | null;
};

export type RentalBillWithPayments = Bill & {
	payments: RentalPaymentWithNotification[];
};

export type RentalAssetSummary = AssetTag & {
	chargeableBillCount: number;
	recentPaymentCount: number;
};

export type RentalAssetDetail = {
	asset: AssetTag;
	bills: RentalBillWithPayments[];
};

export function mergeNotificationState(input: {
	isNotified: boolean;
	notifiedOn: Date | null;
}) {
	return {
		isNotified: input.isNotified,
		notifiedOn: input.isNotified ? input.notifiedOn : null
	};
}

export function groupBillsByAsset<TAsset extends { id: number }, TBill extends { assetTagId: number | null }>(
	asset: TAsset,
	billsForAsset: TBill[]
) {
	return {
		asset,
		bills: billsForAsset.filter((bill) => bill.assetTagId === asset.id)
	};
}

export function getRentalAssets(): RentalAssetSummary[] {
	const assets = db
		.select()
		.from(assetTags)
		.where(eq(assetTags.isRental, true))
		.orderBy(assetTags.name)
		.all();

	return assets.map((asset) => {
		const chargeableBills = db
			.select({ id: bills.id })
			.from(bills)
			.where(and(eq(bills.assetTagId, asset.id), eq(bills.chargeToTenant, true)))
			.all();
		const recentPaymentCount = chargeableBills.reduce((count, bill) => {
			const payments = db
				.select({ id: billPayments.id })
				.from(billPayments)
				.where(eq(billPayments.billId, bill.id))
				.orderBy(desc(billPayments.paymentDate), desc(billPayments.id))
				.limit(5)
				.all();
			return count + payments.length;
		}, 0);

		return {
			...asset,
			chargeableBillCount: chargeableBills.length,
			recentPaymentCount
		};
	});
}

export function getRentalAssetDetail(assetId: number): RentalAssetDetail | null {
	const asset = db
		.select()
		.from(assetTags)
		.where(and(eq(assetTags.id, assetId), eq(assetTags.isRental, true)))
		.get();

	if (!asset) return null;

	const chargeableBills = db
		.select()
		.from(bills)
		.where(and(eq(bills.assetTagId, asset.id), eq(bills.chargeToTenant, true)))
		.orderBy(bills.name)
		.all();

	const billsWithPayments = chargeableBills.map((bill) => {
		const payments = db
			.select()
			.from(billPayments)
			.where(eq(billPayments.billId, bill.id))
			.orderBy(desc(billPayments.paymentDate), desc(billPayments.id))
			.limit(5)
			.all();

		const paymentsWithNotifications = payments.map((payment) => {
			const notification = db
				.select()
				.from(rentalPaymentNotifications)
				.where(eq(rentalPaymentNotifications.paymentId, payment.id))
				.get() ?? null;

			return {
				...payment,
				notification
			};
		});

		return {
			...bill,
			payments: paymentsWithNotifications
		};
	});

	return {
		asset,
		bills: billsWithPayments
	};
}

export function getChargeableRentalPayment(paymentId: number) {
	return db
		.select({
			payment: billPayments,
			bill: bills,
			asset: assetTags
		})
		.from(billPayments)
		.innerJoin(bills, eq(billPayments.billId, bills.id))
		.innerJoin(assetTags, eq(bills.assetTagId, assetTags.id))
		.where(
			and(
				eq(billPayments.id, paymentId),
				eq(bills.chargeToTenant, true),
				eq(assetTags.isRental, true)
			)
		)
		.get();
}

export function upsertRentalPaymentNotification(input: {
	paymentId: number;
	isNotified: boolean;
	notifiedOn: Date | null;
}): RentalPaymentNotification {
	const normalized = mergeNotificationState({
		isNotified: input.isNotified,
		notifiedOn: input.notifiedOn
	});
	const existing = db
		.select()
		.from(rentalPaymentNotifications)
		.where(eq(rentalPaymentNotifications.paymentId, input.paymentId))
		.get();

	if (existing) {
		return db
			.update(rentalPaymentNotifications)
			.set({
				...normalized,
				updatedAt: new Date()
			})
			.where(eq(rentalPaymentNotifications.paymentId, input.paymentId))
			.returning()
			.get();
	}

	return db
		.insert(rentalPaymentNotifications)
		.values({
			paymentId: input.paymentId,
			...normalized
		})
		.returning()
		.get();
}
