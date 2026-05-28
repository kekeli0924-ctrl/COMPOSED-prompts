import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on all routes EXCEPT Next internals, static files, and /api/*
    // (the latter are rewritten to the Fly backend, which self-verifies).
    '/((?!_next|api|.*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|woff2?|ttf)).*)',
  ],
};
