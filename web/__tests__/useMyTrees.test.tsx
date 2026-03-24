import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { Mock } from "vitest";
import { useMyTrees } from "@/lib/hooks/useMyTrees";
import { useSession } from "next-auth/react";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retryDelay: 0,
      },
    },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useMyTrees", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      // @ts-expect-error cleanup
      delete global.fetch;
    }
  });

  it("returns empty list when unauthenticated", async () => {
    (useSession as unknown as Mock).mockReturnValue({ data: null, status: "unauthenticated" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useMyTrees(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.trees).toEqual([]);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces errors and falls back to empty list", async () => {
    (useSession as unknown as Mock).mockReturnValue({
      data: { user: { id: "user-1" } },
      status: "authenticated",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("failed", { status: 500 }))
    );

    const { result } = renderHook(() => useMyTrees(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.trees).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("handles missing SessionProvider gracefully", async () => {
    (useSession as unknown as Mock).mockImplementation(() => {
      throw new Error("no provider");
    });
    vi.stubGlobal("fetch", vi.fn());

    const { result } = renderHook(() => useMyTrees(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.trees).toEqual([]);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
