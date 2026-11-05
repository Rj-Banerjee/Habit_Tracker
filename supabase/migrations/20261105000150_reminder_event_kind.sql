-- Server reminders are recorded as coach events, so the 2-a-day cap can count them. A new
-- enum value can't be used in the transaction that adds it, so it comes first, alone.
alter type public.coach_event_kind add value if not exists 'reminder';
