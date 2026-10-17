# Vendored pokersolver 2.1.4

`pokersolver.js` is the unmodified upstream runtime used by
`server/poker-evaluator.js` for Hold'em showdown evaluation. Keep this directory's
CommonJS package boundary and `LICENSE.md` in all runtime exports.

Project coverage: `tests/poker-evaluator.test.js`, `tests/poker-engine.test.js` and
`tests/release.test.js`. Upstream Mocha tests, original README/package metadata and
Bower manifest are preserved in `archive/vendor/pokersolver/` as reference material.
They are not part of the project's test command.

Upstream: https://github.com/goldfire/pokersolver — MIT, James Simpson/GoldFire Studios.
