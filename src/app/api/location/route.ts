import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { latitude, longitude } = body;

    // Validation
    if (
      typeof latitude !== "number" || typeof longitude !== "number" ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    // Round coordinates to 2 decimals for cache lookup
    const roundedLat = Math.round(latitude * 100) / 100;
    const roundedLon = Math.round(longitude * 100) / 100;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("users")
      .update({
        latitude,
        longitude,
        location_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("Error updating location:", error);
      return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
    }

    // Invalidate weather cache for this location
    await supabase
      .from("weather_cache")
      .delete()
      .eq("latitude", roundedLat)
      .eq("longitude", roundedLon);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Location API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
