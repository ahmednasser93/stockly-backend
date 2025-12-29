import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, testSymbols, options as baseOptions } from './k6.config.js';

/**
 * Endurance Test
 * 
 * Tests the API's stability over an extended period
 * - Runs for 1 hour with consistent load
 * - Identifies memory leaks, resource exhaustion, etc.
 * 
 * Usage: k6 run endurance-test.js
 */
export const options = {
  ...baseOptions,
  stages: [
    { duration: '2m', target: 50 },   // Ramp up
    { duration: '56m', target: 50 },  // Stay at 50 users for 56 minutes
    { duration: '2m', target: 0 },    // Ramp down
  ],
};

export default function () {
  const baseUrl = BASE_URL;
  
  // Test health endpoint
  let res = http.get(`${baseUrl}/v1/api/health`);
  check(res, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  sleep(2);
  
  // Test stock search
  const searchQuery = testSymbols[Math.floor(Math.random() * testSymbols.length)];
  res = http.get(`${baseUrl}/v1/api/search-stock?query=${searchQuery}`);
  check(res, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(2);
  
  // Test get stock
  const symbol = testSymbols[Math.floor(Math.random() * testSymbols.length)];
  res = http.get(`${baseUrl}/v1/api/get-stock?symbol=${symbol}`);
  check(res, {
    'get stock status is 200': (r) => r.status === 200,
    'get stock response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  sleep(2);
  
  // Test get stocks (batch)
  const symbols = testSymbols.slice(0, 3).join(',');
  res = http.get(`${baseUrl}/v1/api/get-stocks?symbols=${symbols}`);
  check(res, {
    'get stocks status is 200': (r) => r.status === 200,
    'get stocks response time < 1500ms': (r) => r.timings.duration < 1500,
  });
  
  sleep(4);
}






