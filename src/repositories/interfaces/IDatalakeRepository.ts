/**
 * Datalake Repository Interface
 * Defines methods for managing datalakes, API endpoints, and their mappings
 */

export interface Datalake {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string | null;
  authType: 'query_param' | 'header' | 'none';
  authKeyName: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ApiEndpoint {
  id: string;
  name: string;
  description: string | null;
  endpointPath: string;
  httpMethod: string;
  requiresSymbol: boolean;
  createdAt: number;
}

export interface DatalakeApiMapping {
  id: string;
  apiEndpointId: string;
  datalakeId: string;
  isSelected: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateDatalakeInput {
  name: string;
  baseUrl: string;
  apiKey?: string | null;
  authType?: 'query_param' | 'header' | 'none';
  authKeyName?: string;
  isActive?: boolean;
}

export interface UpdateDatalakeInput {
  name?: string;
  baseUrl?: string;
  apiKey?: string | null;
  authType?: 'query_param' | 'header' | 'none';
  authKeyName?: string;
  isActive?: boolean;
}

export interface IDatalakeRepository {
  getDatalake(id: string): Promise<Datalake | null>;
  getAllDatalakes(): Promise<Datalake[]>;
  createDatalake(input: CreateDatalakeInput): Promise<Datalake>;
  updateDatalake(id: string, updates: UpdateDatalakeInput): Promise<Datalake>;
  deleteDatalake(id: string): Promise<void>;
  
  getApiEndpoint(id: string): Promise<ApiEndpoint | null>;
  getAllApiEndpoints(): Promise<ApiEndpoint[]>;
  
  getSelectedDatalakeForEndpoint(endpointId: string): Promise<Datalake | null>;
  setSelectedDatalakeForEndpoint(endpointId: string, datalakeId: string): Promise<void>;
  
  getEndpointMappingsForDatalake(datalakeId: string): Promise<DatalakeApiMapping[]>;
  createEndpointMapping(endpointId: string, datalakeId: string): Promise<void>;
  deleteEndpointMapping(endpointId: string, datalakeId: string): Promise<void>;
}

