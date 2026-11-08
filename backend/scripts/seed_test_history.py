"""Fills the one account in AI_TEST_USER_IDS with 120 days of made-up history, so Progress
and Analytics have something to show. Safe to re-run: it replaces that account's logs and
nothing else.

It replays each day through the real logging rules with a backdated clock, so repairs
and protected days are genuine. The history has patterns for analytics to find: good
and bad weeks, Wednesdays that slip, and one amount habit whose target is too high (it
mostly reaches its minimum, and sometimes falls short), and for Habit connections, daily
check-ins with a hidden pattern: the day after a long run (16 km or more), energy is low
and Study mostly doesn't happen. It adds "Long run" and "Study" if they're missing.
Run from backend/:

    .venv/bin/python scripts/seed_test_history.py
"""

import math
import os
import random
import sys

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, ".")
from app.config import Settings  # noqa: E402

DAYS = 120
# Wednesday slips more than other days.
WEAK_WEEKDAY = 3
SOURCES = ["tap"] * 6 + ["notification"] * 2 + ["widget"] + ["voice"] * 2
SKIP_REASONS = ["Busy day", "Feeling unwell", "Travelling", "Rest day"]
SEED = "habit-tracker-test-history"


def pick_account(settings: Settings, conn) -> dict:
    if len(settings.ai_test_user_ids) != 1:
        sys.exit("Expected exactly one ID in AI_TEST_USER_IDS, so nothing was changed.")
    user_id = settings.ai_test_user_ids[0]
    account = conn.execute(
        "select id, email from auth.users where id = %s", (user_id,)
    ).fetchone()
    if account is None:
        sys.exit("That account doesn't exist, so nothing was changed.")
    # A second lock, so a wrong ID in the setting can't overwrite a real account.
    if "+test" not in account["email"]:
        sys.exit(f"{account['email']} isn't a +test address, so nothing was changed.")
    return account


def clear(conn, user_id, start) -> None:
    conn.execute(
        """
        delete from public.habit_logs where habit_id in (
          select h.id from public.habits h
          join public.identities i on i.id = h.identity_id
          where i.user_id = %s)
        """,
        (user_id,),
    )
    conn.execute("delete from public.grace_days where user_id = %s", (user_id,))
    conn.execute(
        """
        update public.users
        set mode = 'grace', settled_through = null, settled_fingerprint = null
        where id = %s
        """,
        (user_id,),
    )
    conn.execute(
        "delete from tracker.mode_history where user_id = %s", (user_id,)
    )
    conn.execute(
        """
        insert into tracker.mode_history (user_id, effective_from, mode)
        values (%s, '-infinity', 'grace')
        """,
        (user_id,),
    )
    # Each habit's latest settings now apply from the start.
    conn.execute(
        """
        delete from tracker.habit_versions v
        using public.habits h, public.identities i
        where v.habit_id = h.id and h.identity_id = i.id and i.user_id = %(user)s
          and v.effective_from < (
            select max(latest.effective_from) from tracker.habit_versions latest
            where latest.habit_id = v.habit_id)
        """,
        {"user": user_id},
    )
    conn.execute(
        """
        update tracker.habit_versions v set effective_from = '-infinity'
        from public.habits h, public.identities i
        where v.habit_id = h.id and h.identity_id = i.id and i.user_id = %s
        """,
        (user_id,),
    )
    conn.execute(
        """
        update public.habits h set starts_on = %s
        from public.identities i
        where h.identity_id = i.id and i.user_id = %s and h.archived_at is null
        """,
        (start, user_id),
    )
    conn.execute(
        """
        update public.habits h
        set milestone_amount = 300, milestone_label = 'book'
        from public.identities i
        where h.identity_id = i.id and i.user_id = %s and h.type = 'count'
          and h.unit ilike 'page%%' and h.milestone_amount is null
        """,
        (user_id,),
    )


PATTERN_HABITS = [
    # title, type, unit, target, minimum, time of day
    ("Long run", "count", "km", 10, 3, "morning"),
    ("Study", "duration", "minutes", 45, 15, "evening"),
]


def add_pattern_habits(conn, user_id, start) -> None:
    """The two habits the hidden pattern needs, under the first identity, if missing."""
    identity = conn.execute(
        "select id from public.identities where user_id = %s order by created_at limit 1", (user_id,)
    ).fetchone()
    if identity is None:
        return
    for title, kind, unit, target, minimum, part in PATTERN_HABITS:
        exists = conn.execute(
            """
            select 1 from public.habits h join public.identities i on i.id = h.identity_id
            where i.user_id = %s and h.title = %s and h.archived_at is null
            """,
            (user_id, title),
        ).fetchone()
        if exists:
            continue
        habit = conn.execute(
            """
            insert into public.habits (identity_id, title, type, target, unit, starts_on, time_of_day)
            values (%s, %s, %s, %s, %s, %s, %s) returning id
            """,
            (identity["id"], title, kind, target, unit, start, part),
        ).fetchone()["id"]
        conn.execute(
            """
            insert into public.habit_levels (habit_id, level, description, target)
            values (%s, 'full', %s, %s), (%s, 'minimum', %s, %s)
            """,
            (habit, f"{target} {unit}", target, habit, f"{minimum} {unit}", minimum),
        )
        conn.execute("select tracker.record_habit_version(%s, '2000-01-01 12:00+00')", (habit,))


