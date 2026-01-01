/**
 * Datalake HTTP Client
 * Handles HTTP requests to any datalake with authentication
 */

import type { Datalake } from '../../repositories/interfaces/IDatalakeRepository';
import type { Logger } from '../../logging/logger';

export class DatalakeHttpClient {
  constructor(private logger?: Logger) {}

  /**
   * Build request URL based on datalake configuration
   */
  private buildUrl(
    datalake: Datalake,
    endpointPath: string,
    params: Record<string, string>
  ): string {
    // Remove leading slash from endpoint path if present
    const cleanPath = endpointPath.startsWith('/') ? endpointPath.slice(1) : endpointPath;
    
    // Build base URL
    const baseUrl = datalake.baseUrl.endsWith('/') 
      ? datalake.baseUrl.slice(0, -1) 
      : datalake.baseUrl;
    
    let url = `${baseUrl}/${cleanPath}`;

    // Replace path parameters (e.g., {symbol} in /historical-price-full/{symbol})
    const pathParams = endpointPath.match(/\{(\w+)\}/g);
    if (pathParams) {
      for (const param of pathParams) {
        const paramName = param.slice(1, -1); // Remove { and }
        const paramValue = params[paramName];
        if (paramValue) {
          url = url.replace(param, encodeURIComponent(paramValue));
          // Remove from params so it's not added as query param
          delete params[paramName];
        }
      }
    }

    // Build query string
    const queryParams = new URLSearchParams();

    // Add authentication based on auth type
    if (datalake.authType === 'query_param' && datalake.apiKey) {
      queryParams.append(datalake.authKeyName, datalake.apiKey);
    }

    // Add other query parameters
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value);
      }
    }

    const queryString = queryParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    return url;
  }

  /**
   * Build request headers based on datalake configuration
   */
  private buildHeaders(datalake: Datalake): HeadersInit {
    const headers: HeadersInit = {
      'Accept': 'application/json',
    };

    // Add authentication header if needed
    if (datalake.authType === 'header' && datalake.apiKey) {
      headers[datalake.authKeyName] = datalake.apiKey;
    }

    return headers;
  }

  /**
   * Fetch data from datalake
   * 
   * @param endpointPath - The endpoint path (e.g., '/quote', '/profile/{symbol}')
   * @param params - Query parameters and path parameters
   * @param datalake - Datalake configuration
   * @returns Response from the datalake
   */
  async fetch(
    endpointPath: string,
    params: Record<string, string>,
    datalake: Datalake
  ): Promise<Response> {
    const url = this.buildUrl(datalake, endpointPath, params);
    const headers = this.buildHeaders(datalake);

    this.logger?.info(`Fetching from datalake: ${datalake.name}`, {
      url: url.replace(datalake.apiKey || '', '***'),
      endpointPath,
    });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        // 30 second timeout
        signal: AbortSignal.timeout(30000),
      });

      // Handle rate limiting
      if (response.status === 429) {
        throw new Error(`Rate limit exceeded for datalake: ${datalake.name}`);
      }

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication failed for datalake: ${datalake.name}`);
      }

      // Handle server errors
      if (response.status >= 500) {
        throw new Error(`Server error from datalake: ${datalake.name} (HTTP ${response.status})`);
      }

      // Handle 404 as "no data available" (valid response for some endpoints)
      if (response.status === 404) {
        this.logger?.info(`Datalake returned 404 (no data available): ${datalake.name}`);
        return response; // Return the response, let caller handle it
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }

      return response;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new Error(`Request timeout for datalake: ${datalake.name}`);
      }
      
      this.logger?.error(`Failed to fetch from datalake: ${datalake.name}`, error);
      throw error;
    }
  }

  /**
   * Fetch JSON data from datalake
   * 
   * @param endpointPath - The endpoint path
   * @param params - Query parameters and path parameters
   * @param datalake - Datalake configuration
   * @returns Parsed JSON response
   */
  async fetchJson<T = any>(
    endpointPath: string,
    params: Record<string, string>,
    datalake: Datalake
  ): Promise<T> {
    const response = await this.fetch(endpointPath, params, datalake);

    // Handle 404 as empty array for some endpoints
    if (response.status === 404) {
      return [] as T;
    }

    const data = await response.json();

    // Check for error messages in response
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if ('Error Message' in data || 'error' in data) {
        const errorMsg = data['Error Message'] || data.error || JSON.stringify(data);
        throw new Error(`Datalake error: ${errorMsg}`);
      }
    }

    return data;
  }
}

