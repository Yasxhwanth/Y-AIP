export type DataType = "string" | "integer" | "double" | "boolean" | "date" | "timestamp";

export interface OntologyProperty {
  api_name: string;
  display_name: string;
  data_type: DataType | string;
  is_primary_key: boolean;
  is_required: boolean;
}

export interface OntologyObjectType {
  api_name: string;
  display_name: string;
  plural_display_name: string;
  description: string;
  primary_key: string;
  title_property: string;
  backing_source: string;
  icon: string;
  properties: OntologyProperty[];
  implements: string[];
  link_types?: unknown[];
  action_types?: unknown[];
}

export interface CreateOntologyObjectTypeInput {
  api_name: string;
  display_name: string;
  plural_display_name?: string;
  description?: string;
  primary_key: string;
  title_property?: string;
  backing_source?: string;
  icon?: string;
  properties?: OntologyProperty[];
  implements_interfaces?: string[];
}

export interface UpdateOntologyObjectTypeInput {
  display_name?: string;
  plural_display_name?: string;
  description?: string;
  title_property?: string;
  backing_source?: string;
  icon?: string;
}

export interface OntologyLinkType {
  api_name: string;
  display_name_a_side: string;
  display_name_b_side: string;
  cardinality: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY";
  source: string;
  source_display?: string;
  target: string;
  target_display?: string;
  foreign_key_property?: string | null;
}

export interface CreateOntologyLinkTypeInput {
  api_name: string;
  display_name_a_side: string;
  display_name_b_side: string;
  cardinality: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY";
  source_object_type: string;
  target_object_type: string;
  foreign_key_property?: string | null;
}

export interface OntologyActionParameter {
  api_name: string;
  display_name: string;
  data_type: DataType | "object_reference" | string;
  object_type_ref?: string | null;
  is_required: boolean;
  description?: string;
}

export interface OntologyActionType {
  api_name: string;
  display_name: string;
  description: string;
  status: string;
  hitl_level: number;
  writeback_target: string;
  parameters: OntologyActionParameter[];
  targets: string[];
}

export interface CreateOntologyActionTypeInput {
  api_name: string;
  display_name: string;
  description?: string;
  hitl_level?: number;
  writeback_target: string;
  targets?: string[];
  parameters?: OntologyActionParameter[];
  rules?: unknown[];
}

export interface ActionApplyResult {
  status: string;
  message?: string;
  proposal_id?: string;
  hitl_level?: number;
  [key: string]: unknown;
}

export interface OntologyInterface {
  api_name: string;
  display_name: string;
  description: string;
  properties: OntologyProperty[];
  implemented_by: string[];
}

export interface CreateOntologyInterfaceInput {
  api_name: string;
  display_name: string;
  description?: string;
  properties?: Array<Omit<OntologyProperty, "is_primary_key"> & { is_primary_key?: boolean }>;
}

export interface OntologyProject {
  id: string;
  name: string;
  description?: string;
  space?: string;
  folder_path?: string;
  created_at?: number | string;
  views?: string | number;
  [key: string]: unknown;
}

export interface CreateOntologyProjectInput {
  id?: string;
  name: string;
  description?: string;
  space?: string;
  folder_path?: string;
}

export interface OntologyDataset {
  id: string;
  name: string;
  file_path?: string;
  created_at?: number | string;
  [key: string]: unknown;
}

export interface DatasetPreviewColumn {
  name: string;
  type: string;
}

export interface DatasetPreviewRow {
  [columnName: string]: string;
}

export interface DatasetPreview {
  columns: DatasetPreviewColumn[];
  rows: DatasetPreviewRow[];
  total?: number;
}

export interface OntologyPipeline {
  id: string;
  name: string;
  projectId?: string;
  folder_id?: string;
  type?: string;
  compute?: string;
  created_at?: number | string;
  [key: string]: unknown;
}

export interface CreateOntologyPipelineInput {
  id: string;
  name: string;
  folderId?: string;
  type?: string;
  compute?: string;
}

export interface SavedPipelineTransforms {
  pathName: string;
  transforms: Array<{ id: string; type: string; params: Record<string, unknown>; applied: boolean }>;
}

export interface OntologySchema {
  object_types: OntologyObjectType[];
  link_types: OntologyLinkType[];
  action_types: OntologyActionType[];
  interfaces: OntologyInterface[];
}

export interface CreateObjectTypeFromDatasetInput {
  projectId: string;
  datasetId: string;
  api_name: string;
  display_name: string;
  primary_key: string;
  title_property: string;
  plural_display_name?: string;
  description?: string;
  backing_source?: string;
  icon?: string;
  includeColumns?: string[];
  requiredColumns?: string[];
  propertyTypeOverrides?: Record<string, DataType | string>;
  implements_interfaces?: string[];
}
