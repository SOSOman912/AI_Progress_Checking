# Current System Architecture

Status: canonical implementation snapshot  
Last updated: 25 November 2026  
Scope: current working product in `studio/`

This file records how the current system actually works, including project-scoped storage, NEC-option-specific behaviour, document pipelines, data models and known limitations. Older architecture notes are historical; when they conflict with this file, this file wins.

---

## 1. Product structure

The product is a Vite + React + TypeScript QS/progress-checking workspace with five rail modules:

| Rail | Module | Route |
|---|---|---|
| 01 | Document Management | `#/bill` |
| 02 | Measurement Library | `#/library` |
| 03 | AI Scanning | `#/data` |
| 04 | Mapping Model | `#/mapping` |
| 05 | eCheck Payment | `#/review` |

The project home is `#/home`.

- The rail is icon-only and 58px wide.
- The project home lists projects and creates project workspaces.
- Selecting a project persists it as the active project and opens `#/bill`.
- The active project is global navigation context, but all working data is project-scoped.
- E/F cost-based flows are only partially implemented. Document Management currently falls back to B/D-style BQ/CE behaviour for E/F.

---

## 2. NEC option matrix

`NEC Option` is the first-class setting. UI and pipeline decisions must be driven by the project's option type, not by guessing from labels.

| Option | Contract type | Main pricing document | Current Document Management behaviour |
|---|---|---|---|
| A | Priced with activity schedule | Activity Schedule | Activity first; BQ reference second; CE third; Subletting under Sub-Contractor |
| B | Priced with bill of quantities | BQ | BQ first; CE second |
| C | Target cost with activity schedule | Activity Schedule | Same as A |
| D | Target cost with bill of quantities | BQ | Same as B |
| E | Cost reimbursable | Cost records | Placeholder; no full cost pipeline |
| F | Management contract | Activity Schedule + cost records | Placeholder; assumption still to confirm |

For A/C:

```text
Client
├── Activity Schedule
├── Bill of Quantity (BQ)   (reference/supporting)
└── Compensation Event (CE)

Sub-Contractor
└── Subletting
```

For B/D:

```text
Client
├── Bill of Quantity (BQ)
└── Compensation Event (CE)
```

`Schedule of Rate` is removed from the current top navigation.

---

## 3. Navigation and page shell

### Client container

`FlowTabs` renders the Client container:

- Logo + `Client`
- Tabs ordered by NEC option
- Active tab uses a white pill and subtle shadow
- A/C order: Activity Schedule, BQ, CE
- B/D order: BQ, CE

### Sub-Contractor container

A/C only. Rendered immediately to the right of Client:

- Logo + `Sub-Contractor`
- One item currently: `Subletting`
- Selecting it opens the Subletting page while retaining the same top nav

### Document Management page headers

All Document Management pages use the module title `Document Management`; the page-specific context is the subtitle.

| Page | Subtitle | Top-right action |
|---|---|---|
| Activity records | Activity Schedule records | `Import` |
| BQ records | Bill of Quantity records / BQ reference records | `Import` |
| CE records | Compensation Event records | `Import CE` |
| Subletting | Subletting Schedule · BK-CP03.02-FR01 (default) / Subletting contracts | `Create Subletting Contract` (Contracts view only) |
| Invoice / DN | Invoice / DN | Placeholder |

---

## 4. Document Management pipeline

### 4.1 Import model

Pricing imports are file-metadata simulations. The UI reads file name/size and simulates upload/progress, but does not parse the real PDF/Excel content in this build.

Import types:

- Main pricing document: Activity Schedule or BQ
- Standard Preamble (SP), optional
- Particular Preamble (PP), optional

Rules:

- Activity Schedule import does not require BQ.
- SP and PP are optional.
- The processing animation is 3 seconds for all pricing imports.
- The `Checking PP against SP` step is shown only when both SP and PP were imported.
- Missing Items Report exists only for B/D. A/C removes it.
- Completion body count reflects 0/1/2 available checks.

