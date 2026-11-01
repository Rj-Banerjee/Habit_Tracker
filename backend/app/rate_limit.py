from .llm.reliable import Window

HOUR = 3600.0


class UserLimits:
    """One window per person and action. In memory, so it restarts with the service
    and needs moving to shared storage before running more than one process."""

    def __init__(self) -> None:
        self.windows: dict[tuple[str, str], Window] = {}

    def wait_needed(self, user_id: str, action: str, per_hour: int) -> float:
        window = self.windows.setdefault((user_id, action), Window(per_hour, HOUR))
        wait = window.wait_needed()
        if not wait:
            window.record()
        return wait
