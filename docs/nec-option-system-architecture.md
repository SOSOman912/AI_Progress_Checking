# NEC Option System Architecture

Status: Draft for review  
Date: 25 November 2026  
Scope: Pricing document strategy across all five product modules

## 1. Purpose

This document defines how the five modules should behave for each NEC contract option, with particular focus on:

- which document is the **main pricing document**
- how that document drives measurement, compensation events (CE), progress valuation and payment
- how BIM-to-SMM mapping connects to the main pricing document
- what is implemented today and what is still missing

The goal is to use this as the reference for reviewing the current design and approving the next implementation phases.

## 2. NEC Option Matrix

| NEC option | Contract type | Main pricing document | Supporting documents | Primary quantity / value source |
|---|---|---|---|---|
| A | Priced contract with activity schedule | **Activity Schedule** | Programme, CE, invoices | Activity schedule items |
| B | Priced contract with bill of quantities | **Bill of Quantities** | CE, invoices | BQ items |
| C | Target cost contract with activity schedule | **Activity Schedule** | Programme, CE, invoices, target cost data | Activity schedule items |
| D | Target cost contract with bill of quantities | **Bill of Quantities** | CE, invoices, target cost data | BQ items |
| E | Cost reimbursable contract | **Cost records** | Invoices, CE, actual cost records | Actual cost / invoices |
| F | Management contract | **Activity Schedule + cost records** (assumption to confirm) | Subcontract packages, CE, invoices | Management activities + subcontract cost |

Notes:

- A/C and B/D are the clear cases requested by the business: activity schedule for A/C, BQ for B/D.
- E is cost-based. A BQ or activity schedule may still be used for measurement support, but it is not the contractual pricing basis.
- F is the open decision. The current architecture assumes management activities are priced through an activity schedule, with subcontract cost records as the cost basis. This must be confirmed before implementation.

## 3. Module Responsibilities

| Module | Responsibility | Main data |
|---|---|---|
| Document Management | Import, cleanse and link the pricing document, CE and invoices | BQ or Activity Schedule, CE records, invoices |
| Measurement Library | Define SMM library items and measurement rules | SMM item, rule, unit, mapping |
| AI Scanning | Progress checking from BIM, point cloud and master programme | BIM elements, point cloud, programme activities |
| Mapping Model | Map BIM material attributes to SMM library, then to the project pricing items; model review | BIM model, SMM library, pricing document, mapping result |
| eCheck Payment | Payment application, certification and valuation output | Certified quantities, CE, invoice, main pricing document |

## 4. End-to-End Pipelines

### 4.1 Option A / C — Activity Schedule as main pricing document

```
Create Project (NEC A/C)
  -> Document Management
       Activity Schedule import
       Cleanse / validate activity schedule
       CE import + link to Activity Schedule items
       Invoice import
  -> Measurement Library
       SMM library + measurement rules
  -> Mapping Model
       Create Mapping Model
       Select BIM model + Activity Schedule
       BIM material attribute -> SMM library -> Activity Schedule item
       Review mapping result
  -> AI Scanning
       BIM + point cloud + master programme
       Progress by activity / element
  -> Model Review
       BIM + BQ-style review + progress
  -> eCheck Payment
       Value progress against Activity Schedule
       Apply certified quantities, CE and invoices
```

**Critical rule:** the Activity Schedule is the only main pricing reference. A BQ may be attached as supporting information, but it must not drive valuation.

### 4.2 Option B / D — Bill of Quantities as main pricing document

```
Create Project (NEC B/D)
  -> Document Management
       BQ import
       Cleanse BQ
       CE import + link to BQ items
       Invoice import
  -> Measurement Library
       SMM library + measurement rules
  -> Mapping Model
       Create Mapping Model
       Select BIM model + BQ
       BIM material attribute -> SMM library -> BQ item
       Review mapping result
  -> AI Scanning
       BIM + point cloud + master programme
       Progress by element / activity
  -> Model Review
       BIM + BQ table + progress
  -> eCheck Payment
       Value progress against BQ quantities and rates
```

**Critical rule:** the BQ is the only main pricing reference. Activity Schedule may support planning but must not replace BQ items for valuation.

### 4.3 Option E — Cost reimbursable

```
Create Project (NEC E)
  -> Document Management
       Cost records / invoices / CE import
       Optional BQ or activity schedule for measurement support
  -> AI Scanning
       BIM + point cloud + programme for progress
  -> Mapping Model
       BIM -> SMM library -> measured quantities (support only)
  -> eCheck Payment
       Actual cost + fee / CE / invoice reconciliation
```

**Critical rule:** there is no BQ or activity schedule price basis. The main reference is the actual cost record, invoice and CE.

