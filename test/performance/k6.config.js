/**
 * k6 Performance Testing Configuration
 * 
 * k6 is a modern load testing tool built for developers and testers.
 * Install: https://k6.io/docs/getting-started/installation/
 * 
 * Usage:
 *   k6 run load-test.js
 *   k6 run stress-test.js
 *   k6 run spike-test.js
 *   k6 run endurance-test.js
 */

export const options = {
  // Default thresholds for all tests
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests < 500ms, 99% < 1000ms
    http_req_failed: ['rate<0.01'], // Less than 1% of requests should fail
    http_reqs: ['rate>10'], // More than 10 requests per second
  },
  
  // Summary statistics
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)', 'p(99.99)', 'count'],
  
  // Tags for filtering results
  tags: {
    environment: 'test',
    service: 'stockly-api',
  },
};

// Base URL for API
export const BASE_URL = __ENV.API_BASE_URL || 'https://stockly-api.ahmednasser1993.workers.dev';

// Test data
export const testSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
export const testUsernames = ['testuser1', 'testuser2', 'testuser3'];







