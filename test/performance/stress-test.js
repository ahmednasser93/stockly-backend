import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, testSymbols, options as baseOptions } from './k6.config.js';

/**
 * Stress Test
 * 
 * Tests the API's behavior under extreme load
 * - Gradually increases load to find breaking point
 * - Starts with normal load, then increases until system fails
 * 
 * Usage: k6 run stress-test.js
 */
export const options = {
  ...baseOptions,
  stages: [
    { duration: '2m', target: 100 },  // Normal load
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },  // Beyond normal load
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 },  // Stress level
    { duration: '5m', target: 300 },
    { duration: '2m', target: 400 },  // Extreme stress
    { duration: '5m', target: 400 },
    { duration: '10m', target: 0 },   // Recovery
  ],
};

export default function () {
  const baseUrl = BASE_URL;
  
  // Test health endpoint
  let res = http.get(`${baseUrl}/v1/api/health`);
  check(res, {
    'health check status is 200': (r) => r.status === 200,
  });
  
  sleep(0.5);
  
  // Test stock search
  const searchQuery = testSymbols[Math.floor(Math.random() * testSymbols.length)];
  res = http.get(`${baseUrl}/v1/api/search-stock?query=${searchQuery}`);
  check(res, {
    'search status is 200': (r) => r.status === 200,
  });
  
  sleep(0.5);
  
  // Test get stock
  const symbol = testSymbols[Math.floor(Math.random() * testSymbols.length)];
  res = http.get(`${baseUrl}/v1/api/get-stock?symbol=${symbol}`);
  check(res, {
    'get stock status is 200': (r) => r.status === 200,
  });
  
  sleep(0.5);
  
  // Test get stocks (batch)
  const symbols = testSymbols.slice(0, 3).join(',');
  res = http.get(`${baseUrl}/v1/api/get-stocks?symbols=${symbols}`);
  check(res, {
    'get stocks status is 200': (r) => r.status === 200,
  });
  
  sleep(1);
}





