# Plan: Duplicate Exclusion and Audit Enhancements

Implement a automated validation to ensure duplicates in PDFs are not double-counted and provide tools to audit and fix existing duplicates.

## User Review Required

> [!IMPORTANT]
> The deduplication logic will use a combination of Date, Amount, Description, and ERP Code to identify unique transactions. If these fields are identical, the system will treat them as potential duplicates.

- Should we allow the user to *force* the import of a duplicate if they confirm it's a separate transaction?
- Should the "Clean Duplicates" button in Audit remove transactions based on identical fingerprints?

## Proposed Changes

### Database & Backend
#### [import-jobs.functions.ts]
- Update `diagnoseImportJob` to identify transactions that are already in the database with the same fingerprint.
- Add `cleanDuplicateTransactions` server function to delete transactions with duplicate fingerprints within the same company.

#### [process-import-jobs.ts]
- Enhance the fingerprinting logic to be even more robust.
- Ensure the `existingSet` lookup correctly handles both current and legacy fingerprints to prevent re-importing data processed by older parser versions.

### Import UI
#### [erp-pdf-import-page.tsx]
- Add a toggle/option: "Atualizar lançamentos existentes e remover ausentes" (Update existing and remove missing).
- Implement logic in `importMut` to send this flag to the backend if selected.

### Audit & Diagnostics
#### [dre-audit-page.tsx]
- Add a new inconsistency reason: `duplicidade_detectada` (Duplicate detected).
- Add a "Excluir Duplicidades" (Delete Duplicates) button in the bulk actions bar.
- Add a KPI card for total duplicates found.

#### [dre-audit.functions.ts]
- Update `getDreAudit` to identify transactions sharing the same fingerprint.
- Implement `deleteBulkTransactions` server function.

## Technical Details
- **Fingerprint Logic**: `sha256(companyId | date | kind | amountCents | normalize(description) | docNumber | erpCode)`.
- **Deduplication**: Use a windowed approach in the worker to check for existing fingerprints before insertion.
- **Audit logic**: Group transactions by `fingerprint` and `company_id`. Any group with `count > 1` is an issue.

## Validation Plan
- Perform a test import of a PDF with known duplicates (already handled by the parser, but verifying the DB check).
- Run the Audit tool on the current dataset to see if it correctly identifies the 8 legitimate vs 680 illegitimate duplicates mentioned in history.
- Verify that "Delete Duplicates" only removes the redundant copies, leaving one unique instance.
