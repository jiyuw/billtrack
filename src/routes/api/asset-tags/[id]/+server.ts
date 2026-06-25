import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAssetTagById, updateAssetTag, deleteAssetTag } from '$lib/server/db/queries';
import type { NewAssetTag } from '$lib/server/db/schema';
import { createRequestLogger } from '$lib/server/api-logger';

// GET /api/asset-tags/[id]
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'asset_tag.get');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		const tag = getAssetTagById(id);

		if (!tag) {
			logger.warn('not_found', { assetTagId: id });
			return json({ error: 'Asset tag not found' }, { status: 404 });
		}

		logger.info('success', { assetTagId: id });
		return json(tag);
	} catch (error) {
		logger.error('error', { assetTagId: event.params.id, error });
		return json({ error: 'Failed to fetch asset tag' }, { status: 500 });
	}
};

// PUT /api/asset-tags/[id]
export const PUT: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'asset_tag.update');
	try {
		const { params, request } = event;
		const id = parseInt(params.id);
		const data = await request.json();
		const before = getAssetTagById(id);
		logger.info('request', { assetTagId: id, body: data });

		const updateData: Partial<NewAssetTag> = {
			name: data.name,
			type: data.type ?? null,
			isRental: typeof data.isRental === 'boolean' ? data.isRental : undefined,
			color: data.color ?? null,
			bannerPattern: data.bannerPattern ?? 'solid'
		};

		Object.keys(updateData).forEach(
			(key) => updateData[key as keyof NewAssetTag] === undefined && delete updateData[key as keyof NewAssetTag]
		);

		const tag = updateAssetTag(id, updateData);
		if (!tag) {
			logger.warn('not_found', { assetTagId: id, updateData });
			return json({ error: 'Asset tag not found' }, { status: 404 });
		}

		logger.audit('success', {
			assetTagId: id,
			before,
			after: tag
		});
		return json(tag);
	} catch (error) {
		logger.error('error', { assetTagId: event.params.id, error });
		return json({ error: 'Failed to update asset tag' }, { status: 500 });
	}
};

// DELETE /api/asset-tags/[id]
export const DELETE: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'asset_tag.delete');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		const tag = deleteAssetTag(id);

		if (!tag) {
			logger.warn('not_found', { assetTagId: id });
			return json({ error: 'Asset tag not found' }, { status: 404 });
		}

		logger.audit('success', { assetTagId: id, deleted: tag });
		return json({ success: true });
	} catch (error) {
		logger.error('error', { assetTagId: event.params.id, error });
		return json({ error: 'Failed to delete asset tag' }, { status: 500 });
	}
};
