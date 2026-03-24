import type {
  BaseRecord,
  CrudFilter,
  CustomParams,
  CustomResponse,
  DataProvider,
  DeleteOneParams,
  DeleteOneResponse,
  GetListParams,
  GetListResponse,
  GetOneParams,
  GetOneResponse,
  CreateParams,
  CreateResponse,
  UpdateParams,
  UpdateResponse,
} from "@refinedev/core";
import { appApiRequest, appApiFetch, AppApiError } from "@/lib/app-api-client";

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function normalizeResource(resource: string): string {
  return resource.replace(/^\/+/, "").replace(/\/+$/, "");
}

function extractSearchQuery(filters?: CrudFilter[]): string | undefined {
  if (!Array.isArray(filters)) return undefined;

  for (const filter of filters) {
    if (!isObject(filter)) continue;
    if (!("field" in filter) || !("operator" in filter)) continue;

    const field = String((filter as UnknownRecord).field || "").trim();
    const operator = String((filter as UnknownRecord).operator || "").trim();
    const value = (filter as UnknownRecord).value;

    if (!field || typeof value !== "string") continue;
    if (!value.trim()) continue;

    if (field === "q" || field === "email" || field === "search") {
      if (operator === "contains" || operator === "eq" || operator === "startswith") {
        return value.trim();
      }
    }
  }

  return undefined;
}

function pickEntity(payload: unknown): UnknownRecord {
  if (!isObject(payload)) return {};
  if (isObject(payload.user)) return payload.user;
  if (isObject(payload.doc)) return payload.doc;
  if (isObject(payload.provider)) return payload.provider;
  if (isObject(payload.deleted)) return payload.deleted;
  if (isObject(payload.data)) return payload.data;
  return payload;
}

export const adminDataProvider: DataProvider = {
  getApiUrl: () => "/api/admin",

  async getList<TData extends BaseRecord = BaseRecord>(
    params: GetListParams
  ): Promise<GetListResponse<TData>> {
    const { resource, pagination, filters } = params;
    const endpoint = normalizeResource(resource);

    if (endpoint === "users") {
      const q = extractSearchQuery(filters);
      const searchParams = new URLSearchParams();
      if (q) searchParams.set("q", q);

      const query = searchParams.toString();
      const payload = await appApiRequest<{
        users?: UnknownRecord[];
        total?: number;
        stats?: UnknownRecord;
      }>(`/admin/users${query ? `?${query}` : ""}`, { method: "GET", cache: "no-store" });

      const allUsers = Array.isArray(payload.users) ? payload.users : [];
      const total = typeof payload.total === "number" ? payload.total : allUsers.length;

      const current = Math.max(1, pagination?.currentPage ?? 1);
      const pageSize = Math.max(1, pagination?.pageSize ?? 20);
      const offset = (current - 1) * pageSize;
      const data = allUsers.slice(offset, offset + pageSize);

      return {
        data: data as TData[],
        total,
        stats: payload.stats ?? { admins: 0, active: 0 },
      };
    }

    const payload = await appApiRequest<UnknownRecord>(`/admin/${endpoint}`, { method: "GET", cache: "no-store" });
    if (Array.isArray(payload.data)) {
      return {
        data: payload.data as TData[],
        total: typeof payload.total === "number" ? payload.total : payload.data.length,
      };
    }

    const listCandidate = Object.values(payload).find((value) => Array.isArray(value));
    if (Array.isArray(listCandidate)) {
      return {
        data: listCandidate as TData[],
        total: listCandidate.length,
      };
    }

    return { data: [] as TData[], total: 0 };
  },

  async getOne<TData extends BaseRecord = BaseRecord>(
    params: GetOneParams
  ): Promise<GetOneResponse<TData>> {
    const { resource, id } = params;
    const endpoint = normalizeResource(resource);
    const payload = await appApiRequest<UnknownRecord>(`/admin/${endpoint}/${id}`, { method: "GET", cache: "no-store" });
    return { data: pickEntity(payload) as TData };
  },

  async create<TData extends BaseRecord = BaseRecord, TVariables = {}>(
    params: CreateParams<TVariables>
  ): Promise<CreateResponse<TData>> {
    const { resource, variables } = params;
    const endpoint = normalizeResource(resource);
    const payload = await appApiRequest<UnknownRecord>(`/admin/${endpoint}`, {
      method: "POST",
      body: variables ?? {},
    });
    return { data: pickEntity(payload) as TData };
  },

  async update<TData extends BaseRecord = BaseRecord, TVariables = {}>(
    params: UpdateParams<TVariables>
  ): Promise<UpdateResponse<TData>> {
    const { resource, id, variables } = params;
    const endpoint = normalizeResource(resource);
    const method = endpoint === "users" ? "PATCH" : "PUT";
    const payload = await appApiRequest<UnknownRecord>(`/admin/${endpoint}/${id}`, {
      method,
      body: variables ?? {},
    });
    return { data: pickEntity(payload) as TData };
  },

  async deleteOne<TData extends BaseRecord = BaseRecord, TVariables = {}>(
    params: DeleteOneParams<TVariables>
  ): Promise<DeleteOneResponse<TData>> {
    const { resource, id, variables } = params;
    const endpoint = normalizeResource(resource);
    const payload = await appApiRequest<UnknownRecord>(`/admin/${endpoint}/${id}`, {
      method: "DELETE",
      body: variables ?? undefined,
    });

    const entity = pickEntity(payload);
    return {
      data: {
        id,
        ...entity,
      } as TData,
    };
  },

  async custom<TData extends BaseRecord = BaseRecord, TQuery = unknown, TPayload = unknown>(
    params: CustomParams<TQuery, TPayload>
  ): Promise<CustomResponse<TData>> {
    const { url, method, payload, headers, meta } = params;
    const metaHeaders = isObject(meta) ? (meta.headers as HeadersInit | undefined) : undefined;
    const rawHeaders = headers ?? metaHeaders;
    const uppercaseMethod = method.toUpperCase();
    const hasBody = uppercaseMethod !== "GET" && uppercaseMethod !== "HEAD";
    const body = hasBody
      ? payload === undefined
        ? undefined
        : payload instanceof FormData
        ? payload
        : (payload as object)
      : undefined;

    // The `url` param from Refine's useCustom is typically a full path like "/api/admin/..."
    // We need to normalize it for appApiRequest which auto-prefixes "/api"
    const normalizedUrl = url.startsWith("/api/") ? url.slice(4) : url;

    const responsePayload = await appApiRequest<UnknownRecord>(normalizedUrl, {
      method: uppercaseMethod,
      headers: rawHeaders,
      body,
      cache: "no-store",
    });

    return { data: responsePayload as TData };
  },
};