### 4.4 Option F — Management contract

Current assumption:

```
Create Project (NEC F)
  -> Document Management
       Activity Schedule for management activities
       Subcontract packages / cost records
       CE and invoices
  -> Mapping Model
       BIM + Activity Schedule
  -> AI Scanning
       BIM + point cloud + programme
  -> eCheck Payment
       Management activity value + subcontract cost
```

Decision required: confirm whether Option F uses an Activity Schedule as the main pricing document, or whether cost records alone should be the primary basis.

## 5. Target Data Model

### 5.1 Project context

```ts
ProjectRecord {
  id
  name
  number
  standard
  necOption: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
}
```

Derived configuration:

```ts
mainPricingDoc =
  A, C -> 'activity'
  B, D -> 'bq'
  E    -> 'cost'
  F    -> 'activity-cost' // to confirm
```

### 5.2 Generic pricing document

The system should stop treating BQ as the universal pricing document.

```ts
PricingDocument =
  | { kind: 'bq'; id; code; name; items: BqItem[] }
  | { kind: 'activity'; id; code; name; items: ActivityItem[] }
  | { kind: 'cost'; id; code; name; costRecords: CostRecord[] }
```

Shared item contract:

```ts
PricingItem {
  id
  code
  description
  unit
  quantity
  rate?
  amount?
}
```

This allows Cleanse, CE linking, Mapping Model and eCheck Payment to work against one interface instead of BQ-only code.

### 5.3 CE link

```ts
CeLink {
  ceId
  pricingDocumentId
  pricingDocumentKind: 'bq' | 'activity' | 'cost'
  itemIds: string[]
  amount
  date
  reference
}
```

Current implementation links CE to BQ records only. This must become generic.

### 5.4 Mapping result

```ts
MappingRow {
  elementId
  materialAttribute
  smmLibraryItem
  pricingItemId
  pricingItemLabel
  qty
  status: 'mapped' | 'unmapped'
}
```

`pricingItemLabel` should be a BQ item for B/D and an Activity Schedule item for A/C.

## 6. Current Implementation Review

### 6.1 What is implemented

