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
- For each chargeable bill, users can see the most recent five payments, whether each payment has been notified to the tenant, and on which date that notification happened.

Out of scope for this feature:
- Tracking whether the tenant paid
- Tenant records, leases, units, invoices, or rent ledgers
- Email, SMS, or other outbound notification delivery
- Reminder scheduling or multi-event notification history per payment

## User Experience

### Settings

Add a new toggle in Settings:
- Label: `Enable rental management`
- Behavior: toggles the rental feature on or off for the current BillTrack instance

Update the existing asset management area in Settings so each asset can also be marked as rental:
- Add an `Is rental` control to the asset create/edit flow
- This becomes the primary place to define whether an asset participates in rental management

When disabled:
- The rental management page is hidden from navigation
- Existing rental-related data remains stored
- No rental management UI is shown outside of Settings

When enabled:
- The rental management page is shown in desktop and mobile navigation

### Rental Management Page

Add a new route: `/rentals`

Primary page flow:
1. User lands on a list of rental assets
2. User selects one rental asset to manage
3. User sees all bills assigned to that asset that are marked `Charge to tenant`
4. For those bills, user sees the latest five payments with notify state
5. User can mark a payment as notified and set the notify date
6. User can clear the notify state if needed

Page sections:

#### 1. Asset selector

- Show rental assets grouped together in the page
- Only asset tags are used as assets; no new asset table is introduced
- Only asset tags with `isRental = true` appear on this page
- If there are no rental assets, show an empty state that directs the user to Settings to mark an asset as rental

#### 2. Chargeable bills and recent payments

For a selected rental asset:
- Show bills where `bill.assetTagId` matches the selected asset and `bill.chargeToTenant = true`
- These bills are configured from the normal bill create/edit flow, not from the rental page itself

For each chargeable bill:
- Show the most recent five payments for that bill
- Show payment date
- Show amount
- Show cycle label if helpful for recurring bills
- Show notify status as a simple yes/no state
- Show notify date when notified
- Allow toggling notify state inline
- Allow choosing the notify date inline when a payment is marked notified

Suggested empty states:
- No bills on this asset
- No bills marked chargeable
- No payments yet for this bill

## Recommended Technical Approach

Use the existing domain model and add a thin rental overlay:
- `userPreferences` stores whether the feature is enabled
- `assetTags` stores whether an asset is a rental asset
- `bills` stores whether the bill should be charged to the tenant
- A new rental-specific table stores notify state and notify date per payment

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
- The bill create/edit form should only show this option when the selected asset is marked rental
- If the bill has no `assetTagId`, the flag should remain `false`

### 4. New table: `rental_payment_notifications`

Columns:
- `id` primary key
- `payment_id` foreign key to `bill_payments.id`, unique
- `is_notified` boolean not null default `false`
- `notified_on` date nullable
- `created_at`
- `updated_at`

Purpose:
- Stores whether a specific payment has been notified to the tenant and, if so, on which date

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

This should be exposed in the Settings asset create/edit UI because Settings is the primary place to declare rental assets.

### Bill APIs

Extend bill create/update payloads and query mappings to support:
- `chargeToTenant`

This should be exposed in the main bill create/edit form, but only when the selected asset is marked rental.

### New rental APIs

Add focused rental endpoints rather than overloading unrelated pages.

Suggested endpoints:

- `GET /api/rentals/assets`
  - Returns rental asset tags plus summary counts

- `GET /api/rentals/assets/[id]`
  - Returns:
    - selected asset tag
    - chargeable bills on that asset
    - latest five payments per chargeable bill
    - notify state and notify date for each payment

- `PATCH /api/rentals/payments/[id]/notification`
  - Updates notify state for a payment
  - Payload: `{ isNotified: boolean, notifiedOn?: string | null }`

## Query Layer Changes

Add rental-focused query helpers to keep route handlers thin.

Suggested query responsibilities:
- Fetch rental-enabled preference
- Fetch rental asset tags
- Fetch chargeable bills for an asset tag
- Fetch latest five payments for a bill
- Join payment notify state from `rental_payment_notifications`
- Upsert notify state and notify date for a payment

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

Update the existing asset tag add/edit modal:
- Add `Is rental` control
- Persist through asset tag APIs

### Rentals Page

Suggested layout:

#### Header
- Title: `Rental Management`
- Short helper text about charging bills through to tenants

#### Left/top panel: assets
- Rental asset selector list or dropdown

#### Main panel: bills and payments
- Chargeable bills grouped under the selected rental asset
- Payments list grouped under each chargeable bill
- Inline notify controls including notify date

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
1. User opens asset create/edit in Settings
2. User toggles `isRental`
3. Asset tag API updates the asset tag
4. Rental page includes or excludes that asset accordingly

### Marking a bill as chargeable
1. User opens bill create/edit
2. User selects a rental asset
3. Bill form reveals `Charge tenant for this bill`
4. Bill API updates `chargeToTenant`
5. Bill appears in rental tracking for that asset

### Marking a payment as notified
1. User toggles a payment to `Notified`
2. User chooses a notify date
3. Rental notification API upserts the row in `rental_payment_notifications`
4. UI reflects the updated state and date immediately

## Validation Rules

- Rental page should only allow asset selection from existing asset tags
- Rental page should only show assets with `isRental = true`
- `chargeToTenant` should only be set for bills whose selected `assetTagId` is a rental asset
- Payment notification updates should only be allowed for payments that belong to a bill marked `chargeToTenant = true`
- If `isNotified = true`, `notifiedOn` is required
- If `isNotified = false`, `notifiedOn` should be stored as `null`

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
- Notify date validation and persistence
- Latest-five-payment selection logic

### API tests

Add tests for:
- Enabling and disabling rental management
- Updating rental asset state through asset settings
- Updating chargeable bill state through bill APIs
- Updating payment notify state
- Updating payment notify date
- Rejecting invalid asset/bill/payment combinations

### UI tests

Add coverage for:
- Navigation visibility when rental management is enabled or disabled
- Settings asset modal rental toggle
- Bill form `chargeToTenant` visibility and persistence for rental assets
- Rentals page empty states
- Toggling payment notified state
- Setting and clearing notify date

## Implementation Phases

### Phase 1: Data and APIs
- Add schema changes and migrations
- Extend preferences support
- Add rental query helpers
- Add rental APIs

### Phase 2: Settings and navigation
- Add settings toggle
- Add `isRental` to asset create/edit UI
- Flow preference through layout data
- Show/hide navigation item

### Phase 3: Rentals page
- Add `/rentals` route
- Build rental asset selector
- Add grouped chargeable bill list
- Add recent payment notify list with notify date

### Phase 3.5: Bill form integration
- Add `chargeToTenant` to bill create/edit form
- Reveal it only when the selected asset is rental
- Persist through existing bill save flows

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
- bill-configurable through normal bill forms
- payment-notify tracking with a single notify date

That scope is small enough to plan and implement directly.
