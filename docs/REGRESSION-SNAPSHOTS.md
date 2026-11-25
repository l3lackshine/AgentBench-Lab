# Snapshot & Regression History (v0.6.0)

- Save package file inventory, deterministic content fingerprints, routing selections, and scenario outcomes as a named snapshot.
- Compare two snapshots for added/removed/modified files, Agent/Skill routing changes, and scenario status/routing changes.
- Export/import a versioned JSON bundle (maximum 5 MB per import, 200 records) and export a Markdown report.
- Browser persistence uses `localStorage` on the current browser profile only. It is not server persistence, account storage, or cross-device sync. Export backups before clearing browser data.
- Fingerprints use FNV-1a 32-bit for deterministic change detection; they are not cryptographic hashes and must not be used for security or integrity verification.
- Scenario assertions still validate routing/skill selection only. They do not execute Agent prompts or evaluate generated answer quality.
