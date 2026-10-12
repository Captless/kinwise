# Implementation Plan: Family Medication & Health Monitor PWA

## 1. Objective

Build a private, mobile-first Progressive Web App (PWA) for my family to manage medication reminders and manually record health measurements for two grandparents.

The application must work across multiple iPhones, allowing family members to manage medication schedules and grandparents to view schedules, confirm medication activity, and record pulse oximeter readings.

This is a private family project, not a commercial product.

**Primary goals:**
- Reliable server-triggered medication reminder notifications.
- Simple medication and schedule management.
- Fast manual SpO₂ and pulse recording.
- Shared records across authorized devices.
- Accessible, senior-friendly mobile UI.
- Minimal infrastructure and maintenance.

## 2. Fixed Requirements

- Target iPhone and iOS Safari only for the initial release.
- Deploy the PWA through Cloudflare Pages.
- Use Cloudflare D1 for persistent shared records.
- Use Cloudflare Workers for the API and scheduled notification processing.
- Use Web Push for background medication reminders.
- No individual account creation, email registration, or per-person login.
- Use two distinct grandparent profiles.
- Allow family members to manage schedules and records from authorized devices.
- Manual oximeter entry only; no Bluetooth integration.
- No AI, diagnosis, treatment recommendations, or automatic dosage suggestions.
- No unnecessary analytics, commercial features, or third-party healthcare integrations.

## 3. Repository and Implementation Rules

Before making changes:

1. Inspect the existing repository, `AGENTS.md`, package configuration, documentation, and current deployment setup.
2. Reuse existing conventions and dependencies where appropriate.
3. Identify the current architecture before choosing file paths or introducing new components.
4. Produce a concise implementation plan based on the actual repository, then execute it in small, verifiable phases.
5. Do not duplicate existing functionality, create unnecessary abstractions, or replace working infrastructure without justification.
6. Keep secrets out of client-side code, source control, and public environment variables.
7. Run the relevant tests, type checks, production build, and deployment checks after implementation.
8. Do not claim that notifications work until they have been tested on a real iPhone.

If an existing project is available, its actual architecture takes precedence over assumptions in this document.

## 4. Architecture

Use the smallest architecture that supports shared records and server-triggered notifications.

- **Frontend:** React, TypeScript, Vite, and a PWA plugin.
- **Hosting:** Cloudflare Pages.
- **API:** Cloudflare Worker with validated, authorized endpoints.
- **Database:** Cloudflare D1.
- **Scheduling:** Cloudflare Cron Trigger invoking a scheduled Worker handler.
- **Notifications:** Standard Web Push using VAPID, Push API, Notifications API, and a service worker.
- **Session security:** Shared family access code exchanged for a secure session cookie.
- **Validation:** Reuse existing validation libraries if present; otherwise select a lightweight schema-validation approach.

The API and scheduled notification worker may share implementation code, but scheduled processing must be deployed and configured independently of Pages if the existing Pages setup does not support the required scheduled handler.

Do not add a separate database, queue, authentication provider, or external notification platform without a demonstrated need.

### Notification architecture

1. An authorized family member creates or edits a medication schedule.
2. The API validates and persists the schedule in D1.
3. Each authorized iPhone registers its own Web Push subscription.
4. A scheduled Worker periodically queries for due reminder occurrences.
5. The Worker creates an idempotent delivery record and sends the Web Push request.
6. The service worker displays the notification when delivered.
7. Opening the notification navigates to the relevant medication or daily schedule.
8. The user explicitly confirms whether the dose was taken.

A successful push request is not proof that the notification appeared or was seen. Never mark a dose as taken merely because a notification was sent or dismissed.

## 5. Shared Access Without Individual Accounts

The application must not require individual accounts, but it must not expose family health records through unauthenticated API endpoints.

Implement one shared family access mechanism:

