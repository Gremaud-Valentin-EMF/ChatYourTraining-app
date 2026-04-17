import { NextResponse, type NextRequest } from "next/server";

function hasValidSession(request: NextRequest): boolean {
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0];
  const cookieName = `sb-${projectId}-auth-token`;
  const cookie = request.cookies.get(cookieName);

  if (!cookie?.value) return false;

  try {
    // Cookie value may be prefixed with "base64-"
    const raw = cookie.value.startsWith("base64-")
      ? Buffer.from(cookie.value.slice(7), "base64").toString("utf-8")
      : cookie.value;

    const session = JSON.parse(raw);

    // A refresh_token means the user has an active session even if the
    // access token is expired — route handlers will refresh it automatically.
    return typeof session.refresh_token === "string" && session.refresh_token.length > 0;
  } catch {
    return false;
  }
}

export async function updateSession(request: NextRequest) {
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

  const authPaths = ["/login", "/register"];
  const isAuthPath = authPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  const hasSession = hasValidSession(request);

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
