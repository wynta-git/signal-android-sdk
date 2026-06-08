import asyncio
import datetime
import logging
import html
import json
import aiohttp
from html.parser import HTMLParser
from sqlalchemy.future import select
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from queue_manager.common.commonsettings import REDIS_CONNECTION
from infrastructure.redis_service.redis_interface import get_redis_client_instance
from queue_manager.common.common_func import async_get_site_fcm_token, async_serialize_event_message
from queue_manager.common.models import PlayerAndSiteMap, Playerinfo1, Playerinfo, Site
from sqlalchemy import text
import re

PLACEHOLDER_PATTERN = re.compile(r"{{(.*?)}}")
logger = logging.getLogger('service')
redis_client = get_redis_client_instance(**REDIS_CONNECTION)

deeplink_format = "https://www.{0}/?type={1}&camp_id={2}&utm_source=promotion&utm_campaign={3}&utm_medium=push"
CURRENCY_REPLACE = ['Rupsym', 'RupSym']

# UTILS
class HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.data = []

    def handle_data(self, d):
        self.data.append(d)

    def get_data(self):
        return ''.join(self.data)

def clean_html(content):
    if not content:
        return content
    content = html.unescape(content)
    stripper = HTMLStripper()
    stripper.feed(content)
    content = stripper.get_data()
    for cur in CURRENCY_REPLACE:
        content = content.replace(cur, "₹")
    return content

def chunk(data, size):
    for i in range(0, len(data), size):
        yield data[i:i + size]

# FCM AUTH (OAuth2)
class FCMV1Auth:
    def __init__(self):
        self.cache = {}

    def get_access_token(self, credential_json):
        cred_dict = json.loads(credential_json)
        key = cred_dict.get("private_key_id")
        if key in self.cache:
            token, expiry = self.cache[key]
            if expiry and expiry > datetime.datetime.utcnow():
                return token

        credentials_obj = service_account.Credentials.from_service_account_info(
            cred_dict,
            scopes=["https://www.googleapis.com/auth/firebase.messaging"]
        )

        credentials_obj.refresh(Request())
        token = credentials_obj.token
        expiry = credentials_obj.expiry
        self.cache[key] = (token, expiry)

        return token

def replace_placeholders(content, player_data):
    """
    Replace placeholders dynamically from player data.
    Example:
        {{firstname}}
        {{lastname}}
        {{username}}
    """

    def repl(match):
        key = match.group(1).strip()
        value = player_data.get(key)

        if value is None:
            return ""

        return str(value)

    return PLACEHOLDER_PATTERN.sub(repl, content)

