# Stockly API Documentation Index

**Welcome to the Stockly API documentation!** This index helps you find the information you need quickly.

---

## 📚 Documentation Structure

### For Developers

| Document | Purpose | Audience |
|----------|---------|----------|
| [README.md](../README.md) | Project overview and quick start | Everyone |
| [API_REFERENCE.md](API_REFERENCE.md) | Complete API endpoint documentation | Frontend devs, API consumers |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Database tables and queries | Backend devs, DBAs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design and patterns | Backend devs, architects |
| [COMMANDS.md](COMMANDS.md) | CLI commands and scripts | Developers, DevOps |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Step-by-step deployment guide | DevOps, maintainers |
| [DEPLOYMENT_SUCCESS.md](../DEPLOYMENT_SUCCESS.md) | Current deployment status | Everyone |

### For Integration

| Document | Purpose | Audience |
|----------|---------|----------|
| [WEBAPP_INTEGRATION_PROMPT.md](../WEBAPP_INTEGRATION_PROMPT.md) | Webapp integration guide | Frontend team |
| [MOBILE_APP_INTEGRATION_PROMPT.md](../MOBILE_APP_INTEGRATION_PROMPT.md) | Mobile app guide (Expo) | Mobile team |

---

## 🎯 Quick Navigation

### I want to...

#### ...understand the API
→ Start with [API_REFERENCE.md](API_REFERENCE.md)
- All endpoints documented
- Request/response examples
- Error codes
- Data types

#### ...set up locally
→ Read [README.md](../README.md) → "Running Locally" section
```bash
npm install
npm run dev
```

#### ...deploy to production
→ Follow [DEPLOYMENT.md](../DEPLOYMENT.md)
1. Create KV namespace
2. Update wrangler.jsonc
3. Run migrations
4. Deploy

#### ...query the database
→ Check [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- Table schemas
- Example queries
- Indexes explained

#### ...understand the code architecture
→ Read [ARCHITECTURE.md](ARCHITECTURE.md)
- System overview
- Component responsibilities
- Data flow diagrams
- Design patterns

#### ...run commands
→ Use [COMMANDS.md](COMMANDS.md) as quick reference
- Development commands
- Database operations
- Deployment commands
- Troubleshooting

#### ...integrate with webapp
→ Give your team [WEBAPP_INTEGRATION_PROMPT.md](../WEBAPP_INTEGRATION_PROMPT.md)
- Complete API specs
- TypeScript types
- OpenAPI/Swagger YAML
- UI requirements

#### ...integrate with mobile app
→ Give your team [MOBILE_APP_INTEGRATION_PROMPT.md](../MOBILE_APP_INTEGRATION_PROMPT.md)
- Expo-specific examples
- React Query patterns
- Push notifications setup

---

## 📖 Documentation by Topic

### API Endpoints

**Stock Quotes:**
- `GET /v1/api/get-stock` - Single quote
- `GET /v1/api/get-stocks` - Batch quotes
- `GET /v1/api/search-stock` - Symbol search

**Alerts:**
- `GET /v1/api/alerts` - List all
- `POST /v1/api/alerts` - Create
- `GET /v1/api/alerts/:id` - Get one
- `PUT /v1/api/alerts/:id` - Update
- `DELETE /v1/api/alerts/:id` - Delete

**Health:**
- `GET /v1/api/health` - Status check

→ Details in [API_REFERENCE.md](API_REFERENCE.md)

---

### Database

**Tables:**
- `stock_prices` - Cached stock quotes (30s TTL)
- `search_cache` - Search results (20min TTL)
- `alerts` - Price alert configurations

**KV Namespace:**
- `alertsKv` - Alert state snapshots

→ Full schemas in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)

---

### Architecture

**Components:**
- Router (`src/index.ts`)
- API Handlers (`src/api/*`)
- Alerts System (`src/alerts/*`)
- Cron Worker (`src/cron/*`)

**External Services:**
- FMP API (stock data)
- Cloudflare D1 (database)
- Cloudflare KV (state storage)

→ Detailed design in [ARCHITECTURE.md](ARCHITECTURE.md)

---

### Commands

**Development:**
```bash
npm run dev          # Start local server
npm test             # Run tests
npm run cf-typegen   # Generate types
```

**Database:**
```bash
npm run db:migrate:local        # Local migrations
npm run db:migrate:production   # Production migrations
npm run select-prices           # Query local DB
npm run prod:select-prices      # Query production DB
```

**Deployment:**
```bash
npm run deploy       # Deploy to production
wrangler tail        # View logs
wrangler rollback    # Rollback deployment
```

→ All commands in [COMMANDS.md](COMMANDS.md)

---

## 🗺️ Learning Path

### New to the Project?
1. Read [README.md](../README.md) (5 min)
2. Set up locally (follow "Running Locally")
3. Browse [API_REFERENCE.md](API_REFERENCE.md) (10 min)
4. Look at test files in `test/` directory

### Want to Contribute?
1. Understand architecture: [ARCHITECTURE.md](ARCHITECTURE.md) (15 min)
2. Learn database schema: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) (10 min)
3. Review existing code patterns
4. Write tests for new features

