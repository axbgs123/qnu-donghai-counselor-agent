import { NextResponse } from "next/server";
import { AUTH_COOKIE, getSessionTokenFromRequest, logoutSession } from "../../../lib/auth-storage";

export async function POST(request: Request) {
  await logoutSession(getSessionTokenFromRequest(request));
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(AUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", expires: new Date(0) });
  return response;
}