- A strong, configurable family access code.
- Code verification on the server.
- A secure, expiring session cookie using `HttpOnly`, `Secure`, and an appropriate `SameSite` policy.
- Rate limiting for access-code attempts.
- Server-side authorization for every private API endpoint.
- CSRF protection where applicable to cookie-authenticated state-changing requests.
- A way to revoke or invalidate active sessions by rotating the family access code.
- No permanent authentication token in browser local storage.
- No secrets or database credentials in frontend bundles.

Authorized devices can remember their session until expiration. Individual family accounts, email verification, and per-user roles are out of scope.

The shared code is a practical compromise, not strong individual accountability. Anyone who obtains it may gain access to the same family records.

## 6. Grandparent Profiles

Create two initial profiles, configurable through the application.

Each profile should contain:
- Display name or family nickname.
- Optional avatar or simple identifying icon.
- Active/inactive status.
- Associated medication schedules.
- Medication history.
- Measurement history.
- Profile-specific notification preferences where appropriate.

Use a persistent profile selector in the application header or navigation.

Every medication, schedule, dose occurrence, and measurement must belong to the correct profile. Switching profiles must never mix their records.

Profile selection is not an authorization boundary. The backend must still enforce shared-session authorization for all records.

Avoid collecting unnecessary personal information, such as full birth dates, addresses, or government identifiers.

## 7. Core Screens

### A. Home / Today

Display:
- Selected grandparent.
- Current date.
- Next upcoming medication.
- Due or unconfirmed doses.
- Today's medication checklist.
- Latest SpO₂ and pulse readings with timestamps.
- A prominent Record Measurement action.
- Notification setup status when reminders are unavailable.

Use large typography, clear labels, strong contrast, and generous touch targets.

Do not use a single green status indicator to imply that the person is medically safe.

### B. Medications

Support:
- Medication list.
- Add, edit, pause, resume, and discontinue actions.
- Medication name.
- Form, such as tablet, capsule, liquid, or inhaler.
- Optional strength copied from the prescription or packaging.
- Prescribed instructions.
- Optional prescribed amount per dose.
- Schedule configuration.
- Start and end dates.
- Relevant notes.
- Confirmation before saving schedule changes.

Do not infer dosage, drug interactions, or medical instructions.

When a medication is discontinued, preserve its historical records. Do not delete historical dose records when editing or pausing a medication.

### C. Schedule Configuration

Support the initial recurrence patterns needed by the family:
- Daily at selected times.
- Selected weekdays at selected times.
- Start date and optional end date.
- Multiple reminder times.
- Time zone configuration, defaulting to the user's actual local time zone.
- Pause and resume.

Keep recurrence logic explicit. Do not implement complex prescription schedules unless an actual medication requires them.

Validate invalid times, conflicting configurations, and unsupported recurrence patterns.

When schedules change, prevent obsolete future reminders from being sent. Preserve past dose records.

### D. Dose Confirmation

Support these states:
- Upcoming.
- Due.
- Taken.
- Skipped.
- Unconfirmed.

Record:
- Scheduled occurrence time.
- Actual confirmation time, when applicable.
- Status.
- Optional note.
- Creation and correction timestamps.

Do not assume that an unrecorded dose was missed or that a notification indicates adherence.

Do not instruct users to take extra doses or change prescribed instructions when a dose is late or uncertain.

Provide an explicit correction flow for accidental confirmations.

### E. Record Measurement

Initially support pulse oximeter readings with:
- SpO₂ percentage.
- Pulse in beats per minute.
- Measurement time.
- Record creation time.
- Optional notes.
- Selected grandparent profile.

Allow editing an incorrect reading with an appropriate correction history.

Validate input ranges and numeric formats. Treat validation as protection against input errors, not as a medical judgment.

Do not generate universal medical thresholds, diagnoses, or treatment instructions.

### F. History

