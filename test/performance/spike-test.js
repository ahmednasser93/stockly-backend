import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, testSymbols, options as baseOptions } from './k6.config.js';

/**
 * Spike Test
 * 
 * Tests the API's behavior under sudden spikes in traffic
 * - Simulates sudden traffic increase (e.g., news event)
 * - Tests if system can handle sudden load spikes
 * 
 * Usage: k6 run spike-test.js
 */
export const options = {
  ...baseOptions,
  stages: [
    { duration: '1m', target: 50 },   // Normal load
    { duration: '1m', target: 50 },
    { duration: '30s', target: 500 }, // Sudden spike
    { duration: '1m', target: 500 },
    { duration: '30s', target: 50 },  // Back to normal
    { duration: '1m', target: 50 },
    { duration: '1m', target: 0 },    // Ramp down
  ],
};

export default function () {
  const baseUrl = BASE_URL;
  
  // Test health endpoint
  let res = http.get(`${baseUrl}/v1/api/health`);
  check(res, {
    'health check status is 200': (r) => r.status === 200,
  });
  
  sleep(0.1);
  
  // Test stock search
  const searchQuery = testSymbols[Math.floor(Math.random() * testSymbols.length)];
  res = http.get(`${baseUrl}/v1/api/search-stock?query=${searchQuery}`);
  check(res, {
    'search status is 200': (r) => r.status === 200,
  });
  
  sleep(0.1);
  
  // Test get stock
  const symbol = testSymbols[Math.floor(Math.random() * testSymbols.length)];
  res = http.get(`${baseUrl}/v1/api/get-stock?symbol=${symbol}`);
  check(res, {
    'get stock status is 200': (r) => r.status === 200,
  });
  
  sleep(0.1);
  
  // Test get stocks (batch)
  const symbols = testSymbols.slice(0, 3).join(',');
  res = http.get(`${baseUrl}/v1/api/get-stocks?symbols=${symbols}`);
  check(res, {
    'get stocks status is 200': (r) => r.status === 200,
  });
  
  sleep(0.2);
}






