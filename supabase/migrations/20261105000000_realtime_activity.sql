-- Lets the apps hear about a log made on another device, so the phone, widget and web
-- stay in step after a voice log. activity_events is sent rather than habit_logs:
-- Realtime checks inserts against the owner-only select policy, but sends delete
-- events without that check, which would show other people a row id. Every
-- habit_logs change already writes an activity_events row in the same transaction.
alter publication supabase_realtime add table public.activity_events;
