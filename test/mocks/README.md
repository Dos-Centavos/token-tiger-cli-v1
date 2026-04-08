# Mocks (`test/unit/mocks`)

Shared fixture data for **unit** tests: session objects, API payloads, and errors that stand in for external dependencies (same idea as `mocks/util-mocks.js` in the testing example). Import from `test/unit/**` as needed.

Integration tests under `test/integration/` do not use these mocks; they exercise the real CLI process.
