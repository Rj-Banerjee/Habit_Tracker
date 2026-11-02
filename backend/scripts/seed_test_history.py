"""Fills the one account in AI_TEST_USER_IDS with 60 days of made-up history, so Progress
has something to show. Safe to re-run: it replaces that account's logs and nothing else.

It replays each day through the real logging rules with a backdated clock, so repairs
and protected days are genuine. Run from backend/:

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

DAYS = 60
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


def load_habits(conn, user_id) -> list[dict]:
    return conn.execute(
        """
        select h.id, h.title, h.type, h.target,
          (select target from public.habit_levels l
           where l.habit_id = h.id and l.level = 'minimum') as minimum
        from public.habits h
        join public.identities i on i.id = h.identity_id
        where i.user_id = %s and h.archived_at is null
        order by h.created_at
        """,
        (user_id,),
    ).fetchall()


def noon(conn, user_id, date):
    row = conn.execute(
        """
        select (%s::date + time '12:00') at time zone u.timezone as at
        from public.users u where u.id = %s
        """,
        (date, user_id),
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


def replay(conn, user_id, habits, dates) -> dict[str, int]:
    tally = {"done": 0, "minimum": 0, "skipped": 0, "missed": 0, "repaired": 0}
    missed_last = {habit["id"]: False for habit in habits}

    for date in dates:
        now = noon(conn, user_id, date)
        for habit in habits:
            scheduled = conn.execute(
                "select tracker.is_scheduled(%s, %s) as yes", (habit["id"], date)
            ).fetchone()
            if not scheduled["yes"]:
                continue

            roll = random.Random(f"{SEED}{habit['title']}{date}").random()
            weekend = date.isoweekday() >= 6
            target = habit["target"]
            has_target = habit["type"] in ("count", "duration")

            if missed_last[habit["id"]] and roll < 0.6:
                amount = math.ceil(float(target) * 1.5) if has_target else None
                repaired = attempt(
                    conn,
                    "select tracker.repair_habit(%s, %s, %s, %s, %s, 'tap', %s)",
                    (user_id, habit["id"], date, amount, not has_target, now),
                )
                if repaired:
                    tally["repaired"] += 1
                    missed_last[habit["id"]] = False
                    continue

            missed_last[habit["id"]] = False
            if roll < (0.62 if weekend else 0.72):
                conn.execute(
                    "select tracker.log_habit(%s, %s, %s, 'full', %s, 'tap', %s)",
                    (user_id, habit["id"], date, target if has_target else None, now),
                )
                tally["done"] += 1
            elif roll < 0.86:
                conn.execute(
                    "select tracker.log_habit(%s, %s, %s, 'minimum', %s, 'tap', %s)",
                    (user_id, habit["id"], date, habit["minimum"] if has_target else None, now),
                )
                tally["minimum"] += 1
            elif roll < 0.91:
                conn.execute(
                    "select tracker.skip_habit(%s, %s, %s, 'Busy day', 'tap', %s)",
                    (user_id, habit["id"], date, now),
                )
                tally["skipped"] += 1
            else:
                tally["missed"] += 1
                missed_last[habit["id"]] = True
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

        clear(conn, user_id, dates[0])
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


main()
