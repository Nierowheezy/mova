// api-e2e.mjs - rerunnable live API E2E for the Mova backend.
// Registers fresh users and exercises every endpoint the frontend calls.
//
// Requires the dev servers to be running:
//   backend  :8000   npm run dev   (backend-node)
//   frontend :5173   npm run dev   (frontend) - not strictly needed, but the
//                                              backend must be reachable
//
// Usage:  node e2e/api-e2e.mjs        (from frontend/)
//         npm run test:e2e:api

const BASE = process.env.API_BASE || "http://localhost:8000/api/v1";
const PASSWORD = "Passw0rd!";
const stamp = Date.now();
const EMAIL_A = `mova-api-a-${stamp}@test.dev`;
const EMAIL_B = `mova-api-b-${stamp}@test.dev`;
const ADMIN = { email: "admin@fintech.com", password: "Admin123!" };

let passed = 0;
let failed = 0;
const results = [];
const ok = (name, cond, extra = "") => {
    if (cond) {
        passed++;
        results.push(`PASS  ${name}`);
    } else {
        failed++;
        results.push(`FAIL  ${name} ${extra}`);
    }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
          });

async function api(method, path, body, token, cookie) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie") || "";
    let json = null;
    try {
        json = await res.json();
    } catch {
        json = { raw: await res.text() };
    }
    return { status: res.status, json, setCookie };
}

const d = (r) => r?.json?.data ?? {};

console.log(`== Mova API E2E  (${new Date().toISOString()}) ==`);
console.log(`users: ${EMAIL_A} / ${EMAIL_B}\n`);

// ---- Auth + profile -------------------------------------------------------
const regA = await api("POST", "/auth/register", { email: EMAIL_A, password: PASSWORD, confirmPassword: PASSWORD });
ok("register A success", regA.json?.success === true, JSON.stringify(regA.json).slice(0, 160));
const tokA = regA.json?.data?.accessToken;
ok("register A accessToken", typeof tokA === "string" && tokA.length > 20);

const loginA = await api("POST", "/auth/login", { email: EMAIL_A, password: PASSWORD });
ok("login A success", loginA.json?.success === true);
const cookieA = loginA.setCookie || "";
ok("login A sets refresh cookie", cookieA.includes("refresh="), cookieA.split(";")[0].slice(0, 40));

const profA = await api("GET", "/user/profile", undefined, tokA);
const walletA = profA.json?.data?.wallet;
ok("profile A wallet", typeof walletA?.walletId === "string");
const walletAId = walletA?.walletId;

const refreshA = await api("POST", "/auth/refresh", {}, undefined, cookieA.split(";")[0]);
ok("auth refresh via cookie", refreshA.json?.success === true, JSON.stringify(refreshA.json).slice(0, 120));
const tokA2 = refreshA.json?.data?.accessToken || tokA;

const profA2 = await api("GET", "/user/profile", undefined, tokA2);
ok("profile A after refresh (token still valid)", profA2.json?.success === true);

const regB = await api("POST", "/auth/register", { email: EMAIL_B, password: PASSWORD, confirmPassword: PASSWORD });
ok("register B success", regB.json?.success === true);
const loginB = await api("POST", "/auth/login", { email: EMAIL_B, password: PASSWORD });
const tokB = loginB.json?.data?.accessToken;
const profB = await api("GET", "/user/profile", undefined, tokB);
const walletBId = profB.json?.data?.wallet?.walletId;
ok("profile B wallet", typeof walletBId === "string");

// ---- Set PIN --------------------------------------------------------------
const pin = await api("POST", "/user/set-pin", { pin: "1234" }, tokA2);
ok("set-pin A", pin.json?.success === true, JSON.stringify(pin.json).slice(0, 160));

