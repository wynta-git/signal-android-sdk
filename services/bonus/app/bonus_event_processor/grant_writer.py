from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import aiomysql
import structlog

from app.bonus_event_processor.chunk_release_handler import release_all_chunks

log = structlog.get_logger(__name__)

_OCCURRENCE_COUNT_SQL = """
    SELECT COUNT(*) FROM bonus_grant
    WHERE pam_user_id = %s AND configure_id = %s
"""

_APPLICABILITY_COUNT_SQL = """
    SELECT COUNT(*) FROM bonus_grant
    WHERE pam_user_id = %s AND configure_id = %s AND {where_extra}
"""

_INSERT_GRANT_SQL = """
    INSERT INTO bonus_grant
        (player_bonus_id, configure_id, subhead_id, head_id, site_id, pam_user_id,
         event_id, product, wager_multiplier, no_of_chunks,
         chunk_expiry_days, bonus_expiry_days,
         wager_chip_type, credit_chip_type, grant_amount,
         bonus_code, release_amount, bonus_grant_type)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""
# product comes from bonus_release_trigger.product (trigger["product"]); may be NULL

_INSERT_CHUNK_SQL = """
    INSERT INTO bonus_chunk (chunk_ref, bonus_grant_id, chunk_amount, wager_multiplier, required_wager_amount, status)
    VALUES (%s, %s, %s, %s, %s, %s)