def clear_checkins(conn, user_id) -> None:
    conn.execute("delete from public.checkins where user_id = %s", (user_id,))
    # Their events go too, the one way the activity log allows.
    conn.execute("select set_config('tracker.deleting_checkins', %s, true)", (str(user_id),))
    conn.execute("delete from public.activity_events where user_id = %s and kind = 'checkin.daily'", (user_id,))


def checkin(conn, user_id, date, tired: bool) -> None:
    """Most days have a check-in. After a long run, energy is low."""
    rng = random.Random(f"{SEED}checkin{date}")
    if rng.random() > 0.85:
        return
    energy = rng.choice([1, 2, 2]) if tired else rng.choice([3, 4, 4, 5])
    conn.execute(
        "select tracker.save_checkin(%s, null, %s::smallint, %s::numeric, %s::smallint, 'tap', %s)",
        (user_id, energy, rng.choice([6.5, 7, 7.5, 8]), rng.choice([3, 4, 4]),
         usual_time(conn, user_id, date, {"title": "checkin"})),
    )  # fmt: skip


def load_habits(conn, user_id) -> list[dict]:
    return conn.execute(
        """
        select h.id, h.title, h.type, h.target, h.unit, h.frequency, h.per_week, h.ends_on,
          (select target from public.habit_levels l
           where l.habit_id = h.id and l.level = 'minimum') as minimum
        from public.habits h
        join public.identities i on i.id = h.identity_id
        where i.user_id = %s and h.archived_at is null
        order by h.created_at
        """,
        (user_id,),
    ).fetchall()


def usual_time(conn, user_id, date, habit):
    """Each habit has its own usual hour, so peak hours have something to show."""
    usual = random.Random(f"{SEED}{habit['title']}").choice([7, 8, 13, 18, 19, 20])
    hour = usual + random.Random(f"{SEED}{habit['title']}{date}").choice([0, 0, 0, 1])
    row = conn.execute(
        """
        select (%s::date + make_time(%s, 15, 0)) at time zone u.timezone as at
        from public.users u where u.id = %s
        """,
        (date, hour, user_id),
    ).fetchone()
    return row["at"]


def attempt(conn, sql: str, values: tuple) -> bool:
    """A repair can be refused by the rules. That's fine: the day stays as it was."""
    try:
        with conn.transaction():
            conn.execute(sql, values)
        return True
    except psycopg.errors.RaiseException:
        return False


def week_shift(date) -> float:
    """Some weeks go well and some don't: a good week makes a miss less likely."""
    monday = date.toordinal() - date.isoweekday() + 1
    kind = random.Random(f"{SEED}week{monday}").random()
    if kind < 0.25:
        return -0.12
    if kind > 0.8:
        return 0.25
    return 0.0


def stretched_habit(habits) -> dict | None:
    """The first amount habit, whose target is set too high for it."""
    return next(
        (h for h in habits if h["type"] in ("count", "duration") and h["frequency"] == "days"),
        None,
    )


def log_weekly(conn, user_id, habit, date, now, tally) -> None:
    """A times-per-week habit: some days have a session, about as often as the quota asks."""
    if habit["ends_on"] is not None and date > habit["ends_on"]:
        return
    roll = random.Random(f"{SEED}{habit['title']}{date}").random() + week_shift(date)
    if roll < (habit["per_week"] or 1) / 7 * 1.1:
        source = random.Random(f"{SEED}source{habit['title']}{date}").choice(SOURCES)
        conn.execute(
            "select tracker.log_habit(%s, %s, %s, 'full', %s, %s, %s)",
            (user_id, habit["id"], date, habit["target"], source, now),
        )
        tally["done"] += 1


