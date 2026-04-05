import type {
  ActionApplyResult,
  CreateObjectTypeFromDatasetInput,
  CreateOntologyActionTypeInput,
  CreateOntologyInterfaceInput,
  CreateOntologyLinkTypeInput,
  CreateOntologyObjectTypeInput,
  CreateOntologyPipelineInput,
  CreateOntologyProjectInput,
  DatasetPreview,
  OntologyActionType,
  OntologyDataset,
  OntologyInterface,
  OntologyLinkType,
  OntologyObjectType,
  OntologyPipeline,
  OntologyProject,
  OntologyProperty,
  OntologySchema,
  SavedPipelineTransforms,
  UpdateOntologyObjectTypeInput,
} from "./types.js";

export interface OntologyManagerClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

export class OntologyManagerError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "OntologyManagerError";
    this.status = status;
    this.body = body;
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function toApiName(label: string): string {
  return label
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function toDisplayName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function inferDataTypeFromValues(values: string[]): string {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) return "string";

  const isBoolean = normalized.every((value) => /^(true|false)$/i.test(value));
  if (isBoolean) return "boolean";

  const isInteger = normalized.every((value) => /^-?\d+$/.test(value));
  if (isInteger) return "integer";

  const isDouble = normalized.every((value) => /^-?\d+(\.\d+)?$/.test(value));
  if (isDouble) return "double";

  const isDate = normalized.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (isDate) return "date";

  const isTimestamp = normalized.every((value) => !Number.isNaN(Date.parse(value)));
  if (isTimestamp) return "timestamp";

  return "string";
}

