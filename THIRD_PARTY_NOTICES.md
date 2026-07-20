# Third-party notices

AccessPatch EU is licensed under the MIT License. The project uses the
following direct npm dependencies at the exact versions recorded in
`package.json` and `package-lock.json`.

## Runtime and build dependencies

| Package | Version | License | Project |
| --- | --- | --- | --- |
| `@axe-core/playwright` | 4.12.1 | MPL-2.0 | https://github.com/dequelabs/axe-core-npm |
| `@vitejs/plugin-react` | 6.0.3 | MIT | https://github.com/vitejs/vite-plugin-react |
| `axe-core` | 4.12.1 | MPL-2.0 | https://www.deque.com/axe/ |
| `commander` | 15.0.0 | MIT | https://github.com/tj/commander.js |
| `react` | 19.2.7 | MIT | https://react.dev/ |
| `react-dom` | 19.2.7 | MIT | https://react.dev/ |
| `vite` | 8.1.5 | MIT | https://vite.dev/ |
| `zod` | 4.4.3 | MIT | https://zod.dev/ |

## Development and test dependencies

| Package | Version | License | Project |
| --- | --- | --- | --- |
| `@playwright/test` | 1.61.1 | Apache-2.0 | https://playwright.dev/ |
| `@types/node` | 24.10.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/react` | 19.2.14 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/react-dom` | 19.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `playwright` | 1.61.1 | Apache-2.0 | https://playwright.dev/ |
| `tsx` | 4.23.1 | MIT | https://tsx.is/ |
| `typescript` | 7.0.2 | Apache-2.0 | https://www.typescriptlang.org/ |
| `vitest` | 4.1.10 | MIT | https://vitest.dev/ |

The lockfile is the authoritative inventory of transitive npm packages.
Package-specific license and notice files are distributed in each installed
package and remain controlling for that package. In particular, `axe-core` and
`@axe-core/playwright` are made available under Mozilla Public License 2.0,
while Playwright and TypeScript are made available under Apache License 2.0.
No third-party package listed here is relicensed by the AccessPatch EU MIT
License.

## Assets

The checked-in visual concepts and product artwork were generated specifically
for AccessPatch EU with OpenAI image generation. The product interface uses
code-native React, HTML, CSS, and original inline SVG rather than third-party
logos. No downloaded stock photography, music, video, logo, animation, or
sound effect is included.

The English demo narration was synthesized locally from the checked-in
`video/narration.txt` script with the `af_nova` voice distributed for
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), whose model card
licenses the model weights under Apache-2.0. HyperFrames invoked the local
[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) runtime, distributed
under the MIT License. The composition and render commands pin
[HyperFrames 0.7.64](https://www.npmjs.com/package/hyperframes/v/0.7.64),
distributed under Apache-2.0. The narration is synthetic and does not
impersonate or identify a real person. It was loudness-normalized locally with
FFmpeg; no music or sound-effect track is used. These production tools are not
bundled as application runtime dependencies.

Asset creators, dimensions, modifications, status, and SHA-256 digests are
recorded in `assets/ASSET_LEDGER.md`.
