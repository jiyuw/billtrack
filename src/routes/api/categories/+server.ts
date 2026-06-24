import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllCategories, createCategory } from '$lib/server/db/queries';
import { createRequestLogger } from '$lib/server/api-logger';

// GET /api/categories - Get all categories
export const GET: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'categories.list');
	try {
		const categories = getAllCategories();
		logger.info('success', { count: categories.length });
		return json(categories);
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to fetch categories' }, { status: 500 });
	}
};

// POST /api/categories - Create a new category
export const POST: RequestHandler = async (event) => {
	const logger = createRequestLogger(event, 'category.create');
	try {
		const { request } = event;
		const data = await request.json();
		logger.info('request', {
			name: data.name,
			color: data.color,
			icon: data.icon ?? null
		});

		const newCategory = {
			name: data.name,
			color: data.color,
			icon: data.icon || null
		};

		const category = createCategory(newCategory);
		logger.audit('success', { categoryId: category.id, category });
		return json(category);
	} catch (error) {
		logger.error('error', { error });
		return json({ error: 'Failed to create category' }, { status: 500 });
	}
};
