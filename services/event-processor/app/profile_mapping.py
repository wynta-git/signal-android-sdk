# In-memory mapping: event_name → {property_key_in_event: mongodb_user_profile_field}
# To add a new mapping, add an entry here. No DB changes needed.
PROFILE_EVENT_MAPPING: dict[str, dict[str, str]] = {
    "email_verified": {
        "email_id": "email",
    },
}
