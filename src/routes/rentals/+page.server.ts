import type { PageServerLoad } from './$types';
import { getRentalAssetDetail, getRentalAssets } from '$lib/server/db/rental-queries';

export const load: PageServerLoad = async ({ url }) => {
	const assets = getRentalAssets();
	const requestedAssetId = Number.parseInt(url.searchParams.get('asset') ?? '', 10);
	const selectedAssetId = Number.isNaN(requestedAssetId) ? assets[0]?.id : requestedAssetId;
	const selectedAsset = selectedAssetId ? getRentalAssetDetail(selectedAssetId) : null;

	return {
		assets,
		selectedAsset
	};
};
