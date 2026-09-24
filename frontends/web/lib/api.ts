import { createApiClient, MedRushApi } from '@medrush/shared';

/**
 * Base URL of the Express API. Configure via NEXT_PUBLIC_API_BASE_URL.
 * An empty value means "same origin": the site proxies /api/* (next.config.mjs).
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5000';

/**
 * A browser/SSR API client. Auth cookies (httpOnly) are sent automatically via
 * credentials: 'include'; a bearer token can be layered in later for the app.
 */
export const api: MedRushApi = createApiClient({
  baseUrl: API_BASE_URL,
  credentials: 'include'
});
