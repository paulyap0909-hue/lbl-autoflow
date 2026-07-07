# Meta Ads Sync

This Edge Function performs read-only Meta Marketing API synchronization. It does not create or edit campaigns, ads, ad sets, or budgets.

## Required Supabase secrets

```powershell
supabase secrets set META_APP_ID="..." META_APP_SECRET="..." META_ACCESS_TOKEN="..." META_AD_ACCOUNT_ID="..."
```

Optional controlled API version pin:

```powershell
supabase secrets set META_GRAPH_API_VERSION="v23.0"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Edge Function runtime. Never expose any Meta secret using a `VITE_` variable.

## Deploy

1. Apply `supabase/migrations/202606200001_meta_ads_center.sql`.
2. Configure the secrets above.
3. Deploy with JWT verification enabled:

```powershell
supabase functions deploy meta-ads-sync
```

The dashboard invokes this function manually. No scheduled sync or automatic budget action is enabled in V1.