### Deploying for First Time?
1. Follow [DEPLOYMENT.md](../DEPLOYMENT.md) step-by-step (20 min)
2. Verify with health check
3. Check deployment success: [DEPLOYMENT_SUCCESS.md](../DEPLOYMENT_SUCCESS.md)

### Integrating Frontend?
1. **Webapp:** Share [WEBAPP_INTEGRATION_PROMPT.md](../WEBAPP_INTEGRATION_PROMPT.md)
2. **Mobile:** Share [MOBILE_APP_INTEGRATION_PROMPT.md](../MOBILE_APP_INTEGRATION_PROMPT.md)
3. Test against production API
4. Review [API_REFERENCE.md](API_REFERENCE.md) for details

---

## 🔍 Find by Keyword

### A
- **Alerts** → [API_REFERENCE.md](API_REFERENCE.md#alerts-endpoints), [ARCHITECTURE.md](ARCHITECTURE.md#alerts-system)
- **Architecture** → [ARCHITECTURE.md](ARCHITECTURE.md)
- **Authentication** → [API_REFERENCE.md](API_REFERENCE.md#authentication)

### C
- **Caching** → [ARCHITECTURE.md](ARCHITECTURE.md#performance-optimizations)
- **Commands** → [COMMANDS.md](COMMANDS.md)
- **CORS** → [API_REFERENCE.md](API_REFERENCE.md#authentication)
- **Cron Jobs** → [ARCHITECTURE.md](ARCHITECTURE.md#cron-worker), [API_REFERENCE.md](API_REFERENCE.md#cron-jobs)

### D
- **Database** → [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- **Deployment** → [DEPLOYMENT.md](../DEPLOYMENT.md)
- **D1** → [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)

### E
- **Endpoints** → [API_REFERENCE.md](API_REFERENCE.md)
- **Errors** → [API_REFERENCE.md](API_REFERENCE.md#error-codes)

### K
- **KV Namespace** → [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#kv-namespace)

### M
- **Migrations** → [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#migrations)
- **Mobile Integration** → [MOBILE_APP_INTEGRATION_PROMPT.md](../MOBILE_APP_INTEGRATION_PROMPT.md)
- **Monitoring** → [ARCHITECTURE.md](ARCHITECTURE.md#monitoring--observability)

### Q
- **Queries** → [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#query-examples)

### S
- **Schema** → [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- **Stock Endpoints** → [API_REFERENCE.md](API_REFERENCE.md#stock-endpoints)

### T
- **Testing** → [ARCHITECTURE.md](ARCHITECTURE.md#testing-strategy)
- **Types** → [API_REFERENCE.md](API_REFERENCE.md#data-types)

### W
- **Webapp Integration** → [WEBAPP_INTEGRATION_PROMPT.md](../WEBAPP_INTEGRATION_PROMPT.md)

---

## 📊 Current Status

| Metric | Value |
|--------|-------|
| **Deployment** | ✅ Live |
| **URL** | https://stockly-api.ahmednasser1993.workers.dev |
| **Version** | 7e1cb6e6-3362-4f7f-8163-f0bcae55e90e |
| **Tests** | 44/44 passing |
| **Tables** | 3 (stock_prices, search_cache, alerts) |
| **KV Namespaces** | 1 (alertsKv) |
| **Cron Jobs** | 1 (every 5 minutes) |
| **Last Updated** | November 14, 2025 |

---

## 🆘 Getting Help

### Documentation Not Clear?
- Check [COMMANDS.md](COMMANDS.md) for troubleshooting section
- Review logs: `wrangler tail`
- Verify setup: `wrangler whoami`

### API Questions?
- See [API_REFERENCE.md](API_REFERENCE.md) for complete specs
- Try endpoints with cURL (examples included)
- Check error response format

### Database Issues?
- Review [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- Check table exists: `wrangler d1 execute stockly --remote --command="SELECT name FROM sqlite_master;"`
- Reapply migrations if needed

### Deployment Problems?
- Follow [DEPLOYMENT.md](../DEPLOYMENT.md) step-by-step
- Check [DEPLOYMENT_SUCCESS.md](../DEPLOYMENT_SUCCESS.md) for verification
- Use rollback if needed: `wrangler rollback VERSION_ID`

---

## 🎯 Key Concepts

### Workers
Serverless functions running on Cloudflare's edge network

### D1
Cloudflare's SQLite-based serverless database

### KV
Cloudflare's key-value storage for fast, distributed data

### Cron Triggers
Scheduled tasks that run at specified intervals

### Edge Computing
Running code closer to users for lower latency

---

## 📝 Documentation Standards

All docs follow these principles:
- **Clear** - No jargon without explanation
- **Complete** - Cover all common scenarios
- **Current** - Updated with each major change
- **Concise** - Respect reader's time
- **Correct** - Tested and verified

---

## 🔄 Last Updated

This documentation was last updated on **November 14, 2025** after the successful deployment of the alerts feature.

**Major Changes:**
- Added alerts CRUD API
- Added KV-based state management
- Added cron job for alert evaluation
- Added comprehensive documentation

**Next Review:** Before next major feature release

---

## 📞 Contact

For questions or contributions:
- Review existing docs first
- Check code comments in `src/`
- Run tests to understand behavior
- Follow patterns in existing code

---

**Happy Coding!** 🚀


