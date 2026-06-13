# Release Process

Use this checklist every time a new git tag release is created.

## Rule

The app version in `package.json` must always match the git tag version.

Examples:

- git tag `v1.1.0` -> `package.json` version must be `1.1.0`
- git tag `v2.0.3` -> `package.json` version must be `2.0.3`

Do not create or push a release tag until `package.json` has been updated.

## Release Steps

1. Update `package.json` `version` to the target release number.
2. Update `CHANGELOG.md` with the new version and its notable changes.
3. Verify the UI version display now shows the same version.
4. Commit the release-ready changes.
5. Push `main`.
6. Create the matching git tag with a `v` prefix.
7. Push the git tag.

Example:

1. Set `package.json` version to `1.2.0`
2. Update `CHANGELOG.md`
3. Commit changes
4. `git push origin main`
5. `git tag v1.2.0`
6. `git push origin v1.2.0`

## Codex Note

When the user asks to create or push a git tag release, always:

- update `package.json` first if it does not already match the requested version
- update `CHANGELOG.md` for that version before tagging
