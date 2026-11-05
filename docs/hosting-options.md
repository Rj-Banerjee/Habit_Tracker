# Hosting the AI service

The AI service (`backend/`, FastAPI) runs on a laptop today. Before the closed beta it needs a public HTTPS address, so that phones anywhere can reach it and Supabase's `pg_cron` can call its `/jobs` endpoints. This compares four cheap options, with prices checked on 5 November 2026.

## What the service needs

- One small Python container. It mostly waits on the AI provider, so it needs little CPU and about 256–512 MB of memory.
- A public HTTPS URL, and secrets set as environment variables (the same ones as `backend/.env`).
- No disk: everything it keeps lives in Supabase.
- Steady traffic from the schedules: one call every 15 minutes for reminders and nudges, hourly on Sundays for letters, and once a night for patterns. That's about 100 calls a day, whatever the number of users.
- Fast answers for voice and the coach. A cold start of a minute would make "Log by voice" feel broken.

## The options

| | Google Cloud Run | Fly.io | Railway | Render |
| --- | --- | --- | --- | --- |
| Free tier | 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests a month (request-based billing), shared across a billing account | None. A 7-day trial with $1 of credit | Free plan with $1 of usage a month, up to 0.5 GB. Trial: $5 for 30 days | 750 instance hours a month |
| Card needed | Yes: a billing account, even inside the free tier | Yes, after the trial | Not for the trial | Not stated for free; needed for overage |
| Idle behaviour | Scales to zero, starts on the next request | Billed only while running; can auto-stop | Billed per second while running | Free services spin down after 15 minutes idle |
| Cold start | Seconds for a small Python image (not measured here) | Seconds if auto-stop is on, none if always on | None while running | About 1 minute on the free tier |
| Paid rates | $0.000024 per vCPU-second, $0.0000025 per GiB-second, $0.40 per million requests (Tier 1 regions) | Always on: $2.19 (256 MB), $3.69 (512 MB), $6.70 (1 GB) a month | Hobby $5 a month including $5 of usage; about $20 per vCPU and $10 per GB of memory a month | Starter $7 a month, 0.5 CPU and 512 MB, always on |

Render's free tier is ruled out for this service. A cold start of about a minute is slower than pg_net's 60-second timeout, and far too slow for voice.

## Rough monthly cost

The assumptions are deliberately generous. Each person makes about 10 AI calls a day, each keeping the service busy for about 5 seconds, plus about 100 schedule calls a day in total. Calls that overlap share one instance, so real use will be lower. **These figures cover hosting only.** The paid Gemini tier that production needs (see "AI data" in `PLAN.md`) is billed separately by Google, and will cost more than the hosting.

| | 100 users | 1,000 users |
| --- | --- | --- |
| Cloud Run (512 MiB) | About $0: roughly 150,000 vCPU-seconds, inside the free tier | About $30: roughly 1.5 million vCPU-seconds, 1.3 million of them past the free tier |
| Fly.io | $3.69 (one 512 MB machine, always on) | About $13 (two 1 GB machines) |
| Railway (Hobby) | About $5–7 | About $15–20 |
| Render (Starter) | $7 | $7 for one instance. More capacity means a larger plan; its price wasn't confirmed on Render's own page |

At 1,000 users Cloud Run's estimate is an upper bound, because it charges per busy instance-second, and many calls overlap on one instance.

## Recommendation: Google Cloud Run

- **Costs nothing at beta size.** 100 people fit well inside the free tier.
- **No minute-long cold starts.** It scales to zero when idle and starts in seconds, unlike Render's free tier.
- **It's the same Google account as Gemini.** Production needs a paid Gemini tier anyway, which needs a Google Cloud billing account. So the card Cloud Run asks for is one you'll add regardless, and the service and its AI provider share one project, one bill and one place to set data rules.
- **It handles the schedules well.** Each of the ~100 daily calls starts the service if needed, does its work, and lets it go back to zero.

If you'd rather not link a card before the beta, **Fly.io** at $3.69 a month is the simplest always-on choice, though it needs a card after its 7-day trial. **Railway** works too, but its free plan's $1 doesn't cover an always-on service.

## Switching it on

Once it's hosted:

1. Set the service's environment variables, with `AI_PROVIDER_TIER=paid` once Gemini is on a paid tier, and a fresh `JOB_SECRET`.
2. In Supabase, store the URL and the secret in Vault, under the names the schedules look for:

   ```sql
   select vault.create_secret('https://your-service.example', 'ai_service_url');
   select vault.create_secret('<the JOB_SECRET value>', 'ai_job_secret');
   ```

3. Point the apps at it with `EXPO_PUBLIC_AI_URL` (EAS environment `preview` or `production`) and the web app's equivalent. An `https` address needs no change to the Android network rules.

Until step 2, the schedules run and do nothing.

## Sources

- [Railway pricing](https://railway.com/pricing)
- [Fly.io pricing](https://docs.fly.io/about/pricing)
- [Render free tier](https://render.com/docs/free)
- [Render Free vs Starter in 2026](https://actualdatabase.com/render-free-vs-starter-pricing/) and [Render pricing calculator](https://makerkit.dev/pricing-calculator/render): third-party; Render's own pricing page didn't render
- [Cloud Run pricing](https://cloud.google.com/run/pricing) (didn't render; figures confirmed through [usage.ai's 2026 guide](https://www.usage.ai/blogs/gcp/cloud-run-pricing/) and [DEV: what Cloud Run costs](https://dev.to/elimio/what-cloud-run-costs-with-worked-examples-378i))
