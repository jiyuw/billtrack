import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCategoryById, updateCategory, deleteCategory } from '$lib/server/db/queries';
import { createRequestLogger } from '$lib/server/api-logger';

// GET /api/categories/[id] - Get a single category
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'category.get');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		const category = getCategoryById(id);

		if (!category) {
			logger.warn('not_found', { categoryId: id });
			return json({ error: 'Category not found' }, { status: 404 });
		}

		logger.info('success', { categoryId: id });
		return json(category);
	} catch (error) {
		logger.error('error', { categoryId: event.params.id, error });
		return json({ error: 'Failed to fetch category' }, { status: 500 });
	}
};

// PUT /api/categories/[id] - Update a category
export const PUT: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'category.update');
	try {
		const { params, request } = event;
		const id = parseInt(params.id);
		const data = await request.json();
		const before = getCategoryById(id);
		logger.info('request', { categoryId: id, body: data });

		const updateData: any = {
			name: data.name,
			color: data.color,
			icon: data.icon
		};

		// Remove undefined values
		Object.keys(updateData).forEach(
			(key) => updateData[key] === undefined && delete updateData[key]
		);

		const category = updateCategory(id, updateData);

		if (!category) {
			logger.warn('not_found', { categoryId: id, updateData });
			return json({ error: 'Category not found' }, { status: 404 });
		}

		logger.audit('success', {
			categoryId: id,
			before,
			after: category
		});
		return json(category);
	} catch (error) {
		logger.error('error', { categoryId: event.params.id, error });
		return json({ error: 'Failed to update category' }, { status: 500 });
	}
};

// DELETE /api/categories/[id] - Delete a category
export const DELETE: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'category.delete');
	try {
		const { params } = event;
		const id = parseInt(params.id);
		const category = deleteCategory(id);

		if (!category) {
			logger.warn('not_found', { categoryId: id });
			return json({ error: 'Category not found' }, { status: 404 });
		}

		logger.audit('success', { categoryId: id, deleted: category });
		return json({ success: true });
	} catch (error) {
		logger.error('error', { categoryId: event.params.id, error });
		return json({ error: 'Failed to delete category' }, { status: 500 });
	}
};
