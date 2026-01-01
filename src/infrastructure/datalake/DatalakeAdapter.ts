/**
 * Datalake Adapter Interface
 * Defines the contract for datalake adapters that normalize responses from different datalakes
 */

export interface DatalakeAdapter {
  /**
   * Fetch data from the datalake
   * 
   * @param endpointPath - The endpoint path (e.g., '/quote', '/profile/{symbol}')
   * @param params - Query parameters and path parameters
   * @returns Parsed JSON response
   */
  fetch<T = any>(endpointPath: string, params: Record<string, string>): Promise<T>;
}