- Create Project now captures NEC Option A–F and stores it on the project record.
- Seed projects carry options (Tank A, RC Frame D, Drainage B).
- Project list shows the NEC option and its main pricing document.
- Mapping Model home is merged with Model; five modules remain.
- Create a Mapping Model accepts BIM + BQ/Activity and now marks/requires the main pricing document for A–D when the active project has an NEC option.
- Mapping result supports material editing, SMM library bridge, BQ matching, mapped/unmapped 3D colours and batch material edit.
- Card click opens model review; card `···` / right-click Edit opens the SMM mapping result.
- AI Scanning imports BIM, drawings and optional master programme; no BQ/cost tabs.
- CE import links to a BQ record; Cleanse BQ has CE column and linked documents panel.
- The Activity Schedule tab is enabled as the A/C main pricing document with its own AS records, import cards, result and Cleanse headings. Its Cleanse table now uses Activity Schedule data (Schedule No. 1–13 sample) with the same bill/schedule sub-navigation as BQ. A CSV demo is available at `/demo/activity-schedule-demo.csv`.
- The Activity preprocessing dashboard is restored. Current SMM configuration reads the project standard (HKSMM4/CESMM), Uploaded document package lists only imported files (AS + SP + PP or BQ + SP + PP), and Missing items report is empty when no preambles were imported.
- Importing multiple BQ files creates one record per BQ file, each with its own record ID; shared preambles are attached to each record.
- All persisted working data is scoped by active project: documents (`apc.documents.v3:<projectId>`), CE records (`apc.ce-records.v2:<projectId>`), CE links (`apc.ce-links.v2:<projectId>`), mapping scenarios (`apc.mapping-scenarios.v2:<projectId>`), scan assets (`apc.scan-assets.v2:<projectId>`), Measurement Library rows (`apc.measurement-library.v2:<projectId>`) and BQ-Activity mappings (`apc.bq-activity-bill-map.v2:<projectId>`). Switching projects remounts each module and loads only that project's records.
- The Missing items report uses a compact 3-column layout that fits the narrow dashboard, with no horizontal crop; the empty state is centred horizontally and vertically.
- Record tables no longer use selection checkboxes or the bulk action bar; clicking a row opens the record.
- The Cleanse bill/schedule sub-navigation follows the Measurement Library section-nav style: header count, chevron rows, section number/name and item count.
- All BQ preprocessing pages use a structured BQ table (Item, Description, Unit, Qty, Rate, Amount) grouped by the selected extracted Bill; each BQ section header also shows its mapped SMM library section. For A/C the left list shows BQ bills with Mapped/Unmapped status, the centre shows the selected bill's table, and the right panel contains only an editable Linked Activity Schedule dropdown plus confirmation. Mappings are stored per project/BQ record in `apc.bq-activity-bill-map.v2`; B/D keeps the standard dashboard with the same structured table.
- In A/C, a BQ reference import adds a Link BQ to Activity Schedule step before processing; the record stores the linked AS and shows it on the BQ mapping page and in the Cleanse Linked documents popup. The popup no longer shows a default Invoice and now includes the linked Activity Schedule.
- The CE Relink popup filters Activity Schedule items by the selected AS record item set. Bill/section sub-navigation rows no longer show chevrons, and the CE paper no longer shows the AI OCR stamp.
- The A/C BQ reference demo now uses the supplied BQ for RW RC structure (2).pdf sample: Bill No. 3 — Site Formation with Sections 7 Earthworks, 10 Formwork, 11 Steel Reinforcement and 12 Concrete. The same 12 items and quantities flow through the structured mapping table and Cleanse BQ. Rates are blank in the source, so Rate/Amount show as unpriced.
- A/C projects show a second Sub-Contractor tab group beside Client, containing a Subletting page. The page uses the linked Activity Schedule items, lets the user enter a subcontractor in charge and select Activity items to split into subcontract packages, and its top-right action is Create Subletting Contract. Contracts are stored per project in pc.subletting-contracts.v1:<projectId>.
- CE linking follows the main pricing document: A/C CE can link only to an Activity Schedule record; B/D CE links to a BQ record. The CE AI OCR result shows linked target items under the Compensation event panel, and Relink opens a popup for manual target/item selection. The CE amount is split evenly across the linked items so it is not double-counted in the Cleanse CE column.
- The Schedule of Rate tab has been removed from the Document Management top nav. CE Detail and AI OCR extracted-item tables use compact column spacing.
- CE view keeps the A/C Activity-first tab order by receiving the project NEC option; it no longer drops Activity when CE is selected.
- A/C preprocessing no longer shows the Missing items report. B/D keeps the report.
- The pricing processing animation runs for 3 seconds for both BQ and Activity Schedule. The PP-vs-SP comparison step is shown only when both preamble documents were imported; otherwise it is omitted and the completion count reflects the available checks.
- Pricing document import now has three types (main schedule, SP, PP); Drawing has been removed from the current-stage workflow.
- The BQ table places CE immediately after Rate, keeps original Amount columns unchanged, and adds a Final Amount HK$ column. CE uses the same plain numeric cell style as Rate; clicking the BQ row expands the detail. CE value is the signed sum of the assessed values of linked CEs; no linked CE means no CE amount. The Final Amount HK$ (BIM) column was removed across the BQ, Activity Schedule and model pages.
- BQ Details now includes section 3 “BQ amount changes with CE applied” with original, net CE and final BQ/BIM amounts plus the linked CE rows.
- The pricing processing ring now uses the same black/white ring as AI Progress Checking.
- Document Management orders its top flow tabs by NEC option. A/C show Activity Schedule first, Bill of Quantity as supporting reference second, Compensation Event third and Schedule of Rate fourth; B/D show Bill of Quantity, Compensation Event and Schedule of Rate. The main document is selected by default and BQ is never required for an Activity Schedule import. SP/PP remain optional.
- BQ and Activity Schedule both have a bill/section sub-navigation list. BQ uses its sections; Activity Schedule uses Schedule No. 1–13 as separate master sections, with item counts and filtering.
- The Activity Schedule preprocessing result hides the SMM dashboard and its missing-item report, with the confirmation action moved to the centre pane.
- Measurement Library has a top-right Save changes action that persists edited mapping settings in `apc.measurement-library.v1`.
- The AI Scanning library no longer has standalone Drawings or Point clouds tabs. The IFC import has four steps: IFC model, optional drawings, optional master programme and optional point cloud.
- The AI Progress Checking table no longer shows mapping data: Material attribute, SMM library item, BQ/Activity item, Status, Issue and Action are removed.
- The project standard is a project-wise setting and is no longer shown on mapping model cards or result headers; the create dialog no longer offers a per-model Standard.
- In the model review page, clicking a BQ/Activity row does not expand CE details; CE information lives in the Details panel, and clicking a CE row opens a draggable CE PDF popup.

### 6.2 Gaps against the NEC architecture

