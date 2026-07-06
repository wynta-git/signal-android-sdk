import calendar
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import aiomysql
import structlog
from redis.asyncio import Redis

from shared.clients.mysql import POOL_BONUS, get_connection
from shared.services.client import get_site_config
from shared.services.user import get_or_create_pam_user, get_pam_user_id
from app.bonus_event_processor.grant_writer import check_applicability
from app.bonus_event_processor.eligibility_checker import check_eligibility
from app.services.bonus_configure_code_service import code_validity_sql
from app.exceptions import (
    DatabaseError,
    PlayerBonusAlreadyRevertedError,
    PlayerBonusConsumedError,
    PlayerBonusNotFoundError,
)
from app.models.player_bonus import (
    ApplicableCodeResponse,
    BonusChunkDetail,
    BonusExpiryDetail,
    BonusForfeitDetail,
    ChunkConsumeEvent,
    ChunkConsumedRow,
    ChunkReleaseEvent,
    ChunkReleaseRow,
    ConsumeTxnDetail,
    ExpiryTxnDetail,
    ForfeitTxnDetail,
    GrantTxnDetail,
    PlayerBonusConsumeCreate,
    PlayerBonusConsumedResponse,
    PlayerBonusRevertResponse,
    PlayerBonusSummaryResponse,
    PlayerBonusTransactionDetail,
    PlayerBonusTransactionSummary,
    PlayerReferralCodeResponse,
    ReleaseTxnDetail,
    ValidateCodeResponse,
)

log = structlog.get_logger(__name__)

_UTC = timezone.utc

# ── 1. Applicable codes ───────────────────────────────────────────────────────

_APPLICABLE_CODES_SQL = f"""
    SELECT
        bcc.id, bcc.code, bcc.max_amount,
        bcc.valid_from, bcc.valid_to, bcc.display_title, bcc.display_description,
        bcc.terms_url, bcc.banner_image_url, bcc.badge_text, bcc.cta_text,
        bcc.auto_apply, bcc.display_order, bcc.display_on, bcc.min_display_amount,
        bc.wager_multiplier, bc.no_of_chunks, bc.applicability_frequency,
        bc.id AS configure_id, bcc.system_auto_apply
    FROM bonus_configure_code bcc
    JOIN bonus_configure bc ON bc.id = bcc.configure_id AND bc.active = 1
    WHERE {code_validity_sql("bcc")}
      AND bcc.site_id = %s
      AND bc.wager_chip_type = %s
      AND bcc.system_auto_apply = 0
      AND bc.start_date <= NOW()
      AND bc.end_date   >= NOW()
    ORDER BY bcc.display_order ASC
"""


def _matches_display_on(raw: str | None, requested: str) -> bool:
    """True if `requested` is one of the comma-separated flows in `raw`."""
    flows = {tok.strip().upper() for tok in (raw or "DEPOSIT").split(",") if tok.strip()}
    return requested.strip().upper() in flows


