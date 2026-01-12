import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/integrations/strava";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const origin = requestUrl.origin;

  if (error) {
    return NextResponse.redirect(`${origin}/integrations?error=${error}`);
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
    const tokens = await exchangeCodeForTokens(code);

    // Store tokens in database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (supabase as any)
      .from("integrations")
      .upsert(
        {
          user_id: user.id,
          provider: "strava",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
          scopes: ["activity:read_all", "profile:read_all"],
          is_active: true,
          last_sync_at: null,
        },
        {
          onConflict: "user_id,provider",
        }
      );

    if (dbError) {
      console.error("Error saving Strava integration:", dbError);
      return NextResponse.redirect(`${origin}/integrations?error=db_error`);
    }

    // Trigger initial sync
    // This could be done via a background job in production
    // For MVP, we'll redirect and let the user trigger sync manually

    return NextResponse.redirect(`${origin}/integrations?success=strava`);
  } catch (err) {
    console.error("Strava OAuth error:", err);
    return NextResponse.redirect(`${origin}/integrations?error=oauth_error`);
  }
}
