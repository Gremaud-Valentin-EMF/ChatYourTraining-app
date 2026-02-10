import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeatherContext } from "@/lib/integrations/weather";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user location
    const { data: profile } = await supabase
      .from("users")
      .select("latitude, longitude")
      .eq("id", user.id)
      .single();

    if (!profile?.latitude || !profile?.longitude) {
      return NextResponse.json({ error: "Location not available" }, { status: 400 });
    }

    // Fetch weather
    const weather = await getWeatherContext(supabase, profile.latitude, profile.longitude);

    return NextResponse.json(weather);
  } catch (error) {
    console.error("Weather API error:", error);
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}