async def list_applicable_codes(
    user_id: str,
    chip_type: str,
    redis: Redis | None = None,
    site_id: int | None = None,
    display_on: str = "DEPOSIT",
) -> list[ApplicableCodeResponse]:
    log.info("player_bonus.list_applicable_codes", user_id=user_id, chip_type=chip_type, display_on=display_on)

    pam_user_id: int | None = None
    if redis and site_id:
        pam_user_id = await get_pam_user_id(redis, site_id, user_id)

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_APPLICABLE_CODES_SQL, (site_id, chip_type))
                rows = await cur.fetchall()

                results: list[ApplicableCodeResponse] = []
                for row in rows:
                    configure_id: int = row[18]

                    # System-auto-apply codes are never manually selectable.
                    if row[19]:
                        continue

                    if not _matches_display_on(row[13], display_on):
                        continue

                    if pam_user_id is not None:
                        if not await check_applicability(cur, pam_user_id, configure_id, row[17]):
                            continue
                        if redis and not await check_eligibility(redis, configure_id, {"site_id": site_id, "user_id": user_id}):
                            continue

                    results.append(ApplicableCodeResponse(
                        promo_id=row[0], code=row[1], max_amount=row[2],
                        valid_from=row[3], valid_to=row[4],
                        display_title=row[5], display_description=row[6], terms_url=row[7],
                        banner_image_url=row[8], badge_text=row[9], cta_text=row[10],
                        auto_apply=bool(row[11]), display_order=row[12], display_on=row[13],
                        min_display_amount=row[14], wager_multiplier=row[15],
                        no_of_chunks=row[16], applicability_frequency=row[17],
                    ))
        return results
    except Exception as exc:
        log.error("player_bonus.list_applicable_codes.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


_VALIDATE_CODE_SQL = f"""
    SELECT
        bcc.id, bcc.code, bcc.display_title,
        bc.wager_multiplier, bc.no_of_chunks,
        bc.applicability_frequency,
        bc.id AS configure_id
    FROM bonus_configure_code bcc
    JOIN bonus_configure bc ON bc.id = bcc.configure_id AND bc.active = 1
    WHERE {code_validity_sql("bcc")}
      AND bcc.code = %s
      AND bc.wager_chip_type = %s
      AND (bc.start_date  IS NULL OR bc.start_date  <= NOW())
      AND (bc.end_date    IS NULL OR bc.end_date    >= NOW())
      AND (bcc.system_auto_apply IS NULL OR bcc.system_auto_apply = 0)
    LIMIT 1
"""

_CODE_CACHE_TTL = 600   # code config changes rarely
_CODE_MISS_TTL  = 60    # negative-result sentinel TTL


async def validate_code(
    user_id: str,
    chip_type: str,
    code: str,
    amount: Decimal | None = None,
    redis: Redis | None = None,
    site_id: int | None = None,
) -> ValidateCodeResponse:
    log.info("player_bonus.validate_code", user_id=user_id, chip_type=chip_type, code=code, amount=str(amount) if amount is not None else None)
    try:
        # ── 1. Code config — Redis cache-aside ────────────────────────────────
        cache_key = f"pam:bonus:code:{code}:{chip_type}"
        code_config: dict | None = None

        if redis:
            cached = await redis.get(cache_key)
            if cached is not None:
                parsed = json.loads(cached)
                if parsed is not None:
                    code_config = parsed

        if code_config is None:
            async with get_connection(POOL_BONUS) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(_VALIDATE_CODE_SQL, (code, chip_type))
                    row = await cur.fetchone()

            if not row:
                if redis:
                    await redis.set(cache_key, "null", ex=_CODE_MISS_TTL)
                return ValidateCodeResponse(valid=False, code=code, reason="Code not found or not applicable for this chip type")

            code_config = {
                "id": row[0], "code": row[1], "display_title": row[2],
                "wager_multiplier": str(row[3]), "no_of_chunks": row[4],
                "applicability_frequency": row[5], "configure_id": row[6],
            }
            if redis:
                await redis.set(cache_key, json.dumps(code_config), ex=_CODE_CACHE_TTL)

        # ── 2. User-specific checks (require redis + site_id) ─────────────────
        if redis and site_id:
            pam_user_id = await get_pam_user_id(redis, site_id, user_id)
            if pam_user_id is None:
                return ValidateCodeResponse(valid=False, code=code, reason="User not found")

            configure_id: int = code_config["configure_id"]

            async with get_connection(POOL_BONUS) as conn:
                async with conn.cursor() as cur:
                    if not await check_applicability(cur, pam_user_id, configure_id, code_config["applicability_frequency"]):
                        return ValidateCodeResponse(valid=False, code=code, reason="Code already redeemed for this period")

            if not await check_eligibility(redis, configure_id, {}):
                return ValidateCodeResponse(valid=False, code=code, reason="You are not eligible for this offer")

        return ValidateCodeResponse(
            valid=True, code=code_config["code"],
            promo_id=code_config["id"],
            display_title=code_config["display_title"],
            wager_multiplier=Decimal(code_config["wager_multiplier"]),
            no_of_chunks=code_config["no_of_chunks"],
        )
    except Exception as exc:
        log.error("player_bonus.validate_code.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


# ── 2. Consume bonus ──────────────────────────────────────────────────────────

_NEXT_RELEASE_CHUNK_SQL = """
    SELECT bc.id, bc.bonus_grant_id, bc.consume_status, bc.release_status,
           bc.release_amount, bc.consume_amount
    FROM bonus_chunk bc
    JOIN bonus_grant pbg ON pbg.id = bc.bonus_grant_id
    WHERE pbg.pam_user_id = %s
      AND pbg.site_id = %s
      AND bc.release_status IN ('RELEASED', 'PENDING','RELEASE')
      AND bc.consume_status IN ('INIT', 'PENDING')
      AND bc.release_amount > 0
      AND bc.release_amount > bc.consume_amount
    ORDER BY bc.id ASC
"""

_CONSUME_EXISTS_SQL = """
    SELECT id FROM bonus_chunk_consumed
    WHERE consumed_ref = %s
    LIMIT 1
"""

_INSERT_CONSUME_SQL = """
    INSERT INTO bonus_consumed
        (wager_ref, amount, wager_amount, consumed_amount,
         chip_type, session_key, client_id, product, game_type, game_variant,
         game_name, game_action, primary_transaction_id, secondary_transaction_id,
         tertiary_transaction_id, base_request_id)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_INSERT_CHUNK_CONSUMED_SQL = """
    INSERT INTO bonus_chunk_consumed
        (bonus_consumed_id, chunk_id, bonus_grant_id, consumed_ref, consumed_amount)
    VALUES (%s, %s, %s, %s, %s)
"""

_UPDATE_GRANT_CONSUMED_SQL = """
    UPDATE bonus_grant
    SET consume_amount = consume_amount + %s
    WHERE id = %s
"""

_UPDATE_CHUNK_CONSUME_AMOUNT_SQL = """
    UPDATE bonus_chunk
    SET consume_amount = consume_amount + %s, updated_at = NOW()
    WHERE id = %s
"""


_UPDATE_CHUNK_CONSUME_STATUS_SQL = """
    UPDATE bonus_chunk
    SET consume_status = 'CONSUMED', updated_at = NOW()
    WHERE id = %s
"""

_FETCH_GRANT_HIERARCHY_SQL = """
    SELECT id, configure_id, subhead_id, head_id
    FROM bonus_grant
    WHERE id IN ({placeholders})
"""

_UPSERT_SPEND_SQL = """
    INSERT INTO bonus_spend
        (entity_type, entity_id, site_id, period_type,
         period_start, period_end, consume_count, total_amount)
    VALUES (%s, %s, %s, %s, %s, %s, 1, %s)
    ON DUPLICATE KEY UPDATE
        consume_count = consume_count + 1,
        total_amount  = total_amount  + VALUES(total_amount)
"""


def _period_bounds(local_date: date, period: str) -> tuple[date, date]:
    if period == "DAILY":
        return local_date, local_date
    if period == "WEEKLY":
        start = local_date - timedelta(days=local_date.weekday())
        return start, start + timedelta(days=6)
    start = local_date.replace(day=1)
    end = local_date.replace(day=calendar.monthrange(local_date.year, local_date.month)[1])
    return start, end



async def consume_bonus(
    data: PlayerBonusConsumeCreate,
    redis: Redis,
    site_id: int,
) -> PlayerBonusConsumedResponse:
    pam_user_id = await get_or_create_pam_user(redis, site_id, data.user_id)
    log.info(
        "player_bonus.consume",
        player_user_id=data.user_id,
        pam_user_id=pam_user_id,
        consume_txn_id=data.consume_txn_id,
    )
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_CONSUME_EXISTS_SQL, (data.consume_txn_id,))
                if await cur.fetchone():
                    raise PlayerBonusConsumedError(0, data.consume_txn_id)

                await cur.execute(_NEXT_RELEASE_CHUNK_SQL, (pam_user_id, site_id))
                chunk_rows = await cur.fetchall()
                if not chunk_rows:
                    raise PlayerBonusNotFoundError(data.user_id)

                remaining_to_consume = float(data.bonus_amount)
                total_consumed = 0.0
                grant_consumed: dict[int, float] = {}

                for chunk_row in chunk_rows:
                    if remaining_to_consume <= 0:
                        break

                    chunk_id, bonus_grant_id, _, _, release_amount, consume_amount = chunk_row
                    available = max(0.0, float(release_amount) - float(consume_amount))
                    if available <= 0:
                        continue

                    portion = min(remaining_to_consume, available)
                    remaining_to_consume -= portion
                    total_consumed += portion
                    grant_consumed[bonus_grant_id] = grant_consumed.get(bonus_grant_id, 0.0) + portion

                    await cur.execute(_UPDATE_GRANT_CONSUMED_SQL, (portion, bonus_grant_id))
                    await cur.execute(_UPDATE_CHUNK_CONSUME_AMOUNT_SQL, (portion, chunk_id))
                    if portion >= available:
                        await cur.execute(_UPDATE_CHUNK_CONSUME_STATUS_SQL, (chunk_id,))

                if total_consumed == 0:
                    raise PlayerBonusNotFoundError(data.user_id)

                await cur.execute(
                    _INSERT_CONSUME_SQL,
                    (
                        data.wager_tnx_id,
                        data.bonus_amount, data.transaction_amount, total_consumed,
                        data.chip_type, data.session_key, data.platform_client_id,
                        data.product, data.game_type, data.game_variant,
                        data.game_name, data.game_action,
                        data.primary_transaction_id, data.secondary_transaction_id,
                        data.tertiary_transaction_id, data.base_request_id,
                    ),
                )
                bonus_consumed_id = cur.lastrowid

                remaining_to_consume = float(data.bonus_amount)
                for chunk_row in chunk_rows:
                    if remaining_to_consume <= 0:
                        break

                    chunk_id, bonus_grant_id, _, _, release_amount, consume_amount = chunk_row
                    available = max(0.0, float(release_amount) - float(consume_amount))
                    if available <= 0:
                        continue

                    portion = min(remaining_to_consume, available)
                    remaining_to_consume -= portion

                    await cur.execute(
                        _INSERT_CHUNK_CONSUMED_SQL,
                        (bonus_consumed_id, chunk_id, bonus_grant_id, data.consume_txn_id, portion),
                    )

                last_id = bonus_consumed_id

                if grant_consumed:
                    site_cfg = await get_site_config(site_id, redis)
                    tz_name = (
                        site_cfg.configuration.get("timezone", "Asia/Kolkata")
                        if site_cfg else "Asia/Kolkata"
                    )
                    local_date = datetime.now(tz=ZoneInfo(tz_name)).date()
                    placeholders = ",".join(["%s"] * len(grant_consumed))
                    await cur.execute(
                        _FETCH_GRANT_HIERARCHY_SQL.format(placeholders=placeholders),
                        list(grant_consumed.keys()),
                    )
                    hierarchy_rows = await cur.fetchall()
                    for g_id, configure_id, subhead_id, head_id in hierarchy_rows:
                        amount = Decimal(str(round(grant_consumed[g_id], 4)))
                        for entity_type, entity_id in [
                            ("CONFIGURE", configure_id),
                            ("SUBHEAD",   subhead_id),
                            ("HEAD",      head_id),
                        ]:
                            for period in ["DAILY", "WEEKLY", "MONTHLY"]:
                                p_start, p_end = _period_bounds(local_date, period)
                                await cur.execute(
                                    _UPSERT_SPEND_SQL,
                                    (entity_type, entity_id, site_id, period, p_start, p_end, amount),
                                )

                await conn.commit()

        return PlayerBonusConsumedResponse(
            txn_id=last_id,
            consume_txn_id=data.consume_txn_id,
            bonus_amount=data.bonus_amount,
            consumed_amount=Decimal(str(round(total_consumed, 2))),
            chip_type=data.chip_type,
        )
    except (PlayerBonusNotFoundError, PlayerBonusConsumedError):
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise PlayerBonusConsumedError(0, data.consume_txn_id) from exc
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("player_bonus.consume.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


# ── 3. Revert consumption ─────────────────────────────────────────────────────

_SELECT_CONSUMED_FOR_REVERT_SQL = """
    SELECT bcon.id, bcon.chip_type, bcon.amount,
           bcc.bonus_grant_id, bcc.consumed_amount
    FROM bonus_consumed bcon
    JOIN bonus_chunk_consumed bcc ON bcc.bonus_consumed_id = bcon.id
    WHERE bcc.consumed_ref = %s
"""

_DELETE_CHUNK_CONSUMED_SQL = """
    DELETE FROM bonus_chunk_consumed WHERE consumed_ref = %s
"""

_DELETE_CONSUME_SQL = """
    DELETE FROM bonus_consumed WHERE id = %s
"""

_UPDATE_GRANT_CONSUMED_DEC_SQL = """
    UPDATE bonus_grant
    SET consume_amount = GREATEST(0, consume_amount - %s)
    WHERE id = %s
"""


async def revert_consumption(consume_txn_id: str) -> PlayerBonusRevertResponse:
    log.info("player_bonus.revert", consume_txn_id=consume_txn_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_CONSUMED_FOR_REVERT_SQL, (consume_txn_id,))
                rows = await cur.fetchall()
                if not rows:
                    raise PlayerBonusNotFoundError(consume_txn_id)

                bonus_consumed_id, chip_type, amount = rows[0][0], rows[0][1], rows[0][2]

                for row in rows:
                    _, _, _, bonus_grant_id, chunk_consumed_amount = row
                    await cur.execute(_UPDATE_GRANT_CONSUMED_DEC_SQL, (chunk_consumed_amount, bonus_grant_id))

                await cur.execute(_DELETE_CHUNK_CONSUMED_SQL, (consume_txn_id,))
                await cur.execute(_DELETE_CONSUME_SQL, (bonus_consumed_id,))
                await conn.commit()

        return PlayerBonusRevertResponse(
            txn_id=bonus_consumed_id, consume_txn_id=consume_txn_id, amount=amount, chip_type=chip_type,
        )
    except (PlayerBonusNotFoundError, PlayerBonusAlreadyRevertedError):
        raise
    except Exception as exc:
        log.error("player_bonus.revert.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


# ── 4. Player bonus summary ───────────────────────────────────────────────────

_BONUS_BALANCE_BY_CHIP_SQL = """
    SELECT wager_chip_type, COALESCE(SUM(release_amount - consume_amount), 0)
    FROM bonus_grant
    WHERE pam_user_id = %s
    GROUP BY wager_chip_type
"""

_PENDING_BONUS_BY_CHIP_SQL = """
    SELECT pbg.wager_chip_type, COALESCE(SUM(bc.chunk_amount - bc.release_amount), 0)
    FROM bonus_chunk bc
    JOIN bonus_grant pbg ON pbg.id = bc.bonus_grant_id
    WHERE pbg.pam_user_id = %s AND bc.release_status = 'PENDING'
    GROUP BY pbg.wager_chip_type
"""

_WAGERING_REQUIRED_BY_CHIP_SQL = """
    SELECT pbg.wager_chip_type,
           COALESCE(SUM(bc.required_wager_amount - bc.wager_amount), 0),
           COALESCE(SUM(bc.wager_amount), 0)
    FROM bonus_chunk bc
    JOIN bonus_grant pbg ON pbg.id = bc.bonus_grant_id
    WHERE pbg.pam_user_id = %s AND bc.release_status = 'PENDING'
    GROUP BY pbg.wager_chip_type
"""


async def get_player_bonus_summary(pam_user_id: int) -> list[PlayerBonusSummaryResponse]:
    log.info("player_bonus.summary", pam_user_id=pam_user_id)
    from collections import defaultdict
    from decimal import Decimal as D
    data: dict[str, dict] = defaultdict(
        lambda: {"bonus_balance": D(0), "pending_bonus": D(0), "wagering_required": D(0), "wagering_done": D(0)}
    )
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_BONUS_BALANCE_BY_CHIP_SQL, (pam_user_id,))
                for chip, val in await cur.fetchall():
                    data[chip]["bonus_balance"] = val

                await cur.execute(_PENDING_BONUS_BY_CHIP_SQL, (pam_user_id,))
                for chip, val in await cur.fetchall():
                    data[chip]["pending_bonus"] = val

                await cur.execute(_WAGERING_REQUIRED_BY_CHIP_SQL, (pam_user_id,))
                for chip, remaining, done in await cur.fetchall():
                    data[chip]["wagering_required"] = remaining
                    data[chip]["wagering_done"] = done

        return [
            PlayerBonusSummaryResponse(chip_type=chip, **vals)
            for chip, vals in data.items()
        ]
    except Exception as exc:
        log.error("player_bonus.summary.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


# ── 5. Transaction list ───────────────────────────────────────────────────────

_TRANSACTIONS_SQL = """
    SELECT txn_id, bonus_code, amount, type, created_at,
           release_amount, consumed_amount, expiry_amount, forfeit_amount,
           grant_txn_id, player_bonus_id
    FROM (
        SELECT pbg.id                AS txn_id,
               pbg.bonus_code        AS bonus_code,
               pbg.grant_amount      AS amount,
               'grant'               AS type,
               pbg.created_at,
               pbg.release_amount    AS release_amount,
               pbg.consume_amount    AS consumed_amount,
               COALESCE((SELECT SUM(bce2.amount) FROM bonus_chunk_expiry bce2 WHERE bce2.bonus_grant_id = pbg.id), 0) AS expiry_amount,
               COALESCE((SELECT SUM(bf2.amount)  FROM bonus_forfeit bf2        WHERE bf2.bonus_grant_id  = pbg.id), 0) AS forfeit_amount,
               NULL                  AS grant_txn_id,
               pbg.player_bonus_id   AS player_bonus_id
        FROM bonus_grant pbg
        WHERE pbg.pam_user_id = %s AND pbg.wager_chip_type = %s

        UNION ALL

        SELECT COALESCE(MIN(bcr.bonus_release_id), MIN(bcr.id)) AS txn_id,
               NULL                     AS bonus_code,
               SUM(bcr.release_amount)  AS amount,
               'released'               AS type,
               MIN(bcr.created_at)      AS created_at,
               NULL, NULL, NULL, NULL,
               pbg.id                   AS grant_txn_id,
               NULL                     AS player_bonus_id
        FROM bonus_chunk_release bcr
        JOIN bonus_chunk bc  ON bc.id  = bcr.chunk_id
        JOIN bonus_grant pbg ON pbg.id = bc.bonus_grant_id
        WHERE pbg.pam_user_id = %s AND pbg.wager_chip_type = %s
        GROUP BY bcr.wager_ref, pbg.id

        UNION ALL

        SELECT bcon.id                  AS txn_id,
               NULL                     AS bonus_code,
               bcon.consumed_amount     AS amount,
               'consumed'               AS type,
               bcon.created_at,
               NULL, NULL, NULL, NULL,
               MIN(bcc.bonus_grant_id)  AS grant_txn_id,
               NULL                     AS player_bonus_id
        FROM bonus_consumed bcon
        JOIN bonus_chunk_consumed bcc ON bcc.bonus_consumed_id = bcon.id
        JOIN bonus_grant pbg ON pbg.id = bcc.bonus_grant_id
        WHERE pbg.pam_user_id = %s AND pbg.wager_chip_type = %s
        GROUP BY bcon.id, bcon.consumed_amount, bcon.created_at
    ) AS ledger
    ORDER BY created_at DESC
    LIMIT %s OFFSET %s
"""


def _derive_status(
    pending: int, released: int, consumed: int, expired: int,
    forfeited: int, total: int,
) -> str:
    if forfeited:
        return "FORFEITED"
    if expired == total:
        return "EXPIRED"
    if consumed == total:
        return "CONSUMED"
    if released == total:
        return "RELEASE"
    if released > 0:
        return "PARTIALLY_RELEASED"
    return "PENDING"


async def list_player_transactions(
    pam_user_id: int,
    chip_type: str,
    limit: int = 50,
    offset: int = 0,
) -> list[PlayerBonusTransactionSummary]:
    log.info("player_bonus.list_transactions", pam_user_id=pam_user_id, chip_type=chip_type)
    p = pam_user_id
    c = chip_type
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_TRANSACTIONS_SQL, (p, c, p, c, p, c, limit, offset))
                rows = await cur.fetchall()

        return [
            PlayerBonusTransactionSummary(
                txn_id=row[0], bonus_code=row[1], amount=row[2],
                type=row[3], created_at=row[4],
                release_amount=row[5], consumed_amount=row[6],
                expiry_amount=row[7], forfeit_amount=row[8],
                grant_txn_id=row[9], player_bonus_id=row[10],
            )
            for row in rows
        ]
    except Exception as exc:
        log.error("player_bonus.list_transactions.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


# ── 6. Transaction detail ─────────────────────────────────────────────────────

_GRANT_DETAIL_SQL = """
    SELECT id, pam_user_id, bonus_code, wager_multiplier, no_of_chunks,
           chunk_expiry_days, bonus_expiry_days, wager_chip_type, credit_chip_type,
           grant_amount, release_amount, consume_amount, created_at
    FROM bonus_grant
    WHERE id = %s
"""

_CHUNKS_SQL = """
    SELECT id, chunk_ref, chunk_amount, wager_multiplier, release_status,
           required_wager_amount, wager_amount, created_at, updated_at, consume_status
    FROM bonus_chunk
    WHERE bonus_grant_id = %s
    ORDER BY chunk_ref ASC
"""

_FORFEIT_SQL = """
    SELECT id, requested_amount, amount, type, operator, forfeited_at
    FROM bonus_forfeit
    WHERE bonus_grant_id = %s
    LIMIT 1
"""

_EXPIRY_EVENTS_SQL = """
    SELECT id, chunk_id, amount, type, operator, expired_at
    FROM bonus_chunk_expiry
    WHERE bonus_grant_id = %s
    ORDER BY expired_at ASC
"""

_RELEASE_EVENTS_SQL = """
    SELECT bcr.id, bcr.chunk_id, bcr.wager_ref, bcr.wager_amount, bcr.release_amount, bcr.created_at
    FROM bonus_chunk_release bcr
    JOIN bonus_chunk bc ON bc.id = bcr.chunk_id
    WHERE bc.bonus_grant_id = %s
    ORDER BY bcr.created_at ASC
"""

_CONSUME_EVENTS_SQL = """
    SELECT bcc.id, bcc.chunk_id, bcc.consumed_ref, bcon.wager_ref,
           bcc.consumed_amount, bcon.created_at
    FROM bonus_chunk_consumed bcc
    JOIN bonus_consumed bcon ON bcon.id = bcc.bonus_consumed_id
    WHERE bcc.bonus_grant_id = %s
    ORDER BY bcon.created_at ASC
"""


_RELEASE_DETAIL_SQL = """
    SELECT br.id, br.wager_ref, br.chip_type, br.product, br.game_type, br.game_name,
           br.wager_amount, br.release_amount, br.created_at
    FROM bonus_release br
    WHERE br.id = %s AND br.pam_user_id = %s
"""

_RELEASE_CHUNKS_SQL = """
    SELECT bcr.id, bc.chunk_ref, bcr.wager_amount, bcr.release_amount, bc.bonus_grant_id
    FROM bonus_chunk_release bcr
    JOIN bonus_chunk bc ON bc.id = bcr.chunk_id
    WHERE bcr.bonus_release_id = %s
    ORDER BY bc.chunk_ref ASC
"""

_CONSUME_DETAIL_SQL = """
    SELECT bcon.id, bcon.wager_ref, bcon.chip_type, bcon.product, bcon.game_type,
           bcon.game_name, bcon.amount, bcon.consumed_amount, bcon.wager_amount, bcon.created_at
    FROM bonus_consumed bcon
    JOIN bonus_chunk_consumed bcc ON bcc.bonus_consumed_id = bcon.id
    JOIN bonus_grant bg ON bg.id = bcc.bonus_grant_id
    WHERE bcon.id = %s AND bg.pam_user_id = %s
    LIMIT 1
"""

_CONSUME_CHUNKS_SQL = """
    SELECT bcc.id, bc.chunk_ref, bcc.consumed_amount, bcc.bonus_grant_id
    FROM bonus_chunk_consumed bcc
    JOIN bonus_chunk bc ON bc.id = bcc.chunk_id
    WHERE bcc.bonus_consumed_id = %s
    ORDER BY bc.chunk_ref ASC
"""

_EXPIRY_DETAIL_SQL = """
    SELECT bce.id, bce.chunk_id, bc.chunk_ref, bce.amount, bce.type, bce.operator, bce.expired_at
    FROM bonus_chunk_expiry bce
    JOIN bonus_chunk bc ON bc.id = bce.chunk_id
    JOIN bonus_grant bg ON bg.id = bc.bonus_grant_id
    WHERE bce.id = %s AND bg.pam_user_id = %s
"""

_FORFEIT_DETAIL_SQL = """
    SELECT bf.id, bf.bonus_grant_id, bf.requested_amount, bf.amount,
           bf.type, bf.operator, bf.forfeited_at
    FROM bonus_forfeit bf
    JOIN bonus_grant bg ON bg.id = bf.bonus_grant_id
    WHERE bf.id = %s AND bg.pam_user_id = %s
"""


async def get_player_transaction_detail(
    pam_user_id: int, user_id: str, txn_id: int
) -> PlayerBonusTransactionDetail:
    log.info("player_bonus.transaction_detail", pam_user_id=pam_user_id, txn_id=txn_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_GRANT_DETAIL_SQL, (txn_id,))
                grant = await cur.fetchone()
                if not grant or str(grant[1]) != str(pam_user_id):
                    raise PlayerBonusNotFoundError(txn_id)

                await cur.execute(_CHUNKS_SQL, (txn_id,))
                chunk_rows = await cur.fetchall()

                await cur.execute(_FORFEIT_SQL, (txn_id,))
                forfeit_row = await cur.fetchone()

                await cur.execute(_EXPIRY_EVENTS_SQL, (txn_id,))
                expiry_rows = await cur.fetchall()

                await cur.execute(_RELEASE_EVENTS_SQL, (txn_id,))
                release_rows = await cur.fetchall()

                await cur.execute(_CONSUME_EVENTS_SQL, (txn_id,))
                consume_rows = await cur.fetchall()

        (
            _id, _pam_user_id, bonus_code, wager_multiplier, no_of_chunks,
            chunk_expiry_days, bonus_expiry_days, wager_chip_type, credit_chip_type,
            grant_amount, release_amount, consume_amount_val, created_at,
        ) = grant

        pending = sum(1 for c in chunk_rows if c[4] == "PENDING")
        released = sum(1 for c in chunk_rows if c[4] == "RELEASE")
        consumed_count = sum(1 for c in chunk_rows if c[4] == "CONSUMED")
        expired = sum(1 for c in chunk_rows if c[4] == "EXPIRED")
        status = _derive_status(pending, released, consumed_count, expired, 1 if forfeit_row else 0, no_of_chunks)

        releases_by_chunk: dict[int, list[ChunkReleaseEvent]] = {}
        for r in release_rows:
            ev = ChunkReleaseEvent(
                id=r[0], chunk_id=r[1], wager_ref=r[2],
                wager_amount=r[3], release_amount=r[4], created_at=r[5],
            )
            releases_by_chunk.setdefault(r[1], []).append(ev)

        consumes_by_chunk: dict[int, list[ChunkConsumeEvent]] = {}
        for c in consume_rows:
            ev = ChunkConsumeEvent(
                id=c[0], chunk_id=c[1], consumed_ref=c[2],
                wager_ref=c[3], consumed_amount=c[4], created_at=c[5],
            )
            consumes_by_chunk.setdefault(c[1], []).append(ev)

        chunks = [
            BonusChunkDetail(
                id=c[0], chunk_ref=c[1], chunk_amount=c[2], wager_multiplier=c[3],
                release_status=c[4], required_wager_amount=c[5], wager_amount=c[6],
                created_at=c[7], updated_at=c[8], consume_status=c[9],
                releases=releases_by_chunk.get(c[0], []),
                consumes=consumes_by_chunk.get(c[0], []),
            )
            for c in chunk_rows
        ]

        forfeit = None
        if forfeit_row:
            forfeit = BonusForfeitDetail(
                id=forfeit_row[0], requested_amount=forfeit_row[1], amount=forfeit_row[2],
                type=forfeit_row[3], operator=forfeit_row[4], forfeited_at=forfeit_row[5],
            )

        expiry_events = [
            BonusExpiryDetail(
                id=e[0], chunk_id=e[1], amount=e[2], type=e[3],
                operator=e[4], expired_at=e[5],
            )
            for e in expiry_rows
        ]

        return PlayerBonusTransactionDetail(
            txn_id=_id, user_id=user_id, bonus_code=bonus_code,
            wager_multiplier=wager_multiplier, no_of_chunks=no_of_chunks,
            chunk_expiry_days=chunk_expiry_days, bonus_expiry_days=bonus_expiry_days,
            wager_chip_type=wager_chip_type, credit_chip_type=credit_chip_type,
            grant_amount=grant_amount, release_amount=release_amount,
            bonus_consumed=consume_amount_val, status=status, created_at=created_at,
            chunks=chunks, forfeit=forfeit, expiry_events=expiry_events,
        )
    except PlayerBonusNotFoundError:
        raise
    except Exception as exc:
        log.error("player_bonus.transaction_detail.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


# ── 7. Per-type transaction detail ───────────────────────────────────────────

async def _get_grant_detail(pam_user_id: int, user_id: str, txn_id: int) -> GrantTxnDetail:
    detail = await get_player_transaction_detail(pam_user_id, user_id, txn_id)
    return GrantTxnDetail(type="GRANT", **detail.model_dump())


async def _get_release_detail(pam_user_id: int, txn_id: int) -> ReleaseTxnDetail:
    log.info("player_bonus.release_detail", pam_user_id=pam_user_id, txn_id=txn_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_RELEASE_DETAIL_SQL, (txn_id, pam_user_id))
                row = await cur.fetchone()
                if not row:
                    raise PlayerBonusNotFoundError(txn_id)
                await cur.execute(_RELEASE_CHUNKS_SQL, (txn_id,))
                chunk_rows = await cur.fetchall()
        return ReleaseTxnDetail(
            id=row[0], wager_ref=row[1], chip_type=row[2], product=row[3],
            game_type=row[4], game_name=row[5], wager_amount=row[6],
            release_amount=row[7], created_at=row[8],
            chunks=[
                ChunkReleaseRow(id=c[0], chunk_ref=c[1], wager_amount=c[2], release_amount=c[3], bonus_grant_id=c[4])
                for c in chunk_rows
            ],
        )
    except PlayerBonusNotFoundError:
        raise
    except Exception as exc:
        log.error("player_bonus.release_detail.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


async def _get_consume_detail(pam_user_id: int, txn_id: int) -> ConsumeTxnDetail:
    log.info("player_bonus.consume_detail", pam_user_id=pam_user_id, txn_id=txn_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_CONSUME_DETAIL_SQL, (txn_id, pam_user_id))
                row = await cur.fetchone()
                if not row:
                    raise PlayerBonusNotFoundError(txn_id)
                await cur.execute(_CONSUME_CHUNKS_SQL, (txn_id,))
                chunk_rows = await cur.fetchall()
        return ConsumeTxnDetail(
            id=row[0], wager_ref=row[1], chip_type=row[2], product=row[3],
            game_type=row[4], game_name=row[5], amount=row[6],
            consumed_amount=row[7], wager_amount=row[8], created_at=row[9],
            chunks=[
                ChunkConsumedRow(id=c[0], chunk_ref=c[1], consumed_amount=c[2], bonus_grant_id=c[3])
                for c in chunk_rows
            ],
        )
    except PlayerBonusNotFoundError:
        raise
    except Exception as exc:
        log.error("player_bonus.consume_detail.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


async def _get_expiry_detail(pam_user_id: int, txn_id: int) -> ExpiryTxnDetail:
    log.info("player_bonus.expiry_detail", pam_user_id=pam_user_id, txn_id=txn_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_EXPIRY_DETAIL_SQL, (txn_id, pam_user_id))
                row = await cur.fetchone()
                if not row:
                    raise PlayerBonusNotFoundError(txn_id)
        return ExpiryTxnDetail(
            id=row[0], chunk_id=row[1], chunk_ref=row[2], amount=row[3],
            expiry_type=row[4], operator=row[5], expired_at=row[6],
        )
    except PlayerBonusNotFoundError:
        raise
    except Exception as exc:
        log.error("player_bonus.expiry_detail.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


async def _get_forfeit_detail(pam_user_id: int, txn_id: int) -> ForfeitTxnDetail:
    log.info("player_bonus.forfeit_detail", pam_user_id=pam_user_id, txn_id=txn_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_FORFEIT_DETAIL_SQL, (txn_id, pam_user_id))
                row = await cur.fetchone()
                if not row:
                    raise PlayerBonusNotFoundError(txn_id)
        return ForfeitTxnDetail(
            id=row[0], bonus_grant_id=row[1], requested_amount=row[2], amount=row[3],
            forfeit_type=row[4], operator=row[5], forfeited_at=row[6],
        )
    except PlayerBonusNotFoundError:
        raise
    except Exception as exc:
        log.error("player_bonus.forfeit_detail.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc


async def get_txn_detail_by_type(
    pam_user_id: int,
    user_id: str,
    txn_id: int,
    txn_type: str,
) -> GrantTxnDetail | ReleaseTxnDetail | ConsumeTxnDetail | ExpiryTxnDetail | ForfeitTxnDetail:
    if txn_type == "GRANT":
        return await _get_grant_detail(pam_user_id, user_id, txn_id)
    simple_handlers = {
        "RELEASE": _get_release_detail,
        "CONSUME": _get_consume_detail,
        "EXPIRY":  _get_expiry_detail,
        "FORFEIT": _get_forfeit_detail,
    }
    return await simple_handlers[txn_type](pam_user_id, txn_id)


# ── 8. Referral code ──────────────────────────────────────────────────────────

_REFERRAL_CODE_SQL = """
    SELECT user_id, referral_code, created_at
    FROM player_referral
    WHERE user_id = %s
    LIMIT 1
"""


async def get_player_referral_code(user_id: str) -> PlayerReferralCodeResponse:
    log.info("player_bonus.referral_code", user_id=user_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_REFERRAL_CODE_SQL, (user_id,))
                row = await cur.fetchone()
        if not row:
            raise PlayerBonusNotFoundError(user_id)
        return PlayerReferralCodeResponse(
            user_id=row[0], referral_code=row[1], created_at=row[2],
        )
    except PlayerBonusNotFoundError:
        raise
    except Exception as exc:
        log.error("player_bonus.referral_code.error", error=str(exc))
        raise DatabaseError(str(exc)) from exc