// ---- Upload -----------------------------------------------------------------
const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);
const fd = new FormData();
fd.append("file", new Blob([png], { type: "image/png" }), "id.png");
const upload = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokA2}` },
    body: fd,
});
const uploadJson = await upload.json();
const fileId = uploadJson?.data?.fileId ?? uploadJson?.data?.data?.fileId;
ok("upload PNG returns fileId", typeof fileId === "string" && fileId.length > 0, JSON.stringify(uploadJson).slice(0, 160));
await sleep(300);

// ---- KYC -------------------------------------------------------------------
const kycSubmit = await api("POST", "/kyc", {
    fullName: "API E2E Tester",
    dateOfBirth: "1990-05-10",
    idType: "NATIONAL_ID",
    idImage: fileId,
}, tokA2);
ok("kyc submit A", kycSubmit.json?.success === true, JSON.stringify(kycSubmit.json).slice(0, 200));

const kycProf = await api("GET", "/kyc/profile", undefined, tokA2);
const kycStatusBefore = kycProf.json?.data?.verificationStatus;
ok("kyc profile has record + status", kycProf.json?.success === true && kycStatusBefore);

const adminLogin = await api("POST", "/auth/login", { email: ADMIN.email, password: ADMIN.password });
const tokAdmin = adminLogin.json?.data?.accessToken;
ok("admin login", adminLogin.json?.success === true);

const kycId = kycProf.json?.data?.id;
const approve = await api("POST", `/admin/kyc/${kycId}/approve`, {}, tokAdmin);
ok("admin approve KYC", approve.json?.success === true, JSON.stringify(approve.json).slice(0, 160));

const kycProfAfter = await api("GET", "/kyc/profile", undefined, tokA2);
ok("kyc VERIFIED after approve", kycProfAfter.json?.data?.verificationStatus === "VERIFIED");

// ---- Beneficiaries ------------------------------------------------------------
const benAdd = await api("POST", "/beneficiaries", { walletId: walletBId }, tokA2);
ok("add beneficiary B", benAdd.json?.success === true, JSON.stringify(benAdd.json).slice(0, 160));
const benId = benAdd.json?.data?.id ?? benAdd.json?.data?.beneficiary?.id;
const benList = await api("GET", "/beneficiaries", undefined, tokA2);
ok(
    "beneficiary listed",
    Array.isArray(benList.json?.data) && benList.json.data.some((b) => b?.walletId === walletBId),
);
if (benId) {
    const benDel = await api("DELETE", `/beneficiaries/${benId}`, undefined, tokA2);
    ok("delete beneficiary", benDel.status === 200 || benDel.json?.success !== false);
    const benList2 = await api("GET", "/beneficiaries", undefined, tokA2);
    ok("beneficiary removed", !Array.isArray(benList2.json?.data) || !benList2.json.data.some((b) => b?.walletId === walletBId));
}

// ---- Deposit (Stripe test PM) ---------------------------------------------------
const dep = await api("POST", "/deposit", { paymentMethodId: "pm_card_visa", amount: 100, idempotencyKey: uuid() }, tokA2);
const depData = dep.json?.data ?? {};
ok("deposit pm_card_visa success", dep.json?.success === true, JSON.stringify(dep.json).slice(0, 200));
ok("deposit returns reference (depositId)", typeof (depData.depositId ?? depData.transactionId) === "string", JSON.stringify(depData).slice(0, 200));
ok("deposit is PENDING until webhook credits", depData.status === "PENDING", JSON.stringify(depData).slice(0, 160));
// The wallet is credited ONLY by the Stripe payment_intent.succeeded webhook,
// which cannot fire in a local dev run (no webhook delivery). A fresh user
// therefore stays at $0, and the savings/transfer sections below exercise
// their funds guards rather than a full money movement.

// ---- Savings ------------------------------------------------------------------
const sav = await api("POST", "/savings/create", { name: "API E2E Goal", targetAmount: 500, targetDate: "2027-12-31" }, tokA2);
const goalUuid = sav.json?.data?.uuid ?? sav.json?.data?.goal?.uuid;
ok("savings create returns uuid", typeof goalUuid === "string", JSON.stringify(sav.json).slice(0, 200));

const savList = await api("GET", "/savings", undefined, tokA2);
ok("savings list contains goal", Array.isArray(savList.json?.data) && savList.json.data.some((g) => g?.uuid === goalUuid));

const savDetail = await api("GET", `/savings/${goalUuid}`, undefined, tokA2);
ok("savings detail", savDetail.json?.success === true, JSON.stringify(savDetail.json).slice(0, 160));

const savDep = await api("POST", "/savings/deposit", { uuid: goalUuid, amount: 20 }, tokA2);
ok("savings deposit guard (unfunded wallet rejected)", savDep.json?.success === false, JSON.stringify(savDep.json).slice(0, 160));

const savW = await api("POST", "/savings/withdraw", { uuid: goalUuid, amount: 9999 }, tokA2);
ok("savings withdraw guard (goal not reached rejected)", savW.json?.success === false, JSON.stringify(savW.json).slice(0, 160));

// ---- Transfer -------------------------------------------------------------------
const tr = await api("POST", "/transfer", { walletId: walletBId, amount: 15, transactionPin: "1234" }, tokA2);
ok("transfer guard (unfunded wallet rejected)", tr.json?.success === false, JSON.stringify(tr.json).slice(0, 200));

// ---- Transactions ----------------------------------------------------------------
const txs = await api("GET", "/transactions", undefined, tokA2);
ok("transactions list is array", Array.isArray(txs.json?.data), JSON.stringify(txs.json).slice(0, 160));
const firstRef = Array.isArray(txs.json?.data) ? txs.json.data[0]?.reference : undefined;

const txDetailRef = firstRef;
if (txDetailRef) {
    const txDet = await api("GET", `/transactions/${txDetailRef}`, undefined, tokA2);
    ok("transactions detail by reference", txDet.json?.success === true, JSON.stringify(txDet.json).slice(0, 160));
}

// ---- Notifications -----------------------------------------------------------------
const notifs = await api("GET", "/notifications", undefined, tokA2);
ok("notifications list is array", Array.isArray(notifs.json?.data), JSON.stringify(notifs.json).slice(0, 120));
const notifId = Array.isArray(notifs.json?.data) ? notifs.json.data[0]?.id : undefined;
if (notifId) {
    const nRead = await api("POST", `/notifications/${notifId}/read`, {}, tokA2);
    ok("notification mark-read", nRead.status === 200 || nRead.json?.success !== false);
}
const nReadAll = await api("POST", "/notifications/read-all", {}, tokA2);
ok("notifications read-all", nReadAll.status === 200 || nReadAll.json?.success !== false);

// ---- Wallet / withdraw guard ----------------------------------------------------------
const myWallet = await api("GET", `/wallet/${walletAId}`, undefined, tokA2);
ok("wallet detail A", myWallet.json?.success === true, JSON.stringify(myWallet.json).slice(0, 160));

const wd = await api("POST", "/withdraw", { amount: 5, idempotencyKey: uuid() }, tokA2);
console.log(`   (withdraw attempt -> ${JSON.stringify(wd.json).slice(0, 160)})`);
ok("withdraw guard rejects (stripe connect not onboarded)", wd.json?.success === false);

// ---- Logout -------------------------------------------------------------------------
const logout = await api("POST", "/auth/logout", {}, tokA2);
ok("logout", logout.status === 200 || logout.json?.success !== false);

// ---- Summary -------------------------------------------------------------------------
console.log("\n" + results.join("\n"));
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);