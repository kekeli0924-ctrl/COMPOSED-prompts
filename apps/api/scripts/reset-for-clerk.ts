import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db.js';

// All existing users/generations are throwaway test data. Clearing the users
// table (cascading to generations/feedback/user_profiles/sessions) lets the
// new NOT NULL clerk_user_id column be added to an empty table.
await db.execute(sql`TRUNCATE users CASCADE`);
console.log('cleared users (cascade) for Clerk migration');
process.exit(0);
