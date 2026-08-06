from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """Small per-process limiter suitable for an MVP/single worker.

    Production deployments with more than one worker should replace this with
    a shared Redis-backed limiter at the reverse proxy or application layer.
    """

    def __init__(self, requests: int, window_seconds: int) -> None:
        self.requests = requests
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def retry_after(self, key: str) -> int | None:
        now = time.monotonic()
        cutoff = now - self.window_seconds

        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()

            if len(events) >= self.requests:
                return max(1, int(self.window_seconds - (now - events[0])) + 1)

            events.append(now)
            return None