### 4.2 BQ records

Each imported BQ creates its own record. If multiple BQ documents are imported together, each file becomes a separate record instead of being grouped.

BQ record status:

- `pending` → opens preprocessing/mapping
- `confirm` → opens Cleanse BQ directly

BQ record fields include optional Activity linkage:

```ts
interface BqRecord {
  id: string;
  code: string;
  name: string;
  files: DocFile[];
  status: 'pending' | 'confirm';
  flow?: 'bq' | 'activity';
  processedAt: number;
  activityItemIds?: string[];
  linkedActivityId?: string;
  linkedActivityCode?: string;
  linkedActivityName?: string;
}
```

### 4.3 A/C BQ → Activity Schedule linkage

For A/C BQ reference imports:

1. Upload BQ (and optional SP/PP)
2. Next Step opens `Link BQ to Activity Schedule`
3. User selects an Activity Schedule record
4. BQ preprocessing starts only after an AS is selected

The BQ record stores the linked AS fields.

Where the link is shown:

- BQ preprocessing right panel: `Linked Activity Schedule`
- Cleanse BQ → Linked documents popup: `Activity Schedule`
- Activity Schedule → Linked documents popup: `Bill of Quantity` group listing BQ reference records linked to that AS

BQ is a supporting/reference document for A/C. It is not a second main pricing document.

### 4.4 BQ preprocessing table

All BQ preprocessing pages use a structured table:

```text
Item | Description | Unit | Qty | Rate (HK$) | Amount (HK$)
```

- BQ Bill sections group the rows.
- Section header shows the mapped SMM library section.
- Qty/Rate/Amount are right-aligned/monospace.
- Rate/Amount show `—` when source data is unpriced.

A/C BQ demo uses the supplied `BQ for RW RC structure (2).pdf` sample:

```text
Bill No. 3 — Site Formation
Schedule No. 3 — Site Formation

Section 7  Earthworks
Section 10 Formwork
Section 11 Steel Reinforcement
Section 12 Concrete
```

It contains 12 items and the quantities extracted from the sample. The PDF has no populated rates/amounts, so those cells are unpriced. B/D keeps its previous demo BQ.

### 4.5 A/C BQ ↔ Activity mapping

Mapping is at **Bill** level, not BQ-item level:

- Left list: extracted BQ bills, layered by Bill No. first and then sections
  - Bill No. / title
  - nested section rows with section number, name and item count
  - Mapped / Unmapped
  - linked Schedule No. / title
- Centre: structured BQ table for the selected bill
- Right: selected bill, linked AS record, editable `Linked Activity Schedule` (Schedule No.) dropdown, mapping status and confirmation button

Pairing rule:

```text
BQ Bill No. 3 — Site Formation
↔ Schedule No. 3 — Site Formation
```

The user can change the linked Schedule No. manually. Mapping is confirmed per BQ record. All bills must be mapped before confirmation is enabled.

Confirmation action:

- `Confirm mapping & generate Cleanse BQ`
- Reprocess mode: `Confirm mapping & reprocess`

Mapping persistence:

`apc.bq-activity-bill-map.v2:<projectId>`

After confirmation, clicking that BQ record opens Cleanse BQ directly.

### 4.6 CE pipeline

CE records are separate from BQ/AS records.

CE target type is option-driven:

- A/C: CE can link only to Activity Schedule
- B/D: CE can link only to BQ

CE import flow:

1. Upload CE document
2. Select target Activity Schedule (A/C) or BQ (B/D)
3. Simulated OCR
4. AI OCR result

CE link stores:

```ts
interface CeLink {
  ceId: string;
  ceCode: string;
  ceName: string;
  title: string;
  amount: number;
  date?: string;
  reference?: string;
  targetType?: 'bq' | 'activity';
  targetId?: string;
  targetCode?: string;
  targetName?: string;
  bqId?: string;     // legacy compatibility
  bqCode?: string;
  bqName?: string;
  itemIds: string[];
}
```

