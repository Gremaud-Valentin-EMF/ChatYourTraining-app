import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/integrations/whoop";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const origin = requestUrl.origin;

  if (error) {
    const errorDescription =
      requestUrl.searchParams.get("error_description") || "";
    const errorHint = requestUrl.searchParams.get("error_hint") || "";
    console.error("Whoop OAuth Error:", { error, errorDescription, errorHint });
    return NextResponse.redirect(
      `${origin}/integrations?error=${error}&error_description=${encodeURIComponent(
        errorDescription
      )}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/integrations?error=no_code`);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${origin}/login`);
    }

    // Exchange code for tokens
    const redirectUri = `${origin}/api/whoop/callback`;
    console.log("Exchanging code for tokens with redirect URI:", redirectUri);

    const tokens = await exchangeCodeForTokens(code, redirectUri);
    console.log("WHOOP tokens received:", {
      has_access_token: !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      expires_in: tokens.expires_in,
      access_token_preview: tokens.access_token?.substring(0, 20) + "...",
    });

    // Store tokens in database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (supabase as any)
      .from("integrations")
      .upsert(
        {
          user_id: user.id,
          provider: "whoop",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(
            Date.now() + tokens.expires_in * 1000
          ).toISOString(),
          scopes: ["read:recovery", "read:sleep", "read:workout"],
          is_active: true,
          last_sync_at: null,
        },
        {
          onConflict: "user_id,provider",
        }
      );

    if (dbError) {
      console.error("Error saving WHOOP integration:", dbError);
      return NextResponse.redirect(`${origin}/integrations?error=db_error`);
    }

    return NextResponse.redirect(`${origin}/integrations?success=whoop`);
  } catch (err) {
    console.error("WHOOP OAuth error:", err);
    return NextResponse.redirect(`${origin}/integrations?error=oauth_error`);
  }
}