Provide:
- Chronological medication activity.
- Chronological measurements.
- Profile filter.
- Date filters.
- Clear timestamps and units.
- Visible distinction between recorded and unconfirmed doses.
- A way to correct mistaken records.

Keep charts and advanced analytics out of the initial release.

### G. Settings and Notifications

Provide:
- Selected profile and family access settings.
- Notification permission status.
- Push subscription status for the current device.
- Test notification action.
- Troubleshooting instructions.
- Backup/export options.
- Session invalidation or access-code rotation instructions where appropriate.

Never display "Notifications working" based solely on permission being granted or a successful server send request.

## 8. Database Design

Use D1 with foreign keys, appropriate indexes, constraints, and migrations.

Suggested tables:

### `family_settings`
- `id`
- `timezone`
- `created_at`
- `updated_at`

### `profiles`
- `id`
- `display_name`
- `avatar_key` or equivalent optional identifier
- `is_active`
- `created_at`
- `updated_at`

### `medications`
- `id`
- `profile_id`
- `name`
- `form`
- `strength`
- `prescribed_instructions`
- `prescribed_amount`
- `notes`
- `status`
- `start_date`
- `end_date`
- `created_at`
- `updated_at`

### `medication_schedules`
- `id`
- `medication_id`
- `recurrence_type`
- `recurrence_config`
- `timezone`
- `start_date`
- `end_date`
- `is_active`
- `created_at`
- `updated_at`

Use a normalized schedule representation where practical. Do not store arbitrary executable schedule expressions.

### `dose_occurrences`
- `id`
- `medication_id`
- `schedule_id`
- `scheduled_at_utc`
- `scheduled_local_date`
- `scheduled_local_time`
- `timezone`
- `status`
- `confirmed_at_utc`
- `notes`
- `created_at`
- `updated_at`

Enforce uniqueness for each intended scheduled occurrence so overlapping or repeated scheduler executions cannot create duplicate doses.

### `measurements`
- `id`
- `profile_id`
- `measurement_type`
- `spo2_percent`
- `pulse_bpm`
- `measured_at_utc`
- `created_at`
- `updated_at`
- `notes`
- `source`

### `push_subscriptions`
- `id`
- `device_label`
- `endpoint`
- `subscription_keys`
- `is_active`
- `created_at`
- `last_successful_send_at`
- `last_error_at`

Protect subscription data and restrict its access to authorized server-side code.

### `notification_deliveries`
- `id`
- `dose_occurrence_id`
- `push_subscription_id`
- `notification_type`
- `attempt_count`
- `status`
- `last_attempt_at`
- `provider_response_status`
- `created_at`
- `updated_at`

Use uniqueness constraints or equivalent idempotency logic for each occurrence, subscription, and reminder type.

Add an audit mechanism for important corrections, schedule changes, and medication discontinuation if the implementation can support it without excessive complexity.

All database access must go through authorized server-side code. Never expose D1 credentials or unrestricted database operations to the browser.

## 9. Reminder Scheduling and Delivery

This is a critical acceptance area.

### Scheduler

Use a Cloudflare Cron Trigger with an appropriate cadence, initially one minute if compatible with the selected Cloudflare plan and operational constraints.

Cron Triggers execute in UTC. All medication schedules must be converted to the correct UTC occurrence while retaining the intended local schedule and time zone.

The scheduler must:
1. Query a bounded window of due occurrences.
2. Exclude paused, discontinued, expired, or superseded schedules.
3. Create or retrieve the unique occurrence and delivery records.
4. Send due notifications to eligible subscriptions.
5. Record success and failure responses.
6. Retry transient failures using bounded retry logic.
7. Remove or deactivate subscriptions that are permanently invalid.
8. Avoid duplicate notifications after scheduler retries or deployment interruptions.
9. Prevent outdated schedules from sending notifications after edits.
10. Handle daylight-saving transitions correctly if applicable to the configured time zone.

A one-minute scheduler is not a guarantee of delivery at the exact scheduled second. Do not promise exact-time or exactly-once notification delivery.