AI OCR result page:

- `Relink` action only (no `Download OCR`)
- Linked target items section under the Compensation Event panel
- Linked target record code/name
- Item, description, unit and allocated amount
- Relink popup lets user select target record and manually select target items
- A/C initial CE link does not auto-select Activity items; user completes item selection through Relink

Amount allocation:

- CE amount is split evenly across linked items.
- Table CE column and Final Amount use the allocated share so the total CE amount is not double-counted.
- CE Detail header labels this as `Allocated Amount (HK$)`.

CE storage:

- `apc.ce-records.v2:<projectId>`
- `apc.ce-links.v2:<projectId>`

### 4.7 Cleanse views

Cleanse BQ / Cleanse Activity Schedule:

- Left bill/schedule sub-navigation with no chevrons
- Sections / schedules are directly clickable
- CE column is present
- BQ row click opens CE Detail
- BQ item row no longer shows a chevron; the CE value indicates the row is expandable
- CE Detail is a compact card with aligned header/cell padding
- Cleanse BQ group rows (for example `Provision of concrete, designed mix`) use black text with a black underline
- Activity item descriptions remain normal and are not underlined
- `Linked documents` popup:
  - BQ page: CE documents + linked Activity Schedule
  - Activity page: CE documents + linked BQ reference records
  - Default Invoice group has been removed

### 4.8 Subletting

A/C only, under `Sub-Contractor`:

- Uses the project Activity Schedule item set
- User can create subcontract packages
- `Create Subletting Contract` top-right action
- Step 1 popup selects the source Activity Schedule using the same document-card/radio/footer format as Link BQ to Activity Schedule
- Step 2 popup maintains the project subcontractor list: unique ID and subcontractor name, with manual Add row and standard-format Excel/CSV import
- After the subcontractor list is confirmed, the page opens the Subletting builder with the full Activity Schedule table grouped by Schedule No.
- Clicking an activity row expands the BQ items previously mapped to the same Schedule No.; A/C BQ items show description, quantity and unit only
- Each Activity row has a subcontractor selector; assigning one subcontractor applies to all BQ items expanded under that activity
- Shift+click supports batch selection across rows; changing one selector applies to all selected rows, then the batch selection is cleared automatically
- Activities already covered by an existing contract remain editable; Save Changes rebuilds the contract allocation from the latest selections and preserves contract codes where the same contract can be updated
- Contracts are grouped by subcontractor when created; contract code: `SUB-2026-001`, `SUB-2026-002`, ...
- Contract table: contract code, subcontractor, activity items, item count, value, created date, delete
- Repeating creation splits the Activity Schedule into multiple contracts
- An item can belong to only one subcontract package at a time

#### Subletting Schedule (BK-CP03.02-FR01)

- Default sub-page of `Subletting`; the `Subletting schedule` / `Contracts` seg control keeps the activity-based builder above available
- Mirrors the template columns A–AG: Item, Sub-Contract Packages, Awarded Sub-Contractor, Tender Budget, Budget Release, Awarded Tender Sum, Saving / (Loss), Target on Board, Subletting by, QS In Charge, Master Programme Rev. (Award / Works Start), Tenderer List Approval → LOA if necessary (Tentative / Actual), Sub-Contract / Work Order No., LOA (Tentative / Issue / Signed (BK)), Sub-Contract / Work Order (Issue / Signed (by BK)), Remarks
- Only `Sub-Contract Packages` and `Tender Budget` are required. Every other column is optional and can be left empty, so a schedule can be started early and completed later
- Cells missing required data are highlighted, and the header/footer report how many packages still need required data
- `Saving / (Loss)` is read-only: Tender Budget − Awarded Tender Sum, shown once both values exist; negative values are shown in red
- Awarded Sub-Contractor accepts free text and offers the project subcontractor list as suggestions, because packages are often not awarded yet
- Edits persist automatically on change

