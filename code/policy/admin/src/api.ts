/** Typed fetch wrapper. `credentials: 'include'` carries the HttpOnly session
 *  cookie the admin login sets — the console never holds a token itself. */
async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) throw new Error('unauthorised');
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  get: <T,>(path: string) => call<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => call<T>('POST', path, body),
};

export type Tool = {
  llm_id: string; host: string; display_name: string;
  status: 'approved' | 'blocked';
};
export type TokenRow = {
  id: string; department: string; label: string; created_at: string; revoked: number;
};
export type RequestRow = {
  id: string; reason: string; status: 'pending' | 'approved' | 'denied';
  created_at: string; department: string; display_name: string;
  host: string; llm_id: string;
};
export type Usage = {
  by_department: { department: string; events: number }[];
  by_tool: { host: string; events: number }[];
  by_category: { category: string; events: number }[];
};