def replay(conn, user_id, habits, dates) -> dict[str, int]:
    tally = {"done": 0, "minimum": 0, "partial": 0, "skipped": 0, "missed": 0, "repaired": 0, "long_runs": 0}
    missed_last = {habit["id"]: False for habit in habits}
    stretched = stretched_habit(habits)
    long_before = False

    for date in dates:
        long_today = False
        for habit in habits:
            now = usual_time(conn, user_id, date, habit)
            # The hidden pattern: long runs some days, and Study slipping the day after.
            if habit["title"] == "Long run":
                rng = random.Random(f"{SEED}run{date}")
                if rng.random() < 0.55:
                    km = rng.choice([16, 18, 21]) if rng.random() < 0.45 else rng.choice([5, 6, 8])
                    conn.execute(
                        "select tracker.add_amount(%s, %s, %s, %s, 'km', 'tap', %s)", (user_id, habit["id"], date, km, now)
                    )
                    long_today = km >= 16
                    tally["long_runs"] += long_today
                    tally["done"] += 1
                else:
                    tally["missed"] += 1
                continue
            if habit["title"] == "Study":
                rng = random.Random(f"{SEED}study{date}")
                if rng.random() < (0.3 if long_before else 0.85):
                    conn.execute(
                        "select tracker.add_amount(%s, %s, %s, %s, 'minutes', 'tap', %s)",
                        (user_id, habit["id"], date, rng.choice([30, 45, 50]), now),
                    )
                    tally["done"] += 1
                elif long_before and rng.random() < 0.3 and attempt(
                    conn, "select tracker.skip_habit(%s, %s, %s, 'Tired', 'tap', %s)", (user_id, habit["id"], date, now)
                ):
                    tally["skipped"] += 1
                else:
                    tally["missed"] += 1
                continue
            if habit["frequency"] == "per_week":
                log_weekly(conn, user_id, habit, date, now, tally)
                continue
            scheduled = conn.execute(
                "select tracker.is_scheduled(%s, %s) as yes", (habit["id"], date)
            ).fetchone()
            if not scheduled["yes"]:
                continue

            roll = random.Random(f"{SEED}{habit['title']}{date}").random() + week_shift(date)
            if date.isoweekday() == WEAK_WEEKDAY:
                roll += 0.35
            weekend = date.isoweekday() >= 6
            target = habit["target"]
            has_target = habit["type"] in ("count", "duration")
            source = random.Random(f"{SEED}source{habit['title']}{date}").choice(SOURCES)

            if missed_last[habit["id"]] and roll < 0.6:
                amount = math.ceil(float(target) * 1.5) if has_target else None
                repaired = attempt(
                    conn,
                    "select tracker.repair_habit(%s, %s, %s, %s, %s, %s, %s)",
                    (user_id, habit["id"], date, amount, not has_target, source, now),
                )
                if repaired:
                    tally["repaired"] += 1
                    missed_last[habit["id"]] = False
                    continue

            missed_last[habit["id"]] = False
            if stretched is not None and habit["id"] == stretched["id"] and roll < 0.91:
                # Mostly the minimum or a bit more, now and then short of it, rarely the target.
                minimum = float(habit["minimum"] or 1)
                share = random.Random(f"{SEED}share{date}").random()
                if share < 0.1:
                    amount = float(target)
                elif share < 0.3:
                    amount = max(minimum / 2, 1)
                else:
                    amount = minimum + (float(target) - minimum) * share / 3
                result = conn.execute(
                    "select tracker.add_amount(%s, %s, %s, %s, %s, %s, %s) as r",
                    (user_id, habit["id"], date, round(amount), habit["unit"], source, now),
                ).fetchone()["r"]
                tally["partial" if result["status"] == "partial" else "done"] += 1
            elif roll < (0.62 if weekend else 0.72):
                conn.execute(
                    "select tracker.log_habit(%s, %s, %s, 'full', %s, %s, %s)",
                    (user_id, habit["id"], date, target if has_target else None, source, now),
                )
                tally["done"] += 1
            elif roll < 0.86:
                conn.execute(
                    "select tracker.log_habit(%s, %s, %s, 'minimum', %s, %s, %s)",
                    (user_id, habit["id"], date, habit["minimum"] if has_target else None, source, now),
                )
                tally["minimum"] += 1
            elif roll < 0.91:
                reason = random.Random(f"{SEED}reason{habit['title']}{date}").choice(SKIP_REASONS)
                conn.execute(
                    "select tracker.skip_habit(%s, %s, %s, %s, %s, %s)",
                    (user_id, habit["id"], date, reason, source, now),
                )
                tally["skipped"] += 1
            else:
                tally["missed"] += 1
                # A slipped Wednesday isn't made up, so the weak day shows.
                missed_last[habit["id"]] = date.isoweekday() != WEAK_WEEKDAY
        checkin(conn, user_id, date, long_before)
        long_before = long_today
    return tally


def main() -> None:
    settings = Settings()
    url = next(
        line.split("=", 1)[1].strip().strip("\"'")
        for line in open(".env")
        if line.startswith("DATABASE_URL=")
    )
    url = os.environ.get("SEED_DATABASE_URL", url)

    with psycopg.connect(url, row_factory=dict_row) as conn:
        account = pick_account(settings, conn)
        user_id = account["id"]
        print("Account:", account["email"])

        today = conn.execute(
            "select tracker.local_date(%s, now()) as today", (user_id,)
        ).fetchone()["today"]
        dates = [
            today.fromordinal(today.toordinal() - offset) for offset in range(DAYS, 0, -1)
        ]

        add_pattern_habits(conn, user_id, dates[0])
        clear(conn, user_id, dates[0])
        clear_checkins(conn, user_id)
        habits = load_habits(conn, user_id)
        if not habits:
            sys.exit("Add a habit in the app first, so there's something to fill.")

        tally = replay(conn, user_id, habits, dates)
        conn.execute("select tracker.settle(%s, now())", (user_id,))
        protected = conn.execute(
            "select count(*) as n from public.grace_days where user_id = %s and spent_for_date is not null",
            (user_id,),
        ).fetchone()["n"]

    print(f"{len(habits)} habits, {DAYS} days:", tally, "protected:", protected)
    stretched = stretched_habit(habits)
    if stretched is not None:
        print(f"Target set too high: {stretched['title']}")


main()
