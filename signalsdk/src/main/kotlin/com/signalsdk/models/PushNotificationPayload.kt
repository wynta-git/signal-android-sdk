package com.signalsdk.models

// Parsed from the FCM data payload (always Map<String, String>) for campaign pushes that use
// one of the SDK-rendered templates. `template` selects which fields PushNotificationBuilder
// reads — see docs/push-templates.md for the full contract.
internal data class PushNotificationPayload(
    val template: String,
    val title: String,
    val body: String,
    val accentColorHex: String?,
    val imageUrl: String?,
    // The composer's "Add a rich image" — full-width image above the title/body on the
    // "standard" and "branded" templates only (hero_banner has its own imageUrl).
    val richImageUrl: String?,
    // Overrides the title/body text color on all three templates — unlike accentColorHex/
    // imageUrl/richImageUrl, not scoped to a single template.
    val textColor: String?,
    val notificationTapType: String?,
    val notificationTapAction1: String?,
    val notificationTapAction2: String?,
    // Carried through unchanged so the tap intent can still populate handleNotificationClick's
    // existing campaign fields when they're present alongside the new template fields.
    val campaignId: String?,
    val campaignName: String?,
    val notificationType: String?,
    val channel: String?,
    val templateId: String?,
    val actionId: String?,
    val deepLink: String?
) {
    companion object {
        private fun String?.blankToNull(): String? = this?.takeIf { it.isNotBlank() }

        fun fromData(data: Map<String, String>): PushNotificationPayload? {
            val title = data["title"].blankToNull() ?: return null
            // The composer sends the description text as "content", not "body" -- "body" is kept
            // as a fallback for any already-scheduled campaigns/older backend versions still
            // using the old key.
            val body = (data["content"] ?: data["body"]).blankToNull() ?: return null

            return PushNotificationPayload(
                // Lowercased once here so every downstream template == "branded" / "hero_banner"
                // check works regardless of how the backend/composer capitalizes it in the payload.
                template                = data["template"].blankToNull()?.lowercase() ?: "standard",
                title                   = title,
                body                    = body,
                // bg_color/banner_url are the current composer field names;
                // accentColorHex/imageUrl kept as fallbacks for the same reason.
                accentColorHex          = (data["bg_color"] ?: data["accentColorHex"]).blankToNull(),
                imageUrl                = (data["banner_url"] ?: data["imageUrl"]).blankToNull(),
                // image_url used to be the branded large icon beside the text; branded no longer
                // has one — the composer now sends the rich image as image_url.
                richImageUrl            = data["image_url"].blankToNull(),
                textColor               = data["text_color"].blankToNull(),
                notificationTapType     = data["notification_tap_type"].blankToNull()?.lowercase(),
                notificationTapAction1  = data["notification_tap_action_1"].blankToNull(),
                notificationTapAction2  = data["notification_tap_action_2"].blankToNull(),
                campaignId              = data["campaign_id"].blankToNull(),
                campaignName            = data["campaign_name"].blankToNull(),
                notificationType        = data["notification_type"].blankToNull(),
                channel                 = data["channel"].blankToNull(),
                templateId              = data["template_id"].blankToNull(),
                actionId                = data["action_id"].blankToNull(),
                deepLink                = data["deep_link"].blankToNull()
            )
        }
    }
}