### Push notification behavior

Use generic, privacy-conscious notification text by default, for example:

"Medication reminder — open the app to review your schedule."

Avoid displaying sensitive medication names or detailed health data on the lock screen by default.

Each iPhone must subscribe separately. Multiple devices may receive the same reminder, and each device's notification state must be handled without assuming that a notification on one device means a dose was taken.

Do not automatically send escalating caregiver alerts in the MVP.

### iPhone installation requirement

On supported iOS versions, Web Push requires the web app to be added to the Home Screen and the user to grant notification permission.

Provide a clear setup flow:
1. Explain how to add the PWA to the Home Screen.
2. Request permission only after the user explicitly initiates notification setup.
3. Register the service worker.
4. Subscribe to Web Push.
5. Register the subscription with the authorized backend.
6. Send a test notification.
7. Explain how to troubleshoot permissions and device settings.

Test the deployed HTTPS application on the actual target iPhones. Do not rely solely on desktop browser tests.

Reference: https://webkit.org/blog/13878/

## 10. Data Synchronization and Offline Behavior

D1 is the authoritative shared database.

- All devices read and write through the authorized API.
- Show loading, success, and failure states.
- Do not silently discard failed writes.
- Avoid optimistic updates that make unsaved health records appear permanently saved.
- Provide a clear indication when records cannot be synchronized.
- Cache application assets for offline launch where supported.
- Initially prioritize offline viewing of previously loaded information.
- If offline record creation is implemented, store pending entries locally and synchronize them safely when connectivity returns.

Do not introduce complex offline conflict resolution unless the family workflow requires it.

Provide export and restore functionality for important records. Cloud database persistence alone is not a complete backup strategy.

## 11. Security and Privacy

Required safeguards:
- Shared access-code verification and secure sessions.
- Server-side authorization on all private API routes.
- Rate limiting and input validation.
- SQL prepared statements.
- CSRF protections where applicable.
- Restrictive CORS policy.
- HTTPS-only deployment.
- Secure cookie configuration.
- Secrets stored in Cloudflare Worker secrets.
- No sensitive data or credentials in client-side environment variables.
- No unnecessary third-party analytics.
- Safe error messages that do not expose records or secrets.
- Backup/export and deletion safeguards.
- Restrict push subscription access and redact sensitive data from logs.

Because the application handles health-related records, minimize the amount of data collected and explain that all devices sharing the family access code can access the same records.

## 12. UI and Accessibility

The design must feel like a carefully designed utility, not a generic healthcare dashboard.

Requirements:
- Mobile-first iPhone layout.
- Large, readable text.
- High contrast.
- Large touch targets.
- Clear visual hierarchy.
- Simple bottom navigation or another easily understood navigation pattern.
- Explicit labels instead of ambiguous icons.
- Minimal typing.
- Immediate feedback after saving a dose or measurement.
- Confirmation for destructive actions.
- Accessible form errors.
- Support for Dynamic Type and browser zoom where practical.
- No unnecessary charts, gradients, animations, or decorative medical graphics.
- Avoid color-only status communication.

Prioritize usability for older adults over visual complexity.

## 13. Implementation Phases

### Phase 1 — Repository inspection and technical validation
- Inspect the existing project.
- Verify Cloudflare deployment and bindings.
- Confirm the chosen shared-access mechanism.
- Validate iOS Home Screen installation and Web Push feasibility.
- Define schema migrations and API contracts.

**Exit criteria:** Architecture and notification approach are verified before substantial feature development.

### Phase 2 — Core UI and profiles
- Implement the mobile navigation.
- Implement profile selection.
- Implement Home, Medications, Schedule, Measurements, History, and Settings screens.
- Use sample data until screen behavior is stable.

**Exit criteria:** All core screens work with realistic sample data and accessible layouts.