Storage:

`apc.subletting-contracts.v1:<projectId>`
`apc.subletting-schedule.v1:<projectId>`

### 4.9 Pricing mode, number formatting and CE summary

**Pricing mode (per project)**

- The BQ / Activity Schedule import dialog asks whether pricing data is imported: `Import prices` or `Quantity only`
- The choice is stored at `apc.pricing-mode.v1:<projectId>` and broadcast through a `apc:pricing-mode` window event so every page reacts immediately
- `quantity-only` removes every money column from every table: Rate, Amount, Amount (BIM), CE, Final Amount, cost result values, subletting values and the subletting schedule money columns
- Money visibility in the 3D model view also requires the `canViewMoney` permission, i.e. `priced` **and** a non-member role

**Canonical BQ / AS column order** (`src/components/BqPanels.tsx`)

`Item · Description · Unit · Qty · Qty (BIM) · Rate · Amount HK$ · Amount HK$ (BIM) · CE · Final Amount HK$`

When the same measure comes from two sources, the BQ/AS value is always the leading column and the BIM value follows it.

**Number formatting** (`src/lib/numberFormat.ts`)

- Every number printed on a BQ / AS table is a whole number: a fractional part of 0.4 or less truncates down, any other fraction uses normal half-up rounding
- Mapping model / BIM quantity views keep two decimals
- Quantity-only mode leaves quantities untouched and simply drops the money columns

**CE AI OCR result**

- Image uploads are downscaled (max 1200 px, JPEG) and stored on the CE record, so the original document can be shown next to the OCR result
- `regions[]` on the CE record carries `{label, value, x, y, w, h, confidence}` as page percentages; the result screen draws them over the document image for before/after comparison
- Quantity changes are extracted: per-item `qty`, `fields.quantity`, `record.quantity`, and `CeLink.quantity`
- CE home table columns: CE document · CE number · Qty · Amount (money mode only) · Received · Status

**Compensation Event Summary** (`src/views/Preprocessing.tsx`)

- Option A/C preprocessing result page has two second-level tabs: `Activity Schedule` and `Compensation Event Summary`
- The CE summary hides the left schedule list and lists every CE linked to that table (CE No., Description, Date, Reference, linked item count, Net Amount)
- A footer row totals the net amount of all linked CEs; quantities are not shown here

---

## 5. Project-scoped storage

All working data is namespaced by project ID. The project list and active selection are the only global keys.

| Data | Storage key | Scope |
|---|---|---|
| Project list | `apc.projects.v1` | Global |
| Active project | `apc.active-project.v1` | Global |
| Document records | `apc.documents.v3:<projectId>` | Project |
| CE records | `apc.ce-records.v2:<projectId>` | Project |
| CE links | `apc.ce-links.v2:<projectId>` | Project |
| BQ bill ↔ Schedule mapping | `apc.bq-activity-bill-map.v2:<projectId>` | Project |
| Subletting contracts | `apc.subletting-contracts.v1:<projectId>` | Project |
| Pricing mode (import prices / quantity only) | `apc.pricing-mode.v1:<projectId>` | Project |
| Subletting schedule (BK-CP03.02-FR01) | `apc.subletting-schedule.v1:<projectId>` | Project |
| Subcontractor list | `apc.subcontractors.v1:<projectId>` | Project |
| Mapping scenarios | `apc.mapping-scenarios.v2:<projectId>` | Project |
| Scan assets | `apc.scan-assets.v2:<projectId>` | Project |
| Measurement Library edits | `apc.measurement-library.v2:<projectId>` | Project |
| SMM material overrides | `apc.smm-materials.<scenarioId>` | Scenario |

Rules:

- Legacy global keys (`apc.documents.v2`, old CE/mapping/scan keys) are no longer read.
- Switching projects remounts project-sensitive modules and reloads only that project's data.
- Import, update and delete in one project must never appear in another.

---

## 6. Other modules

