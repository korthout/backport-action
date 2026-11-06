# Documenting the action

- Input docs live in two places: `README.md` (under `## Inputs`) and `action.yml` (`description:` field). Keep them in sync — any change to one must be mirrored in the other.
- Inputs are sorted alphanumerically in both places. README examples show the default value.
- Docs say "pull request", not "PR".
- Document an experimental feature only in its sections of the `experimental` input, including how it affects other inputs and anything else the action does. The rest of the README and `action.yml` don't mention it, not even with a pointer: its behavior may change in any release, and users who opt in read its sections. When a minor release adds the regular inputs that replace it, their docs may name the keys they replace. Once promotion completes, reconsider where each part of its docs belongs.
