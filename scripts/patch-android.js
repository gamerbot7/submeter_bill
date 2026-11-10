// Run after `npx cap add android`: adds permissions + a notification icon to the generated Android project
const fs = require("fs");
const path = require("path");
const base = path.join(__dirname, "..", "android", "app", "src", "main");
const mf = path.join(base, "AndroidManifest.xml");
let x = fs.readFileSync(mf, "utf8");

const perms = [
  "android.permission.CAMERA",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK"
];
let add = perms.filter(p => !x.includes(p)).map(p => `    <uses-permission android:name="${p}" />`).join("\n");
if (!x.includes("android.hardware.camera")) add += "\n    <uses-feature android:name=\"android.hardware.camera\" android:required=\"false\" />";
if (add) x = x.replace("</manifest>", add + "\n</manifest>");
fs.writeFileSync(mf, x);

const dr = path.join(base, "res", "drawable");
fs.mkdirSync(dr, { recursive: true });
fs.writeFileSync(path.join(dr, "ic_stat_meter.xml"),
`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFF" android:pathData="M13,2 L4,14 h6 l-1,8 l9,-12 h-6 z"/>
</vector>
`);
console.log("Android project patched.");
