# Legacy dependency pull request audit

Reviewed on 2026-09-09 against recovery revision `99e3a7e3ea4ce991dcb2b77fc544917c84b17fd1`.

All 78 open PRs (#1–#78) target the legacy application on `main` and change only
dependency manifests or generated lockfiles. Their requested upgrades are
superseded by the rebuilt application: 74 target removed dependencies, three
target versions already exceeded, and one combines both cases. Close these PRs
without merging their patches after integrating the rebuilt application.

## Evidence and limits

- All 99 manifest upgrades were compared with the root and frontend manifests
  and the current root workspace lockfile.
- The 101 available added lockfile resolutions were also compared; no shared
  package was below a version proposed by these PRs.
- GitHub omitted 41 large frontend lockfile patches from its responses. Their
  manifest patches and file metadata were available; the rebuilt application
  removes that standalone `frontend/package-lock.json` entirely.
- A clean `npm ci` in the isolated integration checkout reported zero known
  vulnerabilities. This point-in-time advisory result is separate from the
  supersession decision and does not prove the application is vulnerability-free.
- This audit preserves PR and branch history. It does not delete branches or
  merge obsolete dependency graphs.

Current retained dependencies relevant to these PRs are Express `5.2.1`,
React Router `7.18.3`, React Redux `9.3.0`, and Redux `5.0.1`.

## Per-PR disposition

| Pull request | Requested dependencies | Reason superseded |
| --- | --- | --- |
| [#1](https://github.com/NadavsSchwartz/hotel-revealer/pull/1) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#2](https://github.com/NadavsSchwartz/hotel-revealer/pull/2) | `lint-staged` | Dependencies removed from the manifests and workspace lockfile. |
| [#3](https://github.com/NadavsSchwartz/hotel-revealer/pull/3) | `mongoose` | Dependencies removed from the manifests and workspace lockfile. |
| [#4](https://github.com/NadavsSchwartz/hotel-revealer/pull/4) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#5](https://github.com/NadavsSchwartz/hotel-revealer/pull/5) | `express` | Current versions exceed the requested upgrades. |
| [#6](https://github.com/NadavsSchwartz/hotel-revealer/pull/6) | `moment` | Dependencies removed from the manifests and workspace lockfile. |
| [#7](https://github.com/NadavsSchwartz/hotel-revealer/pull/7) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#8](https://github.com/NadavsSchwartz/hotel-revealer/pull/8) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#9](https://github.com/NadavsSchwartz/hotel-revealer/pull/9) | `nodemon` | Dependencies removed from the manifests and workspace lockfile. |
| [#10](https://github.com/NadavsSchwartz/hotel-revealer/pull/10) | `moment` | Dependencies removed from the manifests and workspace lockfile. |
| [#11](https://github.com/NadavsSchwartz/hotel-revealer/pull/11) | `mongoose` | Dependencies removed from the manifests and workspace lockfile. |
| [#12](https://github.com/NadavsSchwartz/hotel-revealer/pull/12) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#13](https://github.com/NadavsSchwartz/hotel-revealer/pull/13) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#14](https://github.com/NadavsSchwartz/hotel-revealer/pull/14) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#15](https://github.com/NadavsSchwartz/hotel-revealer/pull/15) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#16](https://github.com/NadavsSchwartz/hotel-revealer/pull/16) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#17](https://github.com/NadavsSchwartz/hotel-revealer/pull/17) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#18](https://github.com/NadavsSchwartz/hotel-revealer/pull/18) | `nodemon` | Dependencies removed from the manifests and workspace lockfile. |
| [#19](https://github.com/NadavsSchwartz/hotel-revealer/pull/19) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#20](https://github.com/NadavsSchwartz/hotel-revealer/pull/20) | `nodemon` | Dependencies removed from the manifests and workspace lockfile. |
| [#21](https://github.com/NadavsSchwartz/hotel-revealer/pull/21) | `mongoose` | Dependencies removed from the manifests and workspace lockfile. |
| [#22](https://github.com/NadavsSchwartz/hotel-revealer/pull/22) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#23](https://github.com/NadavsSchwartz/hotel-revealer/pull/23) | `crypto-js` | Dependencies removed from the manifests and workspace lockfile. |
| [#24](https://github.com/NadavsSchwartz/hotel-revealer/pull/24) | `crypto-js` | Dependencies removed from the manifests and workspace lockfile. |
| [#25](https://github.com/NadavsSchwartz/hotel-revealer/pull/25) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#26](https://github.com/NadavsSchwartz/hotel-revealer/pull/26) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#27](https://github.com/NadavsSchwartz/hotel-revealer/pull/27) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#28](https://github.com/NadavsSchwartz/hotel-revealer/pull/28) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#29](https://github.com/NadavsSchwartz/hotel-revealer/pull/29) | `@testing-library/jest-dom`, `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#30](https://github.com/NadavsSchwartz/hotel-revealer/pull/30) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#31](https://github.com/NadavsSchwartz/hotel-revealer/pull/31) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#32](https://github.com/NadavsSchwartz/hotel-revealer/pull/32) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#33](https://github.com/NadavsSchwartz/hotel-revealer/pull/33) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#34](https://github.com/NadavsSchwartz/hotel-revealer/pull/34) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#35](https://github.com/NadavsSchwartz/hotel-revealer/pull/35) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#36](https://github.com/NadavsSchwartz/hotel-revealer/pull/36) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#37](https://github.com/NadavsSchwartz/hotel-revealer/pull/37) | `mongoose` | Dependencies removed from the manifests and workspace lockfile. |
| [#38](https://github.com/NadavsSchwartz/hotel-revealer/pull/38) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#39](https://github.com/NadavsSchwartz/hotel-revealer/pull/39) | `express` | Current versions exceed the requested upgrades. |
| [#40](https://github.com/NadavsSchwartz/hotel-revealer/pull/40) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#41](https://github.com/NadavsSchwartz/hotel-revealer/pull/41) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#42](https://github.com/NadavsSchwartz/hotel-revealer/pull/42) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#43](https://github.com/NadavsSchwartz/hotel-revealer/pull/43) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#44](https://github.com/NadavsSchwartz/hotel-revealer/pull/44) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#45](https://github.com/NadavsSchwartz/hotel-revealer/pull/45) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#46](https://github.com/NadavsSchwartz/hotel-revealer/pull/46) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#47](https://github.com/NadavsSchwartz/hotel-revealer/pull/47) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#48](https://github.com/NadavsSchwartz/hotel-revealer/pull/48) | `@testing-library/jest-dom`, `antd`, `axios`, `react-scripts`, `styled-components` | Dependencies removed from the manifests and workspace lockfile. |
| [#49](https://github.com/NadavsSchwartz/hotel-revealer/pull/49) | `axios`, `lint-staged`, `mongoose`, `nodemon` | Dependencies removed from the manifests and workspace lockfile. |
| [#50](https://github.com/NadavsSchwartz/hotel-revealer/pull/50) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#51](https://github.com/NadavsSchwartz/hotel-revealer/pull/51) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#52](https://github.com/NadavsSchwartz/hotel-revealer/pull/52) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#53](https://github.com/NadavsSchwartz/hotel-revealer/pull/53) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#54](https://github.com/NadavsSchwartz/hotel-revealer/pull/54) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#55](https://github.com/NadavsSchwartz/hotel-revealer/pull/55) | `mongoose` | Dependencies removed from the manifests and workspace lockfile. |
| [#56](https://github.com/NadavsSchwartz/hotel-revealer/pull/56) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#57](https://github.com/NadavsSchwartz/hotel-revealer/pull/57) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#58](https://github.com/NadavsSchwartz/hotel-revealer/pull/58) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#59](https://github.com/NadavsSchwartz/hotel-revealer/pull/59) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#60](https://github.com/NadavsSchwartz/hotel-revealer/pull/60) | `@testing-library/react`, `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#61](https://github.com/NadavsSchwartz/hotel-revealer/pull/61) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#62](https://github.com/NadavsSchwartz/hotel-revealer/pull/62) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#63](https://github.com/NadavsSchwartz/hotel-revealer/pull/63) | `@ant-design/icons`, `@testing-library/react`, `@testing-library/user-event`, `antd`, `react-redux`, `react-router-dom`, `react-scripts`, `redux`, `redux-saga` | Dependencies removed or already upgraded beyond the requested versions. |
| [#64](https://github.com/NadavsSchwartz/hotel-revealer/pull/64) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#65](https://github.com/NadavsSchwartz/hotel-revealer/pull/65) | `antd`, `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#66](https://github.com/NadavsSchwartz/hotel-revealer/pull/66) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#67](https://github.com/NadavsSchwartz/hotel-revealer/pull/67) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#68](https://github.com/NadavsSchwartz/hotel-revealer/pull/68) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#69](https://github.com/NadavsSchwartz/hotel-revealer/pull/69) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#70](https://github.com/NadavsSchwartz/hotel-revealer/pull/70) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#71](https://github.com/NadavsSchwartz/hotel-revealer/pull/71) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#72](https://github.com/NadavsSchwartz/hotel-revealer/pull/72) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#73](https://github.com/NadavsSchwartz/hotel-revealer/pull/73) | `react-router-dom` | Current versions exceed the requested upgrades. |
| [#74](https://github.com/NadavsSchwartz/hotel-revealer/pull/74) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#75](https://github.com/NadavsSchwartz/hotel-revealer/pull/75) | `antd`, `lodash`, `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#76](https://github.com/NadavsSchwartz/hotel-revealer/pull/76) | `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
| [#77](https://github.com/NadavsSchwartz/hotel-revealer/pull/77) | `axios` | Dependencies removed from the manifests and workspace lockfile. |
| [#78](https://github.com/NadavsSchwartz/hotel-revealer/pull/78) | `axios`, `react-scripts` | Dependencies removed from the manifests and workspace lockfile. |
