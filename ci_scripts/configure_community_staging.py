"""Use the isolated backend in the dedicated Community TestFlight checkout."""

import os
import re
from pathlib import Path


def configure(source: str, url: str, key: str) -> str:
    project_url = re.fullmatch(r"https://[a-z0-9]{20}\.supabase\.co", url)
    if not project_url:
        raise ValueError("Set BENZA_COMMUNITY_STAGING_URL to a Supabase project URL.")
    if url in source:
        raise ValueError("The Community TestFlight build requires a separate Supabase project.")
    if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", key):
        raise ValueError("Set BENZA_COMMUNITY_STAGING_PUBLISHABLE_KEY to the staging publishable key.")
    if key in source:
        raise ValueError("The Community TestFlight build requires a separate publishable key.")

    replacements = {
        "SUPABASE_URL": url,
        "SUPABASE_PUBLISHABLE_KEY": key,
    }
    for constant, value in replacements.items():
        source, count = re.subn(fr"const {constant}='[^']+';", f"const {constant}='{value}';", source)
        if count != 1:
            raise ValueError(f"Expected exactly one {constant} in the app shell.")
    source, count = re.subn(r"const BENZA_COMMUNITY_PREVIEW=false;", "const BENZA_COMMUNITY_PREVIEW=true;", source)
    if count != 1:
        raise ValueError("Expected the Community preview flag in the app shell.")
    source, count = re.subn(
        r"<h1>Explore</h1>",
        "<h1>Explore <small class='communityBadge'>Preview</small></h1>",
        source,
    )
    if count != 1:
        raise ValueError("Expected the Explore screen title in the app shell.")

    preview_changes = {
        "Your metals. Your stack. All in one place.": (
            "Community Preview uses a separate account. Create a test account "
            "with email to get started."
        ),
        "const plugin=isBenzaNativeRuntime()?window.Capacitor?.Plugins?.BenzaSocialAuth:null;":
            "const plugin=null; // Social providers are not configured on staging.",
        "return window.Capacitor?.isNativePlatform?.()?window.Capacitor?.Plugins?.BenzaSavedLogin:null;":
            "return null; // Do not read or modify the live app's saved password.",
        "'Need an account? Create one'": "'New to this preview? Create a test account'",
        "'benzaRememberedEmail'": "'benzaPreviewRememberedEmail'",
        "'benzaRecentEmails'": "'benzaPreviewRecentEmails'",
    }
    for original, replacement in preview_changes.items():
        if original not in source:
            raise ValueError("Expected a matching Community sign-in control in the app shell.")
        source = source.replace(original, replacement)

    return source


if __name__ == "__main__":
    app_shell = Path("App/public/index.html")
    try:
        configured = configure(
            app_shell.read_text(encoding="utf-8"),
            os.environ.get("BENZA_COMMUNITY_STAGING_URL", "https://ntyxwzjbirqlhopjhnni.supabase.co"),
            os.environ.get("BENZA_COMMUNITY_STAGING_PUBLISHABLE_KEY", "sb_publishable_zdIj5zF1OTng_Brl22MP1g_LRTkVAwy"),
        )
    except ValueError as error:
        raise SystemExit(str(error))
    app_shell.write_text(configured, encoding="utf-8")
    print("Configured isolated Community TestFlight backend.")