| # | Requirement | Current status | Risk |
|---|---|---|---|
| 1 | Document Management should treat Activity Schedule as a first-class pricing document for A/C | Activity Schedule is now A/C tab 1 with its own AS records, schedule data and bill/schedule sub-nav; BQ is a separate supporting reference tab. Actual Excel parsing is still demo data | Medium |
| 2 | Cleanse view should be generic (BQ or Activity Schedule) | Cleanse Activity Schedule now uses Activity Schedule lines and Schedule No. 1–13; CE links are still BQ-record based | Medium |
| 3 | CE should link to the main pricing document | CE picker loads BQ records only | High |
| 4 | Mapping result should show Activity item for A/C | Mapping table always shows `BQ item`; matching uses hardcoded BQ items | High |
| 5 | AI Scanning / Model Review should value against option-specific items | AI Scanning shows SMM/BQ columns; no option-aware valuation | Medium |
| 6 | NEC option should be available across all modules | Option is captured and passed to Mapping Model; Document Management/AI Scanning/eCheck do not consume it yet | High |
| 7 | Option E cost basis | No cost-record valuation pipeline | High |
| 8 | Option F pricing basis | Assumption only; not confirmed | High |
| 9 | eCheck Payment | Stub only | High |
| 10 | Persistence | Project/mapping/CE data are localStorage demos; no backend | Medium |

### 6.3 Requirement fit summary

| Requirement | Fit |
|---|---|
| Create project with NEC A–F | Implemented |
| A/C main pricing = Activity Schedule | Project config and Mapping create enforce it; Activity tab UI mirrors BQ; downstream valuation/data still BQ-based |
| B/D main pricing = BQ | Implemented in Mapping create; BQ downstream already exists |
| Single system architecture across modules | Partially; modules are still BQ-centric |
| Five modules | Implemented |
| Edit mapping from card | Implemented |
| Model review from card | Implemented |

## 7. Proposed Target Architecture

```
                    Project (NEC Option)
                           |
                    mainPricingDoc
             /-------------+-------------\
          BQ (B/D)                  Activity (A/C)
             |                          |
        Document Mgmt              Document Mgmt
        Cleanse BQ                 Cleanse Activity
             |                          |
        CE / Invoice               CE / Invoice
             \-------------+-------------/
                           |
                    Mapping Model
          BIM material -> SMM library -> Pricing item
                           |
                      AI Scanning
             BIM + point cloud + programme
                           |
                     Model Review
                           |
                    eCheck Payment
```

Key changes:

1. **Introduce ProjectContext** with `necOption` and `mainPricingDoc`, consumed by all modules.
2. **Replace BQ-only types** with a generic `PricingDocument` / `PricingItem`.
3. **Make Cleanse and CE link generic** so A/C uses Activity Schedule items.
4. **Make Mapping Model option-aware**:
   - B/D: SMM library -> BQ item.
   - A/C: SMM library -> Activity Schedule item.
   - E: measurements support cost; no contractual BQ/activity valuation.
   - F: confirm model before implementation.
5. **Value progress in eCheck** against the main pricing document, not always BQ.
6. **Persist project option and document links** beyond localStorage when backend is ready.

## 8. Recommended Implementation Phases

| Phase | Scope | Outcome |
|---|---|---|
| 1 | Project NEC option + Mapping Model main-document rule | Completed in current build |
| 2 | Generic PricingDocument / PricingItem types; CE link to document kind | Removes BQ-only assumptions |
| 3 | Activity Schedule import + Cleanse Activity view | A/C becomes usable end to end |
| 4 | Mapping result Activity item column and activity matching | BIM -> SMM -> Activity item |
| 5 | AI Scanning / Model Review option-aware valuation | Correct quantities and progress |
| 6 | eCheck Payment from main pricing document | Payment application per option |
| 7 | Option E/F cost model | Cost reimbursable and management contract |

## 9. Decisions Required From Business Review

1. Confirm Option F main pricing basis: Activity Schedule + cost records, or cost records only?
2. For Option E, should BQ/activity schedule be available as supporting measurement only?
3. Should A/C allow a BQ to be attached at all, or only as reference?
4. Should CE be allowed to link to multiple pricing documents, or exactly one main document per project?
5. For A/C, is the Activity Schedule item the valuation unit, or is activity progress converted to a separate valuation schedule?
6. Should eCheck Payment certify against the main pricing document only?
7. Which document is authoritative when both BQ and Activity Schedule exist (e.g. Option F)?

## 10. Review Checklist

- [ ] NEC option matrix matches the contract administration policy.
- [ ] A/C main pricing document confirmed as Activity Schedule.
- [ ] B/D main pricing document confirmed as BQ.
- [ ] E and F main pricing basis confirmed.
- [ ] Module boundaries and hand-offs approved.
- [ ] Generic pricing document model approved.
- [ ] CE link scope approved.
- [ ] eCheck valuation basis approved.
- [ ] Phase plan and priority approved.
