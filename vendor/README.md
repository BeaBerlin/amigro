# Browser dependencies

These local ES modules keep the site buildless and avoid runtime CDN requests.

- `async-storage/`: web modules from `@react-native-async-storage/async-storage` **3.1.1**, published npm tarball. [Upstream source and license](https://github.com/react-native-async-storage/async-storage/tree/%40react-native-async-storage/async-storage%403.1.1).
- `idb/`: `build/index.js` and `LICENSE` from **8.0.3**, the AsyncStorage dependency. [Upstream](https://github.com/jakearchibald/idb).

Each `provenance.json` records the downloaded tarball URL and the npm SHA-512 integrity value, which was verified before extraction. Source-map comments were removed because maps are not shipped here. The only import change is `idb` → `../../idb/index.js` in `IndexedDBConnectionRegistry.js`. All runtime logic is upstream code, and MIT licenses are included alongside it.

Amigro imports `getLegacyStorage()` from the official AsyncStorage web implementation. This is the same compatibility backend used by AsyncStorage's default export in version 3: Promise-based storage backed by `window.localStorage`. It preserves existing `amigro.progress.v1` data without moving it to a separate IndexedDB database. The selected web modules require no React or native runtime. See the official [version 3 migration guide](https://github.com/react-native-async-storage/async-storage/blob/%40react-native-async-storage/async-storage%403.1.1/docs/migration-to-3.md).
