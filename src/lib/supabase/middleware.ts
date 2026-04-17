import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Protected routes
  const protectedPaths = [
    "/dashboard",
    "/calendar",
    "/health",
    "/integrations",
    "/profile",
    "/workouts",
  ];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Auth routes (redirect if already logged in)
  const authPaths = ["/login", "/register"];
  const isAuthPath = authPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Read session from cookie without any network call
  const cookieName = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`;
  const hasSession = request.cookies.has(cookieName);

  if (isProtectedPath && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isAuthPath && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
