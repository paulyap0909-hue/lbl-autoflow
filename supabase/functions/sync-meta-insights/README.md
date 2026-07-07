# sync-meta-insights

Read-only Meta Marketing API synchronization for LBL AutoFlow.

Required secrets:

```powershell
npx supabase secrets set META_APP_ID="..." META_AD_ACCOUNT_ID="..." META_ACCESS_TOKEN="..."
```

Deploy after applying migrations `202606200001_meta_ads_center.sql` and `202606200003_meta_ads_center_v1_alignment.sql`:

```powershell
npx supabase functions deploy sync-meta-insights
```

The function reads campaign, ad set, ad, and daily insight data. It never creates ads or changes budgets.