### 6.1 Measurement Library

- CESMM/HKSMM selector
- 27 SMM sections
- Item detail with measurement groups and editable mapping rows
- Edits are saved per project
- Supply defaults when a project has no saved edits

### 6.2 AI Scanning

- Project-scoped scan asset library
- BIM/IFC import with optional drawings and master programme
- IFC parsing by web-ifc, with STEP fallback
- AI Progress Checking result: BIM + point cloud + optional programme/Gantt
- Assets are stored per project; no global seed data

### 6.3 Mapping Model

- Project-scoped mapping scenarios
- Create dialog follows NEC option and allows the relevant source documents
- Scenario cards, SMM/material mapping result, model review
- No global seed scenarios; each project starts with its own scenarios

### 6.4 eCheck Payment

- Current placeholder page only.
- No payment application/certification workflow implemented yet.

---

## 7. Demo data currently in use

- Activity Schedule: 13 schedules, 24 activity items.
- A/C BQ: Bill No. 3 Site Formation, 4 sections, 12 items from the supplied BQ sample, unpriced.
- B/D BQ: previous demo BQ sections/items.
- CE OCR: simulated fields/items; assessed amount currently demo data.
- IFC/model assets: imported/normalized demo elements where real parsing is unavailable.
- Mapping scenarios and scan assets are empty for a new project.

---

## 8. Known limitations

1. Uploaded PDF/Excel files are not actually parsed in this build; structured BQ tables are demo/sample data.
2. A/C BQ always uses the Site Formation sample; it is not yet driven by the uploaded file's content.
3. Activity Schedule items are demo items; real Excel parsing is not wired.
4. CE OCR fields/items are simulated and not OCR'd from the uploaded file.
5. Subletting creates UI contracts only; it does not generate contract documents.
6. E/F cost and payment pipelines are not complete.
7. `route.md` and older architecture notes contain historical implementation detail; use this file for current architecture decisions.

---

## 9. Key files

| File | Responsibility |
|---|---|
| `src/App.tsx` | Hash routing, projects, active project, module mount keys |
| `src/views/DocumentManagement.tsx` | Document/BQ/AS records, import pipeline, BQ-AS link step, Cleanse routing |
| `src/views/CompensationEventPage.tsx` | CE records, OCR result, relink and linked items |
| `src/views/SublettingPage.tsx` | Subletting schedule and contract views, subcontractor list, Activity Schedule assignment |
| `src/components/SublettingSchedule.tsx` | BK-CP03.02-FR01 schedule table with grouped headers, inline edit, required-field highlighting |
| `src/lib/sublettingSchedule.ts` | Subletting schedule row model, column definitions, saving/loss + totals, project storage |
| `src/lib/pricingMode.ts` | Project pricing mode (`priced` / `quantity-only`), storage and `usePricingMode` hook |
| `src/lib/numberFormat.ts` | BQ/AS whole-number rounding rule, 2dp formatting for mapping model, number parsing |
| `src/lib/subcontractors.ts` | Project-scoped subcontractor list model and storage |
| `src/views/Preprocessing.tsx` | Structured BQ table, BQ-Activity mapping, Cleanse, CE Detail |
| `src/components/FlowTabs.tsx` | Client and Sub-Contractor tab containers |
| `src/components/BqPanels.tsx` | Shared BQ/Activity/Cleanse table, CE column and CE Detail |
| `src/lib/ceLinks.ts` | CE target model, CE links, BQ/Activity item options |
| `src/lib/projectStorage.ts` | Project storage key helpers |
| `src/lib/mappingScenarios.ts` | Mapping Model scenario model/storage |
| `src/lib/scanAssets.ts` | AI Scanning asset model/storage |
| `src/views/MeasurementLibrary.tsx` | SMM library and per-project edits |
| `src/views/BimMapping.tsx` / `ModelView.tsx` | Mapping Model and model review |
| `src/views/AiScanning.tsx` | AI Scanning library and progress result |
