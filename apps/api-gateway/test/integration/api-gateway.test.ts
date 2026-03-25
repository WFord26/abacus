import { signToken } from "@wford26/auth-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApiGateway } from "../../src/app";

const JWT_SECRET = "gateway-test-secret";

function createAccessToken() {
  return signToken(
    {
      email: "owner@example.com",
      organizationId: "4d5c55fd-c4f0-4ffb-a6e9-a6b4f1f63df4",
      role: "owner",
      userId: "08402c16-a8fe-4912-a739-5a0d76bc21c7",
    },
    JWT_SECRET,
    "15m"
  );
}

describe("api-gateway T-031 identity routing", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let app: ReturnType<typeof buildApiGateway>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    app = buildApiGateway({
      config: {
        frontendOrigin: "http://localhost:3007",
        jwtSecret: JWT_SECRET,
        serviceUrls: {
          identity: "http://identity-service:3001",
        },
      },
      fetchImpl: fetchMock as typeof fetch,
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("forwards auth requests to the identity service without requiring a JWT", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            tokens: {
              accessToken: "token",
            },
          },
        }),
        {
          headers: {
            "content-type": "application/json",
            "set-cookie": "abacus_refresh_token=refresh-token; Path=/; HttpOnly",
          },
          status: 200,
        }
      )
    );

    const response = await request(app.server).post("/api/v1/auth/login").send({
      email: "owner@example.com",
      password: "password123",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("http://identity-service:3001/auth/login");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.body).toBe(
      JSON.stringify({
        email: "owner@example.com",
        password: "password123",
      })
    );
    expect(response.headers["set-cookie"]?.[0]).toContain("abacus_refresh_token=refresh-token");
  });

  it("forwards protected identity routes with bearer authorization intact", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            email: "owner@example.com",
            id: "08402c16-a8fe-4912-a739-5a0d76bc21c7",
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }
      )
    );

    const token = createAccessToken();
    const response = await request(app.server)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("http://identity-service:3001/me");
    expect(requestInit.method).toBe("GET");
    expect((requestInit.headers as Headers).get("authorization")).toBe(`Bearer ${token}`);
  });

  it("forwards organization membership requests and preserves query strings", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }
      )
    );

    const token = createAccessToken();
    const response = await request(app.server)
      .get("/api/v1/organizations/4d5c55fd-c4f0-4ffb-a6e9-a6b4f1f63df4/members?status=active")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    const [url] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "http://identity-service:3001/organizations/4d5c55fd-c4f0-4ffb-a6e9-a6b4f1f63df4/members?status=active"
    );
  });

  it("returns 401 for protected identity routes without a token", async () => {
    const response = await request(app.server).get("/api/v1/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the identity service URL is not configured", async () => {
    await app.close();

    app = buildApiGateway({
      config: {
        jwtSecret: JWT_SECRET,
        serviceUrls: {
          identity: undefined,
        },
      },
      fetchImpl: fetchMock as typeof fetch,
    });

    await app.ready();

    const response = await request(app.server).post("/api/v1/auth/register").send({
      email: "owner@example.com",
      name: "Owner",
      password: "password123",
    });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
