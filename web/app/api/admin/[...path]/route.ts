import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

const API_BASE = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

async function forwardToBackend(request: NextRequest, params: RouteParams["params"], method: string) {
  const auth = await assertAdmin();
  if ("error" in auth) {
    return auth.error;
  }

  const { session } = auth;
  const { path } = await params;

  if (!Array.isArray(path) || path.length === 0) {
    return NextResponse.json(
      { error: "Invalid admin api path", code: "invalid_path" },
      { status: 400 }
    );
  }

  const query = request.nextUrl.search || "";
  const targetUrl = `${API_BASE}/api/admin/${path.join("/")}${query}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const traceId = request.headers.get("x-trace-id");
  if (traceId) {
    headers.set("x-trace-id", traceId);
  }

  if (session.user.email) {
    headers.set("x-omytree-admin-email", session.user.email);
  }
  if (session.user.id) {
    headers.set("x-omytree-user-id", session.user.id);
  }

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const raw = await request.arrayBuffer();
    body = raw.byteLength > 0 ? raw : undefined;
  }

  try {
    const backendResponse = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
    });

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.delete("transfer-encoding");
    responseHeaders.delete("connection");
    responseHeaders.delete("content-length");

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[api/admin/[...path]] proxy error:", err);
    return NextResponse.json(
      { error: "Backend unavailable", code: "backend_error" },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return forwardToBackend(request, params, "GET");
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return forwardToBackend(request, params, "POST");
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  return forwardToBackend(request, params, "PUT");
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return forwardToBackend(request, params, "PATCH");
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return forwardToBackend(request, params, "DELETE");
}
