import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllAssetTags, createAssetTag } from '$lib/server/db/queries';
import type { NewAssetTag } from '$lib/server/db/schema';
import { createRequestLogger } from '$lib/server/api-logger';

// GET /api/asset-tags
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'asset_tags.list');
	try {
		const tags = getAllAssetTags();
		logger.info('success', { count: tags.length });
		return json(tags);
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to fetch asset tags' }, { status: 500 });
	}
};

// POST /api/asset-tags
export const POST: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'asset_tag.create');
	try {
		const { request } = event;
		const data = await request.json();
		logger.info('request', {
			name: data.name,
			type: data.type ?? null,
			color: data.color ?? null,
			bannerPattern: data.bannerPattern ?? 'solid'
		});
		if (!data.name) {
			logger.warn('validation_failed', { reason: 'missing_required_fields' });
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		const newTag: NewAssetTag = {
			name: data.name,
			type: data.type || null,
			color: data.color || null,
			bannerPattern: data.bannerPattern || 'solid'
		};

		const tag = createAssetTag(newTag);
		logger.audit('success', { assetTagId: tag.id, assetTag: tag });
		return json(tag, { status: 201 });
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to create asset tag' }, { status: 500 });
	}
};
