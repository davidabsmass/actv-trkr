

## Analysis: Existing Data is Already Clean

Your existing data is in good shape. Here's what I found:

- **10,693 pageviews** / **3,721 sessions** across Feb 25 – Mar 7
- **Every record** has a `visitor_id` and `session_id`, meaning they came through the JS tracker (bots that hit the endpoint directly without running JS wouldn't have these)
- Only **23 pageviews** (~0.2%) come from known spam referrer domains (ebook-search-queen, panjoy, manyget, etc.)
- The rest of the referrer traffic is legitimate: Google, Bing, Facebook, LinkedIn, DuckDuckGo, related medical sites

### Recommendation

**No need to start over.** The data is 99.8% clean. I can:

1. **Delete the 23 spam-referrer pageviews** and their corresponding sessions — a one-time cleanup
2. **Delete any orphaned sessions** that no longer have associated pageviews after cleanup

This is a minor data operation, not a reset. The bot filtering we added to the ingestion endpoints will prevent new spam from entering going forward.

### What gets cleaned

| Source | Pageviews | Action |
|---|---|---|
| Spam referrer domains | ~23 | Delete |
| Everything else | ~10,670 | Keep |

### Steps
1. Delete pageviews from known spam referrer domains
2. Delete orphaned session records
3. Verify counts match expectations

