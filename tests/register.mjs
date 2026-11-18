// Hook agar Node bisa meresolve impor relatif tanpa ekstensi (./candles -> ./candles.ts)
import { register } from "node:module";
register("./resolve-ts.mjs", import.meta.url);
