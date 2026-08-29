import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/auth/me/route";

const profile = {
  name: "Kai",
  username: "kai",
  email: "kai@example.com",
  role: "staff",
  status: "active",
  must_change_password: false,
  restaurant_name: "Demo",
  restaurant_slug: "demo",
  scope: {
    restaurant_id: 1,
    actor_id: 2,
    role: "staff",
    authority_epoch: "v1.opaque",
  },
};

test("renewal response sets a 30-day cookie used by the next BFF request", async () => {
  const originalFetch = globalThis.fetch;
  const authorizations: string[] = [];
  let call = 0;
  globalThis.fetch = async (_input, init) => {
    authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
    call += 1;
    return Response.json(
      call === 1
        ? { ...profile, access_token: "rotated-token", expires_in: 2_592_000 }
        : profile,
    );
  };

  try {
    const renewed = await GET(
      new NextRequest("https://omlu.test/api/auth/me", {
        headers: { cookie: "staff_token=old-token" },
      }),
    );
    const setCookie = renewed.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /staff_token=rotated-token/);
    assert.match(setCookie, /Max-Age=2592000/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=lax/i);

    await GET(
      new NextRequest("https://omlu.test/api/auth/me", {
        headers: { cookie: "staff_token=rotated-token" },
      }),
    );
    assert.deepEqual(authorizations, ["Bearer old-token", "Bearer rotated-token"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
