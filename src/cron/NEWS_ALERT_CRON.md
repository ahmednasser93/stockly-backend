# News Alert Cron Job

## Overview
The news alert cron job runs every **6 hours** (at 00:00, 06:00, 12:00, 18:00 UTC) to check for new news articles published today for all users' favorite stocks and send push notifications.

## How It Works

### 1. **Collect Unique Symbols** (Step 1)
- Fetches all users' favorite stocks from `user_settings.news_favorite_symbols`
- Creates a map: `symbol -> [user_id1, user_id2, ...]`
- Example:
  - User 1: `[LXEO, AMZN]`
  - User 2: `[AMZN, AAPL]`
  - User 3: `[AAPL, LXEO, BABA]`
- Result: Unique symbols = `[LXEO, AMZN, AAPL, BABA]`
- User mapping:
  - `LXEO` → `[user1, user3]`
  - `AMZN` → `[user1, user2]`
  - `AAPL` → `[user2, user3]`
  - `BABA` → `[user3]`

### 2. **Batch Fetch News** (Step 2)
- Makes **ONE API call** to FMP API for all unique symbols at once
- Filters by today's date: `from=YYYY-MM-DD&to=YYYY-MM-DD`
- Example: `GET /news/stock?symbols=LXEO,AMZN,AAPL,BABA&from=2025-01-15&to=2025-01-15`
- This is more efficient than fetching per symbol

### 3. **Filter by Today** (Step 3)
- Only processes news articles published **today** (same day)
- Skips articles from previous days
- Groups news by symbol for processing

### 4. **Deduplication** (Step 4)
- Creates a unique checksum for each article: `SHA-256(title + publishedDate + symbol)`
- Checks KV store: `news:{symbol}:{checksum}`
- If article already exists in KV → **skip** (already notified)
- If article is new → **mark as seen** in KV (TTL: 7 days) → **send notifications**

### 5. **Send Notifications** (Step 5)
- For each new article published today:
  - Gets all users who have this symbol in favorites
  - Fetches their push tokens in one batch query
  - Sends FCM notification to each user
  - Logs notification count

## Example Flow

### At 3:00 PM (15:00):
1. **Collect symbols:**
   - User 1: `[LXEO, AMZN]`
   - User 2: `[AMZN, AAPL]`
   - User 3: `[AAPL, LXEO, BABA]`
   - Unique: `[LXEO, AMZN, AAPL, BABA]`

2. **Fetch news:**
   - `GET /news/stock?symbols=LXEO,AMZN,AAPL,BABA&from=2025-01-15&to=2025-01-15`
   - Returns: News for `LXEO` and `AMZN` published today

3. **Process:**
   - **LXEO news:**
     - Check deduplication → New article
     - Users: `[user1, user3]`
     - Send notifications to user1 and user3
   - **AMZN news:**
     - Check deduplication → New article
     - Users: `[user1, user2]`
     - Send notifications to user1 and user2

### At 7:00 PM (19:00):
1. Same process runs again
2. If same articles exist → Already in KV → **No duplicate notifications**
3. If new articles published → Process and notify

## Configuration

### Cron Schedule
Currently set to run every **6 hours**: `0 */6 * * *`
- Runs at: 00:00, 06:00, 12:00, 18:00 UTC

To change the interval, update `wrangler.jsonc`:
```jsonc
"triggers": {
  "crons": ["*/5 * * * *", "0 */6 * * *"]  // Change "0 */6 * * *" to desired schedule
}
```

Common schedules:
- Every hour: `"0 * * * *"`
- Every 6 hours: `"0 */6 * * *"` (current)
- Every 12 hours: `"0 */12 * * *"`
- Daily at 3 PM: `"0 15 * * *"`

## Key Features

✅ **Efficient**: One API call for all symbols (not per symbol)  
✅ **Today-only**: Only checks news published today  
✅ **Deduplication**: Never sends the same notification twice  
✅ **Batch processing**: Fetches all user tokens in one query  
✅ **Error handling**: Continues processing even if one symbol fails  
✅ **Logging**: Comprehensive logs for monitoring  

## Logs

The cron job logs:
- Number of unique symbols found
- Number of news articles fetched
- Which symbols have news today
- Number of notifications sent per symbol
- Any errors encountered

Example log:
```
Starting news alert cron job
Checking news for 4 unique symbols: LXEO, AMZN, AAPL, BABA
Fetching news for all symbols published today (2025-01-15)
Fetched 5 news articles published today
Found news for 2 symbols: LXEO, AMZN
Found 2 users with LXEO in favorites: user1, user3
Sent 2 notifications for LXEO news to 2 users
Found 2 users with AMZN in favorites: user1, user2
Sent 2 notifications for AMZN news to 2 users
News alert cron job completed
```







