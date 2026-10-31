export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** Error thrown for non-2xx API responses; carries per-field messages when the API returns them. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiRequest = <T>(path: string, options?: RequestInit, businessId?: string) => Promise<T>;

export function createApiRequest(token: string): ApiRequest {
  return async function apiRequest<T>(path: string, options: RequestInit = {}, businessId?: string): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (businessId) headers.set("x-business-id", businessId);
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch {
      throw new ApiError("Cannot reach the NexBill API. Check that the server is running and try again.", 0);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fallback = response.status === 403 ? "You don't have permission to do this." : `Request failed (${response.status})`;
      throw new ApiError(data.error ?? data.message ?? fallback, response.status, data.fieldErrors);
    }
    return data as T;
  };
}
