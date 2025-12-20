# k6 Performance Testing

Performance and load testing scripts for the Stockly API using k6.

## Prerequisites

1. **Install k6**
   ```bash
   # macOS
   brew install k6
   
   # Linux
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D9
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update
   sudo apt-get install k6
   
   # Windows
   choco install k6
   ```

2. **Verify Installation**
   ```bash
   k6 version
   ```

## Test Scripts

### Load Test
Simulates normal expected load on the API (50 virtual users for 5 minutes).

```bash
npm run test:performance:load
# or
k6 run test/performance/load-test.js
```

### Stress Test
Gradually increases load to find the breaking point.

```bash
npm run test:performance:stress
# or
k6 run test/performance/stress-test.js
```

### Spike Test
Tests the API's behavior under sudden spikes in traffic.

```bash
npm run test:performance:spike
# or
k6 run test/performance/spike-test.js
```

### Endurance Test
Tests the API's stability over an extended period (1 hour).

```bash
npm run test:performance:endurance
# or
k6 run test/performance/endurance-test.js
```

## Configuration

### Environment Variables

- `API_BASE_URL`: Base URL for the API (default: `https://stockly-api.ahmednasser1993.workers.dev`)

Example:
```bash
API_BASE_URL=http://localhost:8787 k6 run test/performance/load-test.js
```

### Thresholds

All tests use the following default thresholds (defined in `k6.config.js`):

- `http_req_duration`: 95% of requests < 500ms, 99% < 1000ms
- `http_req_failed`: Less than 1% of requests should fail
- `http_reqs`: More than 10 requests per second

## Test Results

k6 generates detailed statistics including:

- Request duration (min, max, avg, p95, p99)
- Request rate
- Error rate
- Data transfer
- Virtual user statistics

## Interpreting Results

### Good Performance
- 95% of requests complete in < 500ms
- Error rate < 1%
- Consistent response times

### Performance Issues
- High p95/p99 values indicate slow endpoints
- High error rate indicates system stress
- Decreasing request rate indicates bottlenecks

## Best Practices

1. **Start with Load Tests**: Run load tests first to establish baseline
2. **Gradual Increase**: Use stress tests to find limits gradually
3. **Monitor Resources**: Watch CPU, memory, and database during tests
4. **Test in Staging**: Always test in staging environment first
5. **Document Results**: Keep records of performance metrics

## CI/CD Integration

Add to your CI/CD pipeline:

```yaml
- name: Run Performance Tests
  run: |
    npm run test:performance:load
```

## Troubleshooting

1. **k6 not found**: Ensure k6 is installed and in PATH
2. **Connection errors**: Check API_BASE_URL is correct
3. **Timeout errors**: Increase timeout values in test scripts
4. **Memory issues**: Reduce virtual users or test duration