# MAIN HANDLER
class PushEventHandler:
    def __init__(self, message):
        self.message = message
        self.list_of_player_device_id = {}
        self.site_tokens = None
        self.session = None
        self.semaphore = asyncio.Semaphore(100)
        self.auth = FCMV1Auth()

    # SERIALIZE
    async def serialize_message(self):
        msg = await async_serialize_event_message(self.message)
        self.messageobject = msg.params
        self.event_name = msg.event_name

        self.messageobject.content = clean_html(self.messageobject.content)
        self.messageobject.title = clean_html(self.messageobject.title)

    # HTTP V1 POST
    async def _post_v1(self, url, player_id, payload, headers):
        async with self.semaphore:
            try:
                async with self.session.post(url, json=payload, headers=headers) as resp:
                    if resp.status == 200:
                        return {
                            "player_id": player_id,
                            "status": "success",
                            "error": None
                        }
                    else:
                        err = await resp.text()
                        return {
                            "player_id": player_id,
                            "status": "failed",
                            "error": err[:200]
                        }
            except Exception as e:
                return {
                    "player_id": player_id,
                    "status": "failed",
                    "error": str(e)[:200]
                }

    # HELPER
    def build_deeplink(self, domain, campaign_id):
        return deeplink_format.format(
            domain,
            self.messageobject.deep_link_target or '',
            campaign_id,
            self.messageobject.api_user
        )

    # SEND (HTTP V1 ONLY)
    async def send_fcm_v1(self, async_session_scope):
        campaign_id = getattr(self.messageobject, 'campaign_id', None)
        execution_id = getattr(self.messageobject, 'execution_id', None)
        is_last_message = getattr(self.messageobject, 'is_last_message', False)

        batch_size = 500
        tasks = []
        results = []  # moved outside loop

        async with aiohttp.ClientSession() as session:
            self.session = session

            for site_id, players in self.list_of_player_device_id.items():
                token_data = self.site_tokens.get(site_id)
                if not token_data or not token_data.get("json_private_key"):
                    continue

                credential = token_data["json_private_key"]
                cred_dict = json.loads(credential)
                project_id = cred_dict.get("project_id")

                access_token = self.auth.get_access_token(credential)
                headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                }

                url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

                for p in players:
                    if not p.get("device_id"):
                        continue

                    player_id = p.get('player_id')
                    deeplink = self.build_deeplink(p['sitedomain'], campaign_id)

                    title = replace_placeholders(self.messageobject.title, p)
                    content = replace_placeholders(self.messageobject.content, p)

                    payload = {
                        "message": {
                            "token": p["device_id"],
                            "data": {
                                "dl": deeplink,
                                "type": "PUSH",
                                "deeplink": self.messageobject.deep_link_target or '',
                                "title": title,
                                "content": content
                            }
                        }
                    }

                    tasks.append(self._post_v1(url, player_id, payload, headers))
                    # Batch execution
                    if len(tasks) >= batch_size:
                        batch_results = await asyncio.gather(*tasks, return_exceptions=False)
                        results.extend(batch_results)
                        tasks.clear()

            # Final remaining tasks
            if tasks:
                batch_results = await asyncio.gather(*tasks, return_exceptions=False)
                results.extend(batch_results)

        # Compute counts
        success_count = sum(1 for r in results if r["status"] == "success")
        failure_count = sum(1 for r in results if r["status"] == "failed")

        # Bulk DB Update
        try:
            async with async_session_scope() as session:
                if execution_id:
                    campaign_query = text("""
                        UPDATE platform_notification_execution
                        SET 
                            success_players = COALESCE(success_players, 0) + :success,
                            failed_players = COALESCE(failed_players, 0) + :failure,
                            status = CASE WHEN :is_last_message = 1 THEN 'completed' ELSE status END,
                            completed_at = CASE WHEN :is_last_message = 1 THEN :completed_at ELSE completed_at END
                        WHERE id = :execution_id
                    """)

                    await session.execute(campaign_query, {
                        "success": success_count,
                        "failure": failure_count,
                        "execution_id": execution_id,
                        "is_last_message": 1 if is_last_message else 0,
                        "completed_at": datetime.datetime.utcnow()
                    })

                await session.commit()
        except Exception as ex:
            logger.error(ex)


    # DB FETCH
    async def get_players(self, session, player_ids):
        stmt = select(
            Playerinfo.id,
            Playerinfo1.notification_device_id,
            Playerinfo.firstname,
            Playerinfo.lastname,
            Playerinfo.nickname,
            Playerinfo.username,
            Playerinfo.funchips,
            Playerinfo.dob,
            Site.domain,
            PlayerAndSiteMap.siteid
        ).join(Playerinfo, Playerinfo.id == Playerinfo1.playerid_id) \
         .join(PlayerAndSiteMap, PlayerAndSiteMap.playerid == Playerinfo.id) \
         .join(Site, Site.id == PlayerAndSiteMap.siteid) \
         .filter(Playerinfo.id.in_(player_ids))

        result = await session.execute(stmt)

        for row in result:
            if not row.notification_device_id:
                continue

            self.list_of_player_device_id.setdefault(row.siteid, []).append({
                "device_id": row.notification_device_id,
                "firstname": row.firstname,
                "lastname": row.lastname,
                "nickname": row.nickname,
                "username": row.username,
                "coins_balance": round(float(row.funchips or 0),2),
                "dob": row.dob,
                "sitedomain": row.domain,
                "siteid": row.siteid,
                "player_id": row.id,
            })

    # PROCESS
    async def process(self, async_session_scope):
        await self.serialize_message()
        logger.info(f"bulk push handler received message: {json.loads(self.message.decode('utf-8'))}",
                    extra={'correlation_id': self.messageobject.correlationid, 'handler': 'bulkpushhandle'})

        if self.event_name != "PLATFORM_BULK_PUSH_NOTIFICATION":
            raise Exception("Unsupported event")

        async with async_session_scope() as session:
            self.site_tokens = await async_get_site_fcm_token(session, redis_client, logger)
            await self.get_players(session, self.messageobject.target_value)

        if not self.list_of_player_device_id or not self.site_tokens:
            logger.info("No players or tokens")
            return

        await self.send_fcm_v1(async_session_scope)