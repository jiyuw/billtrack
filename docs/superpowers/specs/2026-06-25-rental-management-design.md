# Rental Management Design

Date: 2026-06-25
Project: BillTrack
Status: Draft for review

## Goal

Add an optional rental management workflow to BillTrack that can be enabled from Settings.

When enabled:
- A new `Rental Management` page appears in the app navigation.
- Users can mark specific assets as rental assets.
- For each rental asset, users can choose which bills should be charged through to tenants.
- For each chargeable bill, users can see the most recent five payments and whether each payment has been notified to the tenant.

Out of scope for this feature:
- Tracking whether the tenant paid
- Tenant records, leases, units, invoices, or rent ledgers
- Email, SMS, or other outbound notification delivery
- Reminder scheduling or audit history beyond a single yes/no notify state per payment

## User Experience

### Settings

Add a new toggle in Settings:
- Label: `Enable rental management`
- Behavior: toggles the rental feature on or off for the current BillTrack instance

When disabled:
- The rental management page is hidden from navigation
- Existing rental-related data remains stored
- No rental management UI is shown outside of Settings

When enabled:
- The rental management page is shown in desktop and mobile navigation

### Rental Management Page

Add a new route: `/rentals`

Primary page flow:
1. User selects one asset tag to manage
2. User can mark that asset as a rental asset
3. User sees all bills assigned to that asset
4. User can choose which of those bills should be charged to the tenant
5. For bills marked as chargeable, user sees the latest five payments with notify state
6. User can toggle each payment between `Not notified` and `Notified`

Page sections:

#### 1. Asset selector

- Show asset tags in a selector at the top of the page
- Only asset tags are used as assets; no new asset table is introduced
- If there are no asset tags, show an empty state that directs the user to Settings to create one

#### 2. Rental asset settings

For the selected asset:
- Show whether it is marked as a rental asset
- Allow the user to toggle rental status on or off

If the asset is not marked as rental:
- Hide the bill-charge configuration and payment notify list
- Show helper text explaining that bills can only be charged to tenants for rental assets

#### 3. Chargeable bills list

For a selected rental asset:
- Show all bills where `bill.assetTagId` matches the selected asset
- Each bill gets a checkbox or switch: `Charge tenant for this bill`
- This flag only controls whether the bill appears in rental tracking; it does not affect the normal bill/payment flow

#### 4. Recent payments list

For each bill marked chargeable:
- Show the most recent five payments for that bill
- Show payment date
- Show amount
- Show cycle label if helpful for recurring bills
- Show notify status as a simple yes/no state
- Allow toggling notify state inline

Suggested empty states:
- No bills on this asset
- No bills marked chargeable
- No payments yet for this bill

## Recommended Technical Approach

Use the existing domain model and add a thin rental overlay:
- `userPreferences` stores whether the feature is enabled
- `assetTags` stores whether an asset is a rental asset
- `bills` stores whether the bill should be charged to the tenant
- A new rental-specific table stores notify state per payment

This keeps the feature aligned with the current codebase:
- Assets already map to `assetTags`
- Bills already belong to an asset through `assetTagId`
- Payments already exist as first-class records
- Preferences and navigation already support feature-style toggles

This is preferred over:
- Building a full rental subdomain, which is too large for the requested scope
- Storing notify state directly on `bill_payments`, which would mix rental-only concerns into the base payment record

## Data Model Changes

### 1. `user_preferences`

Add:
- `rental_management_enabled` boolean not null default `false`

Purpose:
- Controls whether the feature is enabled and whether navigation shows the rental page

### 2. `asset_tags`

Add:
- `is_rental` boolean not null default `false`

Purpose:
- Marks an existing asset tag as representing a rental asset

### 3. `bills`

Add:
- `charge_to_tenant` boolean not null default `false`

Purpose:
- Marks whether the bill should appear in rental charge tracking for its assigned asset

Behavior note:
- This flag is meaningful only when the bill is attached to an asset tag
- If the bill has no `assetTagId`, the flag may still be stored as `false`, but the UI should not offer rental charging outside an asset context

### 4. New table: `rental_payment_notifications`

Columns:
- `id` primary key
- `payment_id` foreign key to `bill_payments.id`, unique
- `is_notified` boolean not null default `false`
- `created_at`
- `updated_at`

Purpose:
- Stores whether a specific payment has been notified to the tenant

Why a separate table:
- Keeps rental-specific state out of generic payment records
- Allows future expansion later without reshaping `bill_payments`
- Avoids forcing every payment in the system to carry rental-only fields

Constraint:
- One row per payment

## Server-Side Changes

### Preferences API

Extend `GET /api/preferences` and `PUT /api/preferences` to read and write:
- `rentalManagementEnabled`

### Asset tag APIs

Extend asset tag create/update payloads to support:
- `isRental`

This does not need to be exposed in the main Settings asset-tag editor immediately if the rental page owns this workflow, but the server model should support it.

### Bill APIs

Extend bill create/update payloads and query mappings to support:
- `chargeToTenant`

For the first implementation, the main bill form does not need to expose this field. The rental page can own the edit flow for this flag.

### New rental APIs

Add focused rental endpoints rather than overloading unrelated pages.

Suggested endpoints:

- `GET /api/rentals/assets`
  - Returns asset tags plus rental state and summary counts

- `PATCH /api/rentals/assets/[id]`
  - Updates `isRental`