export class OntologyManagerClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders?: HeadersInit;

  constructor(options: OntologyManagerClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.fetchImpl = options.fetch ?? fetch;
    this.defaultHeaders = options.headers;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(this.defaultHeaders);
    if (init.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    const hasBody = init.body !== undefined && init.body !== null;
    if (hasBody && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const text = await response.text();
    const body = text ? safeParseJson(text) : null;

    if (!response.ok) {
      const message =
        typeof body === "object" && body !== null && "error" in body && typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `Request failed with status ${response.status}`;
      throw new OntologyManagerError(message, response.status, body);
    }

    return body as T;
  }

  async getSchema(): Promise<OntologySchema> {
    return this.request<OntologySchema>("/schema");
  }

  readonly objectTypes = {
    list: (): Promise<OntologyObjectType[]> => this.request<OntologyObjectType[]>("/object-types"),
    get: (apiName: string): Promise<OntologyObjectType> => this.request<OntologyObjectType>(`/object-types/${encodeURIComponent(apiName)}`),
    create: (input: CreateOntologyObjectTypeInput): Promise<{ status: string; api_name: string }> =>
      this.request<{ status: string; api_name: string }>("/object-types", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (apiName: string, input: UpdateOntologyObjectTypeInput): Promise<{ status: string; api_name: string }> =>
      this.request<{ status: string; api_name: string }>(`/object-types/${encodeURIComponent(apiName)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    delete: (apiName: string): Promise<{ status: string; api_name: string }> =>
      this.request<{ status: string; api_name: string }>(`/object-types/${encodeURIComponent(apiName)}`, {
        method: "DELETE",
      }),
  };

  readonly linkTypes = {
    list: (): Promise<OntologyLinkType[]> => this.request<OntologyLinkType[]>("/link-types"),
    create: (input: CreateOntologyLinkTypeInput): Promise<{ status: string; api_name: string }> =>
      this.request<{ status: string; api_name: string }>("/link-types", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };

  readonly actionTypes = {
    list: (): Promise<OntologyActionType[]> => this.request<OntologyActionType[]>("/action-types"),
    get: (apiName: string): Promise<OntologyActionType> => this.request<OntologyActionType>(`/action-types/${encodeURIComponent(apiName)}`),
    create: (input: CreateOntologyActionTypeInput): Promise<{ status: string; api_name: string }> =>
      this.request<{ status: string; api_name: string }>("/action-types", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    apply: (apiName: string, params: Record<string, unknown>): Promise<ActionApplyResult> =>
      this.request<ActionApplyResult>(`/action-types/${encodeURIComponent(apiName)}/apply`, {
        method: "POST",
        body: JSON.stringify(params),
      }),
  };

  readonly interfaces = {
    list: (): Promise<OntologyInterface[]> => this.request<OntologyInterface[]>("/interfaces"),
    create: (input: CreateOntologyInterfaceInput): Promise<{ status: string; api_name: string }> =>
      this.request<{ status: string; api_name: string }>("/interfaces", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };

  readonly projects = {
    list: (): Promise<OntologyProject[]> => this.request<OntologyProject[]>("/projects"),
    get: (id: string): Promise<OntologyProject> => this.request<OntologyProject>(`/projects/${encodeURIComponent(id)}`),
    create: (input: CreateOntologyProjectInput): Promise<{ success: boolean; projectId?: string; id?: string }> =>
      this.request<{ success: boolean; projectId?: string; id?: string }>("/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    listDatasets: (id: string): Promise<OntologyDataset[]> => this.request<OntologyDataset[]>(`/projects/${encodeURIComponent(id)}/datasets`),
    previewDataset: (datasetId: string, projectId?: string): Promise<DatasetPreview> =>
      this.request<DatasetPreview>(
        `/datasets/${encodeURIComponent(datasetId)}/preview${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
      ),
    createPipeline: (projectId: string, input: CreateOntologyPipelineInput): Promise<{ success: boolean; pipelineId: string }> =>
      this.request<{ success: boolean; pipelineId: string }>(`/projects/${encodeURIComponent(projectId)}/pipelines`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };

  readonly pipelines = {
    list: (): Promise<OntologyPipeline[]> => this.request<OntologyPipeline[]>("/pipelines"),
    get: (id: string): Promise<OntologyPipeline> => this.request<OntologyPipeline>(`/pipelines/${encodeURIComponent(id)}`),
    getTransforms: (id: string, nodeId: string): Promise<SavedPipelineTransforms> =>
      this.request<SavedPipelineTransforms>(`/pipelines/${encodeURIComponent(id)}/transforms/${encodeURIComponent(nodeId)}`),
    saveTransforms: (id: string, nodeId: string, input: SavedPipelineTransforms): Promise<{ success: boolean; offline?: boolean }> =>
      this.request<{ success: boolean; offline?: boolean }>(`/pipelines/${encodeURIComponent(id)}/transforms/${encodeURIComponent(nodeId)}`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };

  async createObjectTypeFromDataset(input: CreateObjectTypeFromDatasetInput): Promise<{ status: string; api_name: string }> {
    const preview = await this.projects.previewDataset(input.datasetId, input.projectId);

    const allowedColumns = new Set(input.includeColumns ?? preview.columns.map((column) => column.name));
    const requiredColumns = new Set(input.requiredColumns ?? [input.primary_key]);
    const rows = preview.rows ?? [];

    const properties: OntologyProperty[] = preview.columns
      .filter((column) => allowedColumns.has(column.name))
      .map((column) => {
        const values = rows.map((row) => row[column.name] ?? "");
        const inferredType = inferDataTypeFromValues(values);
        return {
          api_name: toApiName(column.name),
          display_name: toDisplayName(column.name),
          data_type: input.propertyTypeOverrides?.[column.name] ?? inferredType,
          is_primary_key: column.name === input.primary_key,
          is_required: requiredColumns.has(column.name),
        };
      });

    const primaryKeyApiName = toApiName(input.primary_key);
    const titlePropertyApiName = toApiName(input.title_property);

    const primaryKeyProperty = properties.find((property) => property.api_name === primaryKeyApiName);
    if (!primaryKeyProperty) {
      throw new Error(`Primary key column '${input.primary_key}' was not found in dataset '${input.datasetId}'.`);
    }

    primaryKeyProperty.is_primary_key = true;
    primaryKeyProperty.is_required = true;

    return this.objectTypes.create({
      api_name: input.api_name,
      display_name: input.display_name,
      plural_display_name: input.plural_display_name,
      description: input.description,
      primary_key: primaryKeyApiName,
      title_property: titlePropertyApiName,
      backing_source: input.backing_source ?? input.datasetId,
      icon: input.icon,
      implements_interfaces: input.implements_interfaces,
      properties,
    });
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createOntologyManagerClient(options: OntologyManagerClientOptions): OntologyManagerClient {
  return new OntologyManagerClient(options);
}
