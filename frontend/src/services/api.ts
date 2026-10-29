import { supabase } from './supabase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

interface RequestOptions extends RequestInit {
  data?: any;
}

export class ApiClient {
  private static async getAuthHeader(): Promise<Record<string, string>> {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch (e) {
      // Supabase unconfigured or offline
    }

    // Dev fallback token for testing
    return { Authorization: 'Bearer dev-mock-token' };
  }

  static async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const authHeaders = await this.getAuthHeader();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers as Record<string, string>),
    };

    const config: RequestInit = {
      ...options,
      headers,
    };

    if (options.data) {
      config.body = JSON.stringify(options.data);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // use default message
      }
      throw new Error(errorMessage);
    }

    const json = await response.json();
    return json.data !== undefined ? json.data : json;
  }

  static get<T = any>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  static post<T = any>(endpoint: string, data?: any, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'POST', data });
  }

  static patch<T = any>(endpoint: string, data?: any, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', data });
  }

  static delete<T = any>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}
