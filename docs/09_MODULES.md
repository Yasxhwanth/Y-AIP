# Y-AIP — Platform Modules (UI Layer)
### Nexus, Canvas, Lens, Stream, Atlas, Logic Studio, EvalScope

---

## Module Overview

Y-AIP ships with a suite of built-in modules, each mapping to specific Palantir equivalents. All modules are built on the Next.js 15 App Router and access the Ontology exclusively via tRPC + MCP Gateway.

| Y-AIP Module | Palantir Equivalent | Primary User |
|---|---|---|
| **Nexus** | Workshop | Operators, business users |
| **Canvas** | Slate | Developer-builders |
| **Lens** | Contour | Data analysts |
| **Stream** | Quiver | Object-level analysts |
| **Atlas** | Ontology Manager | Ontology architects |
| **Logic Studio** | AIP Logic | AI engineers |
| **Agent Studio** | AIP Agent Studio | AI engineers |
| **EvalScope** | AIP Evals | QA / compliance |
| **Forge** | Pipeline Builder | Data engineers |
| **Sentinel** | Gotham | Defense intelligence |

---

## 1. Nexus (Workshop equivalent)

**Purpose**: Low-code operational application builder for end-users. Nexus apps are built on the Ontology — every widget reads from and writes to Ontology objects.

### Widget Types

| Widget | Function |
|---|---|
| `ObjectTable` | Display objects of a type with filterable columns |
| `ObjectDetail` | Rich card view of a single object and its linked objects |
| `MapWidget` | Geo visualization (Mapbox/Deck.gl) — supports drone GPS, geofences |
| `ChartWidget` | Time-series charts from object properties |
| `ActionButton` | Triggers a registered Action (with HITL gate enforcement) |
| `ProposalInbox` | Displays pending AI proposals for human review and approval |
| `AgentRunMonitor` | Live view of active agent runs and their state machine progress |
| `KPICard` | Single-value metric card derived from Ontology aggregations |
| `AlertFeed` | Real-time stream of Automate-triggered compliance alerts |
| `3DAssetViewer` | Three.js-powered 3D visualization of assets (drones, facilities) |

### Nexus App Schema (Metadata-Driven)

```typescript
interface NexusApp {
  app_id: string;
  name: string;
  layout: NexusLayout;             // Grid-based layout definition
  pages: NexusPage[];
  permissions: {
    view_roles: string[];
    edit_roles: string[];
  };
  industry_context: string;
}

interface NexusPage {
  page_id: string;
  title: string;
  widgets: NexusWidget[];
}

interface NexusWidget {
  widget_id: string;
  widget_type: string;
  grid_position: { col: number; row: number; w: number; h: number };
  config: Record<string, unknown>;  // Metadata-driven, not hardcoded per widget type
}
```

---

## 2. Canvas (Slate equivalent)

**Purpose**: Developer-grade custom application builder. Canvas gives full access to the Y-AIP React component library, tRPC hooks, and Ontology query SDK. Used for bespoke UIs that Nexus's grid system cannot accommodate.

### React SDK Example

```tsx
// Canvas app: Custom drone command center
import { useOntology, useProposals, useAgentRun } from "@yaip/react-sdk";
import { DroneMap3D } from "@yaip/components";

export function DroneCommandCenter() {
  const drones = useOntology.objects("DroneUnit", {
    filter: { mission_status: "ACTIVE" },
    liveProperties: ["battery_pct", "gps_lat", "gps_lon"],
    refreshInterval: 1000,
  });

  const proposals = useProposals({ status: "pending", hitl_level: [2, 3] });

  return (
    <div className="command-center">
      <DroneMap3D drones={drones.data} />
      <ProposalInbox proposals={proposals.data} onApprove={proposals.approve} />
    </div>
  );
}
```

---

## 3. Lens (Contour equivalent)

**Purpose**: Dataset-centric analytics. Lens operates on raw connector data (via Trino federated queries) rather than Ontology objects. Used for exploratory data analysis and pipeline validation.

### Key Features
- **Board Pipeline**: Linear sequence of transformation steps (filter, aggregate, join, pivot)
- **SQL Escape Hatch**: Any board step can drop to raw SQL against Trino
- **Reproducible**: Every Lens analysis is version-controlled and reproducible
- **Export**: Results exportable to Ontology objects, CSV, or as a Nexus data source
- **Collaboration**: Multiple analysts can comment on and fork boards

---

## 4. Stream (Quiver equivalent)

**Purpose**: Object-level and time-series analytics. Stream operates on Ontology objects rather than raw tables, enabling relationship-driven analysis.

### Key Features
- **Object Explorer**: Browse all objects of a type, filter by properties
- **Relationship Traversal**: Click any object link to pivot into related objects
- **Time-Series Charts**: Plot any numeric object property over time
- **Cohort Analysis**: Compare groups of objects (e.g., all missions in Q1 vs Q2)
- **Scatter Plots**: Correlate two numeric properties across an object set
- **Embed in Nexus**: Any Stream analysis can be embedded as a widget in a Nexus app

---

## 5. Atlas (Ontology Manager)

**Purpose**: The source of truth for all Ontology definitions. Atlas is where operators review Discovery Agent proposals and define object types, properties, links, and actions.

### Atlas Capabilities

| Capability | Description |
|---|---|
| **Proposal Review** | Visual diff of Discovery Agent proposals — approve, reject, or modify |
| **Object Type Editor** | Define new object types, properties, and their data types |
| **Link Editor** | Define new relationship types with cardinality rules |
| **Action Editor** | Register new MCP Actions with HITL levels and permissions |
| **Schema Watcher** | View connector schema drift alerts |
| **Graph Visualizer** | Interactive Neo4j graph browser for all object types |
| **Version History** | Full git-like history of all ontology changes |
| **Impact Analysis** | "If I delete this object type, what Nexus apps and Logic chains break?" |

---

## 6. Sentinel (Gotham equivalent — Defense only)

**Purpose**: Defense/intelligence command interface. Only available when `CLASSIFICATION_MODE >= SECRET`.

### Features
- **Entity Relationship Graph**: Interactive visualization of ThreatEntity networks
- **SIGINT/GEOINT Fusion**: Multi-source intelligence correlation on a single timeline
- **Target Lifecycle Management**: Track individual threat entities through mission phases
- **Federated Data Sources**: Query allied-nation data systems (with appropriate access)
- **Mission Planning Board**: Drag-and-drop mission builder linked to Asset ontology
- **Operational Picture**: Full-screen geo-temporal situational awareness view
- **Air-Gap Sync Panel**: Displays pending DDIL sync queue from disconnected nodes
