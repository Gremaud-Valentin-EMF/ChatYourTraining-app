import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/integrations/strava";
import { encrypt } from "@/lib/crypto/tokens";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const state = requestUrl.searchParams.get("state");
  const origin = requestUrl.origin;

  // Refus explicite de l'utilisateur → message informatif, pas une erreur
  if (error === "access_denied") {
    return NextResponse.redirect(`${origin}/integrations?cancelled=strava`);
  }

  if (error) {
    return NextResponse.redirect(`${origin}/integrations?error=${error}`);
  }

  // Validation CSRF : le state doit être présent et correspondre au cookie
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("strava_oauth_state")?.value;

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json(
      { error: "Invalid state parameter" },
      { status: 403 }
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
    const tokens = await exchangeCodeForTokens(code);

    // Chiffrer les tokens avant stockage
    const encryptedAccess = encrypt(tokens.access_token);
    const encryptedRefresh = encrypt(tokens.refresh_token);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (supabase as any)
      .from("integrations")
      .upsert(
        {
          user_id: user.id,
          provider: "strava",
          access_token: encryptedAccess,
          refresh_token: encryptedRefresh,
          token_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
          scopes: ["activity:read_all", "profile:read_all"],
          is_active: true,
          last_sync_at: null,
        },
        { onConflict: "user_id,provider" }
      );

    if (dbError) {
      console.error("Error saving Strava integration:", dbError);
      return NextResponse.redirect(`${origin}/integrations?error=db_error`);
    }

    // Effacer le cookie state et rediriger vers la page de succès
    const response = NextResponse.redirect(
      `${origin}/integrations?connected=strava`
    );
    response.cookies.delete("strava_oauth_state");
    return response;
  } catch (err) {
    console.error("Strava OAuth error:", err);
    return NextResponse.redirect(`${origin}/integrations?error=oauth_error`);
  }
}