- `GET /api/rentals/assets/[id]`
  - Returns:
    - selected asset tag
    - bills on that asset
    - bill `chargeToTenant` state
    - latest five payments per chargeable bill
    - notify state for each payment

- `PATCH /api/rentals/bills/[id]`
  - Updates `chargeToTenant`
  - Should validate that the bill belongs to an asset tag

- `PATCH /api/rentals/payments/[id]/notification`
  - Updates notify state for a payment
  - Payload: `{ isNotified: boolean }`

## Query Layer Changes

Add rental-focused query helpers to keep route handlers thin.

Suggested query responsibilities:
- Fetch rental-enabled preference
- Fetch all asset tags with rental state
- Fetch bills for an asset tag
- Fetch latest five payments for a bill
- Join payment notify status from `rental_payment_notifications`
- Upsert notify state for a payment

Recommendation:
- Keep these in a focused query module such as `src/lib/server/db/rental-queries.ts`
- Do not overload existing bill query functions with rental-only shaping unless reuse is clearly beneficial

## UI Structure

### Navigation

Update both nav components so `Rental Management` appears only when the preference is enabled:
- Desktop nav
- Mobile nav

The layout server load should include the preference so navigation can render consistently on first load.

### Settings Page

Add a new settings section:
- Group: likely alongside other app-level behavior toggles
- Control: `Enable rental management`
- Persist through the preferences API

### Rentals Page

Suggested layout:

#### Header
- Title: `Rental Management`
- Short helper text about charging bills through to tenants

#### Left/top panel: assets
- Asset selector list or dropdown
- Rental badge or switch for the selected asset

#### Main panel: bills and payments
- Chargeable bills list first
- Payments list grouped under each selected chargeable bill

Because the current app already supports mobile layouts, this page should stack cleanly on small screens:
- Asset selector first
- Bill list second
- Payment cards beneath each bill

## Data Flow

### Enabling feature
1. User toggles rental management on in Settings
2. Preferences API stores `rentalManagementEnabled = true`
3. Layout data includes the updated preference
4. Navigation shows `/rentals`

### Marking an asset as rental
1. User selects an asset on `/rentals`
2. User toggles `isRental`
3. Rental asset API updates the asset tag
4. Page refreshes or locally updates state

### Marking a bill as chargeable
1. User enables `Charge tenant for this bill`
2. Rental bill API updates `chargeToTenant`
3. Bill enters the payment tracking section

### Marking a payment as notified
1. User toggles a payment to `Notified`
2. Rental notification API upserts the row in `rental_payment_notifications`
3. UI reflects the updated yes/no state immediately

## Validation Rules

- Rental page should only allow asset selection from existing asset tags
- Bills can only be configured through the rental page if they belong to the selected asset
- `chargeToTenant` should only be set for bills with a non-null `assetTagId`
- Payment notification updates should only be allowed for payments that belong to a bill marked `chargeToTenant = true`

If validation fails:
- Return a 400 response with a clear message
- Keep the UI state unchanged and show a user-friendly error

## Migration and Backfill

Migration should:
- Add `rental_management_enabled` to `user_preferences` with default `false`
- Add `is_rental` to `asset_tags` with default `false`
- Add `charge_to_tenant` to `bills` with default `false`
- Create `rental_payment_notifications`

Backfill behavior:
- Existing data remains untouched from a user perspective
- Feature stays off by default
- No asset is rental by default
- No bill is chargeable by default
- No payment is notified by default

## Testing Strategy

### Database and query tests

Add tests for:
- Preference toggle persistence
- Asset rental flag persistence
- Bill charge flag persistence
- Payment notification upsert and retrieval
- Latest-five-payment selection logic

### API tests

Add tests for:
- Enabling and disabling rental management
- Updating rental asset state
- Updating chargeable bill state
- Updating payment notify state
- Rejecting invalid asset/bill/payment combinations

### UI tests

Add coverage for:
- Navigation visibility when rental management is enabled or disabled
- Rentals page empty states
- Toggling rental asset state
- Toggling chargeable bill state
- Toggling payment notified state

## Implementation Phases

### Phase 1: Data and APIs
- Add schema changes and migrations
- Extend preferences support
- Add rental query helpers
- Add rental APIs

### Phase 2: Settings and navigation
- Add settings toggle
- Flow preference through layout data
- Show/hide navigation item

### Phase 3: Rentals page
- Add `/rentals` route
- Build asset selector
- Add rental asset toggle
- Add chargeable bill controls
- Add recent payment notify list

### Phase 4: Polish
- Empty states
- Loading states
- Error messaging
- Minor UI cleanup

## Risks and Decisions

### Decision: keep asset model as `assetTags`

This is the right tradeoff for now because the app already uses asset tags as the user-facing asset concept.

Risk:
- The name `assetTags` is broader and less domain-specific than `assets`

Mitigation:
- Keep UI language user-facing as `asset`
- Keep internal storage as `assetTags` to minimize churn

### Decision: separate notification table

This is the right tradeoff for now because the feature only needs one rental-specific attribute today, but may grow later.

Risk:
- Slightly more query complexity

Mitigation:
- Hide this behind rental query helpers and keep API payloads simple

## Open Questions

No blocking open questions remain for the initial implementation scope.

The feature is defined as:
- optional
- asset-based
- bill-configurable
- payment-notify-only

That scope is small enough to plan and implement directly.
