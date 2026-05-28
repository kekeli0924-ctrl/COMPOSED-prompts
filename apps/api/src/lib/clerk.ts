import { createClerkClient } from '@clerk/backend';

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  throw new Error('CLERK_SECRET_KEY is required');
}

export const clerkClient = createClerkClient({ secretKey });