### Phase 3 — D1 and API
- Create database migrations.
- Implement the shared access gate and sessions.
- Implement profile and medication CRUD.
- Implement schedule persistence.
- Implement dose confirmation and correction.
- Implement measurement recording and history.
- Add validation and error handling.

**Exit criteria:** Multiple authorized devices can read and modify the same records correctly.

### Phase 4 — Web Push and scheduled processing
- Implement service worker notification handling.
- Implement subscription registration and removal.
- Implement VAPID-based Web Push delivery.
- Configure the scheduled Worker.
- Implement occurrence generation and idempotent delivery.
- Handle retries and outdated schedules.
- Implement the notification setup and test flow.

**Exit criteria:** Real iPhones can receive test and scheduled notifications under the tested conditions, with documented limitations.

### Phase 5 — Hardening and family trial
- Test schedule boundaries and time-zone handling.
- Test duplicate prevention.
- Test profile isolation at the application-data level.
- Test access-control failures.
- Test offline and failed-network scenarios.
- Test backup and restore.
- Test on the actual iPhones.
- Resolve usability issues found during a supervised family trial.

**Exit criteria:** Core workflows are reliable, records are protected, and the family understands notification limitations.

## 14. Testing Requirements

Test at minimum:

- Medication creation, editing, pausing, resuming, and discontinuation.
- Daily and selected-weekday schedules.
- Multiple reminder times.
- Start/end date boundaries.
- Schedule changes near a reminder time.
- Duplicate scheduler executions.
- Push subscription expiration and renewal.
- Notification permission denied or revoked.
- App not open when a notification is sent.
- Multiple devices subscribed simultaneously.
- Failed network and API requests.
- Incorrect measurement entries and corrections.
- Profile switching without cross-profile data leakage.
- Shared access-code rate limiting and session expiration.
- Unauthorized API requests.
- Data export and restore.
- Production build and Cloudflare deployment configuration.

Use automated tests for schedule generation, date boundaries, API authorization, validation, and idempotency. Real-device notification tests are also required.

## 15. Definition of Done

The MVP is complete only when:

- Family members can access the same records from authorized iPhones without individual account creation.
- The two grandparent profiles remain clearly separated.
- Medication schedules can be configured and edited.
- Due reminders are generated and sent through Web Push.
- Notification delivery failures are recorded and handled.
- Dose confirmation never occurs automatically from notification delivery.
- Manual SpO₂ and pulse readings can be recorded, corrected, and reviewed.
- The application provides a useful history.
- The notification setup explains the iOS Home Screen requirement.
- Important data is not silently lost on failed requests.
- Access controls prevent unauthenticated access to private records.
- The app passes automated tests and actual iPhone testing.
- Known limitations are documented.

## 16. Explicitly Out of Scope

Do not implement these in the MVP:
- Individual user accounts.
- AI-generated medication schedules.
- Diagnosis or medical risk prediction.
- Automatic dosage recommendations.
- Drug-interaction checking.
- Bluetooth device integration.
- Automatic emergency escalation.
- Complex caregiver roles.
- Advanced analytics.
- Commercial subscriptions or billing.
- Android-specific optimization.

## 17. Official Technical References

Use current official documentation during implementation:

- Apple Web Push: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- WebKit iOS Web Push: https://webkit.org/blog/13878/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare D1 Worker API: https://developers.cloudflare.com/d1/worker-api/
- Cloudflare Workers bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- MDN Notifications API: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API
- MDN Service Workers: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

Verify current API behavior, compatibility, pricing, and deployment requirements rather than relying on assumptions.

## Final Implementation Principle

Build a dependable family utility with the smallest architecture that satisfies shared access and server-triggered reminders. Prioritize correct medication records, understandable interactions, privacy, and tested notification behavior over extra features.

Do not represent the PWA as a guaranteed medication alarm or medical decision system. Its role is to help the family organize schedules and records while clearly communicating its limitations.