"""

_UPSERT_BUDGET_SQL = """
    INSERT INTO bonus_budget_usage (entity_type, entity_id, site_id, period_type, budget_used)
    VALUES (%s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE budget_used = budget_used + VALUES(budget_used)
"""


def compute_cashback_amount(configure: dict[str, Any], trigger_amount: float | None) -> Decimal:
    fixed = configure.get("cashback_bonus_amount_fixed")
    pct = configure.get("cashback_bonus_amount_percent")
    cap = configure.get("cashback_bonus_amount_max")

    if fixed is not None:
        amount = Decimal(str(fixed))
    elif pct is not None and trigger_amount:
        amount = (Decimal(str(trigger_amount)) * Decimal(str(pct)) / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    else:
        return Decimal("0.00")

    if cap is not None:
        amount = min(amount, Decimal(str(cap)))
    return amount


def compute_grant_amount(configure: dict[str, Any], trigger_amount: float | None) -> Decimal:
    fixed = configure.get("bonus_amount_fixed")
    pct = configure.get("bonus_amount_percent")
    cap = configure.get("bonus_amount_max")
    no_of_chunks = configure.get("no_of_chunks")

    if(no_of_chunks is None or no_of_chunks ==0):
        return  Decimal("0.00")

    if fixed is not None:
        amount = Decimal(str(fixed))
    elif pct is not None and trigger_amount:
        amount = (Decimal(str(trigger_amount)) * Decimal(str(pct)) / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    else:
        return Decimal("0.00")

    if cap is not None:
        amount = min(amount, Decimal(str(cap)))

    return amount


async def check_occurrence(
    cur: aiomysql.Cursor,
    pam_user_id: int,
    configure_id: int,
    occurrence: int,
) -> bool:
    if occurrence == 0:
        return True
    await cur.execute(_OCCURRENCE_COUNT_SQL, (pam_user_id, configure_id))
    row = await cur.fetchone()
    count: int = row[0] if row else 0
    return count == occurrence - 1


async def check_applicability(
    cur: aiomysql.Cursor,
    pam_user_id: int,
    configure_id: int,
    freq: str,
) -> bool:
    if freq == "EVERYTIME":
        return True

    if freq == "ONCE":
        sql = _APPLICABILITY_COUNT_SQL.format(where_extra="1=1")
    elif freq == "MONTHLY":
        sql = _APPLICABILITY_COUNT_SQL.format(
            where_extra="YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())"
        )
    elif freq == "WEEKLY":
        sql = _APPLICABILITY_COUNT_SQL.format(
            where_extra="YEARWEEK(created_at, 1) = YEARWEEK(NOW(), 1)"
        )
    else:
        log.warning("unknown_applicability_frequency", freq=freq)
        return True

    await cur.execute(sql, (pam_user_id, configure_id))
    row = await cur.fetchone()
    return (row[0] if row else 0) == 0


async def write_grant(
    conn: aiomysql.Connection,
    trigger: dict[str, Any],
    configure: dict[str, Any],
    pam_user_id: int,
    site_id: int,
    grant_amount: Decimal,
    player_bonus_id: int,
    event_id: str,
    bonus_code: str | None = None,
) -> int:
    wager_multiplier = configure["wager_multiplier"]
    no_of_chunks: int = configure["no_of_chunks"]
    chunk_amount = (grant_amount / Decimal(str(no_of_chunks))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    required_wager_amount = (chunk_amount * Decimal(str(wager_multiplier))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    async with conn.cursor() as cur:
        await cur.execute(
            _INSERT_GRANT_SQL,
            (
                player_bonus_id,
                configure["id"],
                configure["subhead_id"],
                configure["head_id"],
                site_id,
                pam_user_id,
                event_id,
                trigger["product"],
                wager_multiplier,
                no_of_chunks,
                configure["chunk_expiry_days"],
                configure["bonus_expiry_days"],
                configure["wager_chip_type"],
                configure["credit_chip_type"],
                grant_amount,
                bonus_code,
                Decimal("0.00"),
                "CHUNK",
            ),
        )
        grant_id: int = cur.lastrowid  # type: ignore[assignment]

        for i in range(1, no_of_chunks + 1):
            await cur.execute(
                _INSERT_CHUNK_SQL,
                (f"CH{i:03d}", grant_id, chunk_amount, wager_multiplier, required_wager_amount, "PENDING"),
            )

        entities = [
            ("CONFIGURE", configure["id"]),
            ("SUBHEAD", configure["subhead_id"]),
            ("HEAD", configure["head_id"]),
        ]
        for entity_type, entity_id in entities:
            for period in ["DAILY", "WEEKLY", "MONTHLY"]:
                await cur.execute(
                    _UPSERT_BUDGET_SQL,
                    (entity_type, entity_id, site_id, period, grant_amount),
                )

        await conn.commit()

    if Decimal(str(wager_multiplier)) == Decimal("0"):
        await release_all_chunks(conn, grant_id)

    log.info(
        "bonus_grant_written",
        grant_id=grant_id,
        configure_id=configure["id"],
        pam_user_id=pam_user_id,
        site_id=site_id,
        grant_amount=str(grant_amount),
        no_of_chunks=no_of_chunks,
    )
    return grant_id


async def write_cashback_grant(
    conn: aiomysql.Connection,
    trigger: dict[str, Any],
    configure: dict[str, Any],
    pam_user_id: int,
    site_id: int,
    cashback_amount: Decimal,
    player_bonus_id: int,
    event_id: str,
    bonus_code: str | None = None,
) -> int:
    """Create a single-chunk cashback grant (wager_multiplier=0) and immediately release it."""
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                _INSERT_GRANT_SQL,
                (
                    player_bonus_id,
                    configure["id"],
                    configure["subhead_id"],
                    configure["head_id"],
                    site_id,
                    pam_user_id,
                    event_id,
                    trigger["product"],
                    0,
                    1,
                    configure["chunk_expiry_days"],
                    configure["bonus_expiry_days"],
                    configure["wager_chip_type"],
                    configure["credit_chip_type"],
                    cashback_amount,
                    bonus_code,
                    Decimal("0.00"),
                    "CASHBACK",
                ),
            )
            grant_id: int = cur.lastrowid  # type: ignore[assignment]

            await cur.execute(
                _INSERT_CHUNK_SQL,
                ("CH001", grant_id, cashback_amount, 0, Decimal("0.00"), "PENDING"),
            )

            entities = [
                ("CONFIGURE", configure["id"]),
                ("SUBHEAD", configure["subhead_id"]),
                ("HEAD", configure["head_id"]),
            ]
            for entity_type, entity_id in entities:
                for period in ["DAILY", "WEEKLY", "MONTHLY"]:
                    await cur.execute(
                        _UPSERT_BUDGET_SQL,
                        (entity_type, entity_id, site_id, period, cashback_amount),
                    )

            await conn.commit()

        await release_all_chunks(conn, grant_id)

        log.info(
            "cashback_grant_written",
            grant_id=grant_id,
            configure_id=configure["id"],
            pam_user_id=pam_user_id,
            site_id=site_id,
            cashback_amount=str(cashback_amount),
        )
        return grant_id

    except Exception as exc:
        log.error(
            "cashback_grant_failed",
            configure_id=configure["id"],
            pam_user_id=pam_user_id,
            site_id=site_id,
            cashback_amount=str(cashback_amount),
            error=str(exc),
        )
        raise
