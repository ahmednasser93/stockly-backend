import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, testSymbols, options as baseOptions } from './k6.config.js';

/**
 * Standard Load Test
 * 
 * Simulates normal expected load on the API
 * - 50 virtual users
 * - Duration: 5 minutes
 * - Ramp up: 1 minute
 * 
 * Usage: k6 run load-test.js
 */
export const options = {
  ...baseOptions,
  stages: [
    { duration: '1m', target: 50 }, // Ramp up to 50 users over 1 minute
    { duration: '5m', target: 50 }, // Stay at 50 users for 5 minutes
    { duration: '1m', target: 0 },  // Ramp down to 0 users over 1 minute
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
  
  sleep(1);
  
  // Test stock search
  const searchQuery = testSymbols[Math.floor(Math.random() * testSymbols.length)];
  res = http.get(`${baseUrl}/v1/api/search-stock?query=${searchQuery}`);
  check(res, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 500ms': (r) => r.timings.duration < 500,
    'search returns results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body) && body.length > 0;
      } catch {
        return false;
      }
    },
  });
  
  sleep(1);
  
  // Test get stock
  const symbol = testSymbols[Math.floor(Math.random() * testSymbols.length)];
  res = http.get(`${baseUrl}/v1/api/get-stock?symbol=${symbol}`);
  check(res, {
    'get stock status is 200': (r) => r.status === 200,
    'get stock response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  sleep(1);
  
  // Test get stocks (batch)
  const symbols = testSymbols.slice(0, 3).join(',');
  res = http.get(`${baseUrl}/v1/api/get-stocks?symbols=${symbols}`);
  check(res, {
    'get stocks status is 200': (r) => r.status === 200,
    'get stocks response time < 1500ms': (r) => r.timings.duration < 1500,
  });
  
  sleep(2);
}






