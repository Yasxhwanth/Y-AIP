# `@yaip/ontology-sdk`

Typed SDK for the Y-AIP Ontology Manager.

It wraps the existing `/api/ontology/*` manager endpoints and adds a helper for the Palantir-style flow of creating an object type from a backing dataset preview.

## Usage

```ts
import { createOntologyManagerClient } from "@yaip/ontology-sdk";

const ontology = createOntologyManagerClient({
  baseUrl: "http://localhost:4001/api/ontology",
});

const schema = await ontology.getSchema();
const objectTypes = await ontology.objectTypes.list();
```

## Create an object type from a dataset

```ts
await ontology.createObjectTypeFromDataset({
  projectId: "workspace-123",
  datasetId: "all_orders.csv",
  api_name: "order",
  display_name: "Order",
  primary_key: "Order Id",
  title_property: "Item Name",
});
```

## Covered areas

- Object types
- Link types
- Action types
- Interfaces
- Projects and datasets
- Pipelines and saved transforms
- Full ontology schema fetch
