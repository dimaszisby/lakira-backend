"""
Schemathesis hook that injects deterministic IDs sourced from tmp/contract-seed.json.

The hook ensures Hypothesis-generated cases always reference seeded metrics,
metric settings, and metric logs so stateful endpoints hit real resources
instead of random UUIDs that would 404.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import math
import re
import schemathesis
from schemathesis import GenerationMode
from schemathesis.core.control import SkipTest
try:  # Python 3.9+ stdlib
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - fallback for older runtimes
    ZoneInfo = None

SEED_FILE = Path(
    os.getenv("SCHEMATHESIS_SEED_FILE", "")
).expanduser()  # Defaults to repo/tmp/contract-seed.json
FORCED_MODE = (os.getenv("SCHEMATHESIS_LOCAL_MODE_EFFECTIVE") or "").strip().lower()
HOOK_DEBUG_ENABLED = (
    os.getenv("SCHEMATHESIS_HOOK_DEBUG", "").strip().lower() in ("1", "true", "yes")
)


def _load_seed() -> Dict[str, Any]:
    if not SEED_FILE or not SEED_FILE.exists():
        return {}
    try:
        return json.loads(SEED_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


SEED_DATA = _load_seed()
METRICS = SEED_DATA.get("metrics") or {}
CATEGORIES = SEED_DATA.get("categories") or {}
DELETABLE = SEED_DATA.get("deletable") or {}
PRIMARY_USER = SEED_DATA.get("primaryUser") or {}
PRIMARY_USER_EMAIL = PRIMARY_USER.get("email")
PRIMARY_USER_PASSWORD = PRIMARY_USER.get("password")
# The organization the primary token is scoped to. Organization routes answer 403 for any
# other id, so fuzzing them with random UUIDs would only exercise the rejection.
PRIMARY_ORG_ID = PRIMARY_USER.get("organizationId")


def _pick_metric(keys: tuple[str, ...]) -> Optional[Dict[str, Any]]:
    for key in keys:
        if key in METRICS:
            return METRICS[key]
    for entry in METRICS.values():
        return entry
    return None


def _pick_category(keys: tuple[str, ...]) -> Optional[Dict[str, Any]]:
    for key in keys:
        if key in CATEGORIES:
            return CATEGORIES[key]
    for entry in CATEGORIES.values():
        return entry
    return None


def _rotate_ids_for_worker(values: list[str]) -> list[str]:
    if not values:
        return values
    offset = os.getpid() % len(values)
    if offset == 0:
        return values
    return values[offset:] + values[:offset]


PRIMARY_METRIC = _pick_metric(("revenue", "productivity"))
PRIMARY_METRIC_ID = (PRIMARY_METRIC or {}).get("id")
PRIMARY_SETTINGS_ID = (PRIMARY_METRIC or {}).get("settingsId")
PRIMARY_LOG_ID = (PRIMARY_METRIC or {}).get("latestLogId")
PRIMARY_CATEGORY = _pick_category(("revenue", "productivity"))
PRIMARY_CATEGORY_ID = (PRIMARY_CATEGORY or {}).get("id")
DELETABLE_CATEGORY_IDS = _rotate_ids_for_worker(list(DELETABLE.get("categoryIds") or []))
DELETABLE_METRIC_IDS = _rotate_ids_for_worker(list(DELETABLE.get("metricIds") or []))
SETTINGS_CREATE_METRIC_IDS = _rotate_ids_for_worker(
    list(DELETABLE.get("metricIdsWithoutSettings") or [])
)
DELETABLE_SETTINGS_IDS = _rotate_ids_for_worker(
    list(DELETABLE.get("metricSettingsIds") or [])
)
DELETABLE_LOG_IDS = _rotate_ids_for_worker(list(DELETABLE.get("metricLogIds") or []))
DELETABLE_MEMBERSHIP_IDS = _rotate_ids_for_worker(list(DELETABLE.get("membershipIds") or []))
PATCH_MEMBERSHIP_ID = SEED_DATA.get("patchMembershipId")
CREATED_METRIC_IDS: list[str] = []
CREATED_CATEGORY_IDS: list[str] = []
CREATED_LOG_IDS: list[str] = []
CREATED_SETTINGS_IDS: list[str] = []
LAST_CREATED_METRIC_ID: Optional[str] = None
USED_SETTINGS_METRIC_IDS: set[str] = set()
MAX_LOG_VALUE = 1_000_000
LOGGED_AT_COUNTER = 0
MAX_BUCKETS = int(os.getenv("VIZ_MAX_BUCKETS", "400"))
LAST_WINDOW_RE = re.compile(r"^([1-9][0-9]*)([hdwmy])$")
LAST_UNIT_SECONDS = {
    "h": 60 * 60,
    "d": 24 * 60 * 60,
    "w": 7 * 24 * 60 * 60,
    "m": 30 * 24 * 60 * 60,
    "y": 365 * 24 * 60 * 60,
}
BUCKET_SECONDS = {
    "1h": 60 * 60,
    "1d": 24 * 60 * 60,
    "1w": 7 * 24 * 60 * 60,
    "1m": 30 * 24 * 60 * 60,
    "1y": 365 * 24 * 60 * 60,
}
BUCKET_UNIT = {
    "1h": "h",
    "1d": "d",
    "1w": "w",
    "1m": "m",
    "1y": "y",
}
HEADER_NAME_RE = re.compile(r"^[A-Za-z0-9!#$%&'*+.^_`|~-]+$")
HEADER_VALUE_RE = re.compile(r"^[\x20-\x7E]*$")


def _ensure_mapping(mapping: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if mapping is None:
        return {}
    if isinstance(mapping, dict):
        return dict(mapping)
    try:
        return dict(mapping)
    except Exception:
        return {}


def _update(mapping: Optional[Dict[str, Any]], values: Dict[str, Any]) -> Dict[str, Any]:
    target = _ensure_mapping(mapping)
    for key, value in values.items():
        if value is not None:
            target[key] = value
    return target


def _sanitize_headers(headers: Optional[Dict[str, Any]]) -> Dict[str, str]:
    mapping = _ensure_mapping(headers)
    if not mapping:
        return {}
    sanitized: Dict[str, str] = {}
    for key, value in mapping.items():
        if not isinstance(key, str) or not HEADER_NAME_RE.match(key):
            continue
        if isinstance(value, (list, tuple)):
            if not value:
                continue
            value = value[0]
        if value is None:
            continue
        if not isinstance(value, str):
            value = str(value)
        if not HEADER_VALUE_RE.match(value):
            continue
        sanitized[key] = value
    return sanitized


def _pop_deletable(pool: list[str], label: str) -> str:
    if pool:
        return pool.pop(0)
    raise SkipTest(f"No seeded {label} IDs available for delete operations.")


def _normalize_path(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None

    if raw.startswith("http://") or raw.startswith("https://"):
        raw = urlparse(raw).path

    raw = raw.split("?", 1)[0]
    if not raw.startswith("/"):
        raw = f"/{raw}"

    normalized = raw.rstrip("/") or "/"
    for prefix in ("/api/v1", "/api", "api/v1", "api"):
        if normalized == prefix:
            return "/"
        prefixed = f"{prefix}/"
        if normalized.startswith(prefixed):
            return normalized[len(prefix) :]
    return normalized


def _is_path(case, target: str) -> bool:
    normalized_target = _normalize_path(target)
    if normalized_target is None:
        return False

    candidates = [
        getattr(case, "path", None),
        getattr(getattr(case, "operation", None), "path", None),
        getattr(getattr(case, "endpoint", None), "path", None),
    ]
    for candidate in candidates:
        if _normalize_path(candidate) == normalized_target:
            return True
    return False


def _debug_case_path(case, method: str, is_positive: bool) -> None:
    if not HOOK_DEBUG_ENABLED:
        return
    if method != "POST":
        return
    flags = {
        "login": _is_path(case, "/auth/login"),
        "register": _is_path(case, "/auth/register"),
        "categories": _is_path(case, "/metric-categories"),
        "metrics": _is_path(case, "/metrics"),
        "metricLogs": _is_path(case, "/metric-logs"),
        "metricSettings": _is_path(case, "/metric-settings"),
    }
    if not any(flags.values()):
        return
    operation_path = getattr(getattr(case, "operation", None), "path", None)
    endpoint_path = getattr(getattr(case, "endpoint", None), "path", None)
    print(
        "[schemathesis-hook] method=%s positive=%s path=%r operation_path=%r endpoint_path=%r flags=%s"
        % (method, is_positive, getattr(case, "path", None), operation_path, endpoint_path, flags),
        file=sys.stderr,
    )


def _unique_suffix() -> str:
    return uuid.uuid4().hex[:8]


def _is_uuid(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        uuid.UUID(value)
        return True
    except Exception:
        return False


def _next_settings_metric_id() -> Optional[str]:
    while SETTINGS_CREATE_METRIC_IDS:
        metric_id = SETTINGS_CREATE_METRIC_IDS.pop(0)
        if metric_id and metric_id not in USED_SETTINGS_METRIC_IDS:
            USED_SETTINGS_METRIC_IDS.add(metric_id)
            return metric_id
    return None


def _next_logged_at() -> str:
    global LOGGED_AT_COUNTER
    LOGGED_AT_COUNTER += 1
    return _to_iso(datetime.now(timezone.utc) + timedelta(seconds=LOGGED_AT_COUNTER))


def _parse_iso(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    try:
        normalized = value.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_range(query: Dict[str, Any]) -> None:
    start_raw = query.get("start")
    end_raw = query.get("end")

    if start_raw is None and end_raw is None:
        return

    start_dt = _parse_iso(start_raw)
    end_dt = _parse_iso(end_raw)

    if start_dt is None or end_dt is None:
        query.pop("start", None)
        query.pop("end", None)
        return

    if end_dt <= start_dt:
        end_dt = start_dt + timedelta(hours=1)

    bucket = _coerce_bucket(query.get("bucket"))
    bucket_seconds = BUCKET_SECONDS.get(bucket, BUCKET_SECONDS["1d"])
    span_seconds = (end_dt - start_dt).total_seconds()
    est = math.ceil(span_seconds / bucket_seconds) + 2
    if est > MAX_BUCKETS:
        end_dt = start_dt + timedelta(
            seconds=bucket_seconds * max(MAX_BUCKETS - 2, 1)
        )

    query["start"] = _to_iso(start_dt)
    query["end"] = _to_iso(end_dt)


def _coerce_bucket(value: Any) -> str:
    if isinstance(value, (list, tuple)) and value:
        value = value[0]
    if isinstance(value, str) and value in BUCKET_SECONDS:
        return value
    return "1d"


def _normalize_dashboard_limit(query: Dict[str, Any]) -> None:
    raw = query.get("limit")
    if raw is None:
        return
    try:
        value = int(raw)
    except Exception:
        query["limit"] = 10
        return
    if value < 1:
        query["limit"] = 1
    elif value > 48:
        query["limit"] = 48
    else:
        query["limit"] = value


def _safe_last(bucket: Any) -> str:
    unit = BUCKET_UNIT.get(_coerce_bucket(bucket), "d")
    amount = min(30, MAX_BUCKETS)
    return f"{amount}{unit}"


def _normalize_last(query: Dict[str, Any], *, allow_with_range: bool = True) -> None:
    if not allow_with_range and (query.get("start") is not None or query.get("end") is not None):
        query.pop("last", None)
        return
    last_raw = query.get("last")
    bucket = _coerce_bucket(query.get("bucket"))
    if not isinstance(last_raw, str) or not last_raw:
        query["last"] = _safe_last(bucket)
        return
    match = LAST_WINDOW_RE.match(last_raw.strip())
    if match is None:
        query["last"] = _safe_last(bucket)
        return
    amount = int(match.group(1))
    unit = match.group(2)
    if amount <= 0:
        query["last"] = _safe_last(bucket)
        return
    bucket_seconds = BUCKET_SECONDS.get(bucket, BUCKET_SECONDS["1d"])
    window_seconds = amount * LAST_UNIT_SECONDS[unit]
    est = math.ceil(window_seconds / bucket_seconds) + 2
    if est > MAX_BUCKETS:
        query["last"] = _safe_last(bucket)


def _is_valid_tz(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    if value.upper() == "UTC":
        return True
    if ZoneInfo is None:
        return value in {"Asia/Jakarta", "America/New_York", "Europe/London"}
    try:
        ZoneInfo(value)
        return True
    except Exception:
        return False


def _force_valid_tz(query: Dict[str, Any]) -> None:
    tz = query.get("tz")
    if tz is None:
        return
    if not isinstance(tz, str) or not _is_valid_tz(tz):
        query["tz"] = "UTC"


def _sanitize_filter(query: Dict[str, Any]) -> None:
    if "filter" in query and not isinstance(query["filter"], dict):
        query.pop("filter", None)
    if isinstance(query.get("filter"), dict) and not query["filter"]:
        query.pop("filter", None)


def _set_case_body(case, body: Dict[str, Any]) -> None:
    operation_body = getattr(case, "operation", None)
    if operation_body is None or not hasattr(operation_body, "body"):
        return
    alternatives = list(operation_body.body)
    if not alternatives:
        return
    case.body = body
    media_type = getattr(case, "media_type", None)
    if not media_type or all(alt.media_type != media_type for alt in alternatives):
        case.media_type = alternatives[0].media_type


def _is_positive_case(case) -> bool:
    if FORCED_MODE == "positive":
        return True
    if FORCED_MODE == "negative":
        return False

    meta = getattr(case, "meta", None)
    generation = getattr(meta, "generation", None)
    mode = getattr(generation, "mode", None)
    if mode is None:
        return True

    # Schemathesis versions expose this field in different shapes:
    # - Enum-like object with `is_positive`
    # - Enum/string-like value
    # Keep detection resilient so positive-only runs still get seed normalization.
    is_positive = getattr(mode, "is_positive", None)
    if is_positive is not None:
        return bool(is_positive)

    raw_mode = mode
    if hasattr(mode, "value"):
        raw_mode = getattr(mode, "value")
    mode_text = str(raw_mode).strip().lower()
    if "positive" in mode_text:
        return True
    if "negative" in mode_text:
        return False

    return mode == GenerationMode.POSITIVE


@schemathesis.hook("before_call")
def inject_seeded_ids(context, case, kwargs) -> None:  # kwargs unused but required by hook spec
    is_positive = _is_positive_case(case)
    method = getattr(case, "method", "GET").upper()
    _debug_case_path(case, method, is_positive)

    case.headers = _sanitize_headers(case.headers)
    if not is_positive:
        if _is_path(case, "/auth/register"):
            raise SkipTest("Skip negative register cases (false positives).")

    query = _ensure_mapping(case.query)
    if "" in query:
        query.pop("", None)
        case.query = query
    if isinstance(query, dict):
        _sanitize_filter(query)
        case.query = query

    if is_positive and method == "POST" and _is_path(case, "/auth/login"):
        body = case.body if isinstance(case.body, dict) else {}
        if PRIMARY_USER_EMAIL and PRIMARY_USER_PASSWORD:
            body["email"] = PRIMARY_USER_EMAIL
            body["password"] = PRIMARY_USER_PASSWORD
        _set_case_body(case, body)
    if is_positive and method == "PUT" and _is_path(case, "/auth/profile"):
        body = case.body if isinstance(case.body, dict) else {}
        username = PRIMARY_USER.get("username")
        if isinstance(username, str) and username:
            body["username"] = username
        if isinstance(PRIMARY_USER_EMAIL, str) and PRIMARY_USER_EMAIL:
            body["email"] = PRIMARY_USER_EMAIL
        body["isPublicProfile"] = bool(PRIMARY_USER.get("isPublicProfile", True))
        # Keep the credential baseline stable across generated auth flows.
        body.pop("password", None)
        body.pop("role", None)
        _set_case_body(case, body)

    # Keep generated negative cases intact so Schemathesis can assert rejection paths.
    if not is_positive:
        return

    # Metrics CRUD
    if _is_path(case, "/metrics/{id}"):
        override_id = PRIMARY_METRIC_ID
        if method == "DELETE":
            if CREATED_METRIC_IDS:
                override_id = CREATED_METRIC_IDS.pop(0)
            elif LAST_CREATED_METRIC_ID:
                override_id = LAST_CREATED_METRIC_ID
            elif DELETABLE_METRIC_IDS:
                override_id = _pop_deletable(DELETABLE_METRIC_IDS, "metric")
            else:
                raise SkipTest("No deletable metric ID available for delete.")
        elif method in ("PUT", "PATCH") and LAST_CREATED_METRIC_ID:
            override_id = LAST_CREATED_METRIC_ID
        case.path_parameters = _update(case.path_parameters, {"id": override_id})
        if method in ("PUT", "PATCH"):
            body = case.body if isinstance(case.body, dict) else {}
            if "categoryId" in body:
                category_id = body.get("categoryId")
                if category_id in (None, ""):
                    body.pop("categoryId", None)
                elif PRIMARY_CATEGORY_ID is not None and not _is_uuid(category_id):
                    body["categoryId"] = PRIMARY_CATEGORY_ID
            if "originalMetricId" in body:
                original_id = body.get("originalMetricId")
                if original_id in (None, ""):
                    body.pop("originalMetricId", None)
                elif not _is_uuid(original_id):
                    body["originalMetricId"] = None
            if "name" in body:
                body["name"] = f"metric-{_unique_suffix()}"
            if not body:
                body["name"] = f"metric-{_unique_suffix()}"
            _set_case_body(case, body)

    if _is_path(case, "/metrics/{metricId}/trends"):
        case.path_parameters = _update(
            case.path_parameters, {"metricId": PRIMARY_METRIC_ID}
        )

    if _is_path(case, "/metric-categories/{id}"):
        category_id = PRIMARY_CATEGORY_ID
        if method == "DELETE":
            if CREATED_CATEGORY_IDS:
                category_id = CREATED_CATEGORY_IDS.pop(0)
            else:
                category_id = _pop_deletable(
                    DELETABLE_CATEGORY_IDS, "metric category"
                )
        case.path_parameters = _update(case.path_parameters, {"id": category_id})
        if method in ("PUT", "PATCH"):
            body = case.body if isinstance(case.body, dict) else {}
            body["name"] = f"category-{_unique_suffix()}"
            body.setdefault("color", "#10B981")
            body.setdefault("icon", "🧪")
            _set_case_body(case, body)

    # Organization routes (fuzz-organization-routes kit)
    if _is_path(case, "/organizations/{id}/members"):
        case.path_parameters = _update(case.path_parameters, {"id": PRIMARY_ORG_ID})
    if _is_path(case, "/memberships/{id}"):
        if method == "DELETE":
            membership_id = _pop_deletable(DELETABLE_MEMBERSHIP_IDS, "membership")
        else:
            membership_id = PATCH_MEMBERSHIP_ID
            body = case.body if isinstance(case.body, dict) else {}
            if body.get("role") not in ("admin", "member"):
                body["role"] = "member"
            _set_case_body(case, body)
        case.path_parameters = _update(case.path_parameters, {"id": membership_id})
    if method == "POST" and _is_path(case, "/organizations/{id}/invites"):
        case.path_parameters = _update(case.path_parameters, {"id": PRIMARY_ORG_ID})
        body = case.body if isinstance(case.body, dict) else {}
        # A unique address per case: a repeat is (correctly) a 409 pending-invite conflict.
        body["email"] = f"invitee-{_unique_suffix()}@example.com"
        if body.get("role") not in ("admin", "member"):
            body["role"] = "member"
        _set_case_body(case, body)

    # Analytics dashboard range normalization (no seed data required).
    if _is_path(case, "/analytics/dashboard"):
        query = _ensure_mapping(case.query)
        query["bucket"] = _coerce_bucket(query.get("bucket"))
        _normalize_range(query)
        _normalize_last(query, allow_with_range=False)
        _normalize_dashboard_limit(query)
        _force_valid_tz(query)
        case.query = query

    # Analytics visualizations per metric
    if _is_path(case, "/analytics/metrics/{metricId}"):
        case.path_parameters = _update(
            case.path_parameters, {"metricId": PRIMARY_METRIC_ID}
        )
        query = _ensure_mapping(case.query)
        query["bucket"] = _coerce_bucket(query.get("bucket"))
        _normalize_range(query)
        _normalize_last(query, allow_with_range=False)
        _force_valid_tz(query)
        case.query = query

    # Metric Settings endpoints with {id} + query metricId
    if _is_path(case, "/metric-settings/{id}"):
        settings_id = PRIMARY_SETTINGS_ID
        if method == "DELETE":
            if CREATED_SETTINGS_IDS:
                settings_id = CREATED_SETTINGS_IDS.pop(0)
            else:
                settings_id = _pop_deletable(
                    DELETABLE_SETTINGS_IDS, "metric settings"
                )
        case.path_parameters = _update(case.path_parameters, {"id": settings_id})

    if (
        PRIMARY_SETTINGS_ID is not None
        and _is_path(case, "/metric-settings/{id}/achieve")
    ):
        case.path_parameters = _update(case.path_parameters, {"id": PRIMARY_SETTINGS_ID})

    if (
        PRIMARY_SETTINGS_ID is not None
        and _is_path(case, "/metric-settings/{id}/display")
    ):
        case.path_parameters = _update(case.path_parameters, {"id": PRIMARY_SETTINGS_ID})
        if method in ("PATCH", "PUT"):
            body = case.body if isinstance(case.body, dict) else {}
            display = body.get("displayOptions")
            if not isinstance(display, dict) or not display:
                body["displayOptions"] = {"showOnDashboard": True}
            _set_case_body(case, body)

    # Metric Settings cursor filters
    if method == "GET" and _is_path(case, "/metric-settings"):
        case.query = _update(case.query, {"filter[metricId]": PRIMARY_METRIC_ID})

    # Metric Logs endpoints
    if _is_path(case, "/metric-logs/{id}"):
        log_id = PRIMARY_LOG_ID
        if method == "DELETE":
            if CREATED_LOG_IDS:
                log_id = CREATED_LOG_IDS.pop(0)
            else:
                log_id = _pop_deletable(DELETABLE_LOG_IDS, "metric log")
        case.path_parameters = _update(case.path_parameters, {"id": log_id})
        if method == "GET":
            case.query = _update(case.query, {"metricId": PRIMARY_METRIC_ID})

    if method == "GET" and _is_path(case, "/metric-logs"):
        case.query = _update(case.query, {"filter[metricId]": PRIMARY_METRIC_ID})

    if _is_path(case, "/metric-logs/stats"):
        case.query = _update(case.query, {"metricId": PRIMARY_METRIC_ID})

    # Ensure POST bodies reference seeded metric IDs when applicable
    if method == "POST" and _is_path(case, "/metric-logs"):
        body = case.body if isinstance(case.body, dict) else {}
        if PRIMARY_METRIC_ID is not None:
            body["metricId"] = PRIMARY_METRIC_ID
        if body.get("type") not in ("manual", "automatic"):
            body["type"] = "manual"
        log_value = body.get("logValue")
        if (
            not isinstance(log_value, (int, float))
            or log_value < 0
            or log_value > MAX_LOG_VALUE
        ):
            body["logValue"] = 1
        body["loggedAt"] = _next_logged_at()
        _set_case_body(case, body)

    if method == "POST" and _is_path(case, "/metric-settings"):
        metric_id = _next_settings_metric_id()
        if not metric_id:
            raise SkipTest(
                "No seeded metric IDs available for metric settings creation."
            )
        USED_SETTINGS_METRIC_IDS.add(metric_id)
        body = {
            "metricId": metric_id,
            "goalEnabled": False,
            "goalType": None,
            "goalValue": None,
            "timeFrameEnabled": False,
            "startDate": None,
            "deadlineDate": None,
            "alertEnabled": False,
            "alertThresholds": None,
            "displayOptions": {
                "showOnDashboard": True,
                "priority": 1,
                "chartType": "line",
                "color": "#E897A3",
            },
        }
        _set_case_body(case, body)

    if method in ("PUT", "PATCH") and _is_path(case, "/metric-settings/{id}"):
        body = case.body if isinstance(case.body, dict) else {}
        if not body:
            body["alertEnabled"] = False
        if body.get("goalEnabled") is True:
            if body.get("goalType") in (None, ""):
                body["goalType"] = "cumulative"
            goal_value = body.get("goalValue")
            if not isinstance(goal_value, (int, float)) or goal_value <= 0:
                body["goalValue"] = 1
        elif body.get("goalEnabled") is False:
            if body.get("goalType") not in (None, "cumulative", "incremental"):
                body.pop("goalType", None)
            goal_value = body.get("goalValue")
            if isinstance(goal_value, (int, float)) and goal_value <= 0:
                body["goalValue"] = None
        start_dt = _parse_iso(body.get("startDate"))
        deadline_dt = _parse_iso(body.get("deadlineDate"))
        time_frame_enabled = body.get("timeFrameEnabled") is True
        has_start = "startDate" in body
        has_deadline = "deadlineDate" in body
        requires_dates = time_frame_enabled or has_start or has_deadline
        if requires_dates and start_dt is None:
            start_dt = datetime.now(timezone.utc)
            body["startDate"] = _to_iso(start_dt)
        if requires_dates and deadline_dt is None:
            base_dt = start_dt or datetime.now(timezone.utc)
            deadline_dt = base_dt + timedelta(days=1)
            body["deadlineDate"] = _to_iso(deadline_dt)
        if start_dt and deadline_dt and deadline_dt <= start_dt:
            deadline_dt = start_dt + timedelta(days=1)
            body["deadlineDate"] = _to_iso(deadline_dt)
        if body.get("alertEnabled") is True:
            threshold = body.get("alertThresholds")
            if (
                not isinstance(threshold, int)
                or isinstance(threshold, bool)
                or not (0 <= threshold <= 100)
            ):
                body["alertThresholds"] = 80
        elif body.get("alertEnabled") is False:
            body["alertThresholds"] = None
        _set_case_body(case, body)

    # Ensure creates use unique identifiers to avoid conflict 409s.
    if method == "POST" and _is_path(case, "/auth/register"):
        body = case.body if isinstance(case.body, dict) else {}
        suffix = _unique_suffix()
        body["username"] = f"schemathesis_{suffix}"
        body["email"] = f"schemathesis_{suffix}@example.com"
        password = body.get("password") or "newpassword123"
        body["password"] = password
        body["passwordConfirmation"] = password
        body["isPublicProfile"] = True
        _set_case_body(case, body)

    if method == "POST" and _is_path(case, "/metric-categories"):
        body = case.body if isinstance(case.body, dict) else {}
        suffix = _unique_suffix()
        body["name"] = f"category-{suffix}"
        body.setdefault("color", "#10B981")
        body.setdefault("icon", "🧪")
        _set_case_body(case, body)

    if method == "POST" and _is_path(case, "/metrics"):
        body = case.body if isinstance(case.body, dict) else {}
        suffix = _unique_suffix()
        body["name"] = f"metric-{suffix}"
        if "categoryId" in body:
            category_id = body.get("categoryId")
            if category_id in (None, ""):
                body.pop("categoryId", None)
            elif PRIMARY_CATEGORY_ID is not None and not _is_uuid(category_id):
                body["categoryId"] = PRIMARY_CATEGORY_ID
        if "originalMetricId" in body:
            original_id = body.get("originalMetricId")
            if original_id in (None, ""):
                body.pop("originalMetricId", None)
            elif PRIMARY_METRIC_ID is not None and not _is_uuid(original_id):
                body["originalMetricId"] = PRIMARY_METRIC_ID
        _set_case_body(case, body)


@schemathesis.hook("after_call")
def capture_created_metric(context, case, response) -> None:
    if getattr(case, "method", "GET").upper() != "POST":
        return
    if not _is_path(case, "/metrics"):
        return
    if response.status_code not in (200, 201):
        return
    try:
        payload = response.json()
    except Exception:
        return
    metric_id = payload.get("data", {}).get("id")
    if isinstance(metric_id, str) and metric_id:
        global LAST_CREATED_METRIC_ID
        LAST_CREATED_METRIC_ID = metric_id
        CREATED_METRIC_IDS.append(metric_id)


@schemathesis.hook("after_call")
def capture_created_metric_log(context, case, response) -> None:
    if getattr(case, "method", "GET").upper() != "POST":
        return
    if not _is_path(case, "/metric-logs"):
        return
    if response.status_code not in (200, 201):
        return
    try:
        payload = response.json()
    except Exception:
        return
    log_id = payload.get("data", {}).get("id")
    if isinstance(log_id, str) and log_id:
        CREATED_LOG_IDS.append(log_id)


@schemathesis.hook("after_call")
def capture_created_metric_category(context, case, response) -> None:
    if getattr(case, "method", "GET").upper() != "POST":
        return
    if not _is_path(case, "/metric-categories"):
        return
    if response.status_code not in (200, 201):
        return
    try:
        payload = response.json()
    except Exception:
        return
    category_id = payload.get("data", {}).get("id")
    if isinstance(category_id, str) and category_id:
        CREATED_CATEGORY_IDS.append(category_id)


@schemathesis.hook("after_call")
def capture_created_metric_settings(context, case, response) -> None:
    if getattr(case, "method", "GET").upper() != "POST":
        return
    if not _is_path(case, "/metric-settings"):
        return
    if response.status_code not in (200, 201):
        return
    try:
        payload = response.json()
    except Exception:
        return
    settings_id = payload.get("data", {}).get("id")
    if isinstance(settings_id, str) and settings_id:
        CREATED_SETTINGS_IDS.append(settings_id)
