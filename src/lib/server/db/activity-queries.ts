import { desc } from 'drizzle-orm';
import { db } from './index';
import { activityLogs, type NewActivityLog } from './schema';

export function createActivityLog(data: NewActivityLog) {
	return db.insert(activityLogs).values(data).returning().get();
}

export function getRecentActivityLogs(limit = 200) {
	return db
		.select()
		.from(activityLogs)
		.orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
		.limit(limit)
		.all();
}